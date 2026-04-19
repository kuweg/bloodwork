import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { pool } from "./pool";

export type JobStatus =
  | "pending"
  | "processing"
  | "uploaded"
  | "skipped"
  | "error"
  | "stopped";

export interface Job {
  id: string;
  name: string;
  source: "upload" | "folder";
  status: JobStatus;
  startedAt?: number;
  endedAt?: number;
  measurementCount?: number;
  error?: string;
}

const CONCURRENCY_KEY = "bloodwork.concurrency";
const ADMIN_ONLY_ERROR = "Server data folder is available to admin only.";
const DEFAULT_FOLDER_IMPORT_MAX_CONCURRENCY = 3;
const BUSY_RETRY_ATTEMPTS = 4;
const BUSY_RETRY_BASE_MS = 500;

function resolveFolderImportMaxConcurrency(): number {
  const raw = Number(import.meta.env.VITE_FOLDER_IMPORT_MAX_CONCURRENCY);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return DEFAULT_FOLDER_IMPORT_MAX_CONCURRENCY;
}

const FOLDER_IMPORT_MAX_CONCURRENCY = resolveFolderImportMaxConcurrency();

export const CONCURRENCY_OPTIONS = [1, 3, 5, 8, 10, 15, 20] as const;
export type Concurrency = (typeof CONCURRENCY_OPTIONS)[number];

function resolveDefaultConcurrency(): Concurrency {
  const raw = Number(import.meta.env.VITE_DEFAULT_CONCURRENCY);
  if ((CONCURRENCY_OPTIONS as readonly number[]).includes(raw)) {
    return raw as Concurrency;
  }
  return 10;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/^\d{3}\s[^:]+:\s(.*)$/);
  const payload = (m?.[1] ?? "").trim();
  if (!payload) return raw;
  try {
    const parsed = JSON.parse(payload) as { detail?: unknown };
    if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.trim();
    }
  } catch {
    // keep original payload text
  }
  return raw;
}

function isBusyError(err: unknown): boolean {
  const msg = normalizeErrorMessage(err).toLowerCase();
  return msg.includes("database is busy") || msg.includes("database is locked");
}

/**
 * Owns the import queue and its fetches. Lifted above the tab switcher so
 * background uploads keep running and their progress stays visible when the
 * user navigates to another view and comes back.
 */
export function useImportController(
  onAnyChange: () => void,
  canUseServerFolder: boolean,
) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [folderFiles, setFolderFiles] = useState<string[] | null>(null);
  const [folderDir, setFolderDir] = useState<string | null>(null);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const jobsRef = useRef<Job[]>([]);
  const stopRequested = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const uploadFileByJobId = useRef(new Map<string, File>());
  const folderNameByJobId = useRef(new Map<string, string>());

  const [concurrency, setConcurrency] = useState<Concurrency>(() => {
    const raw = Number(localStorage.getItem(CONCURRENCY_KEY));
    return (CONCURRENCY_OPTIONS as readonly number[]).includes(raw)
      ? (raw as Concurrency)
      : resolveDefaultConcurrency();
  });

  useEffect(() => {
    localStorage.setItem(CONCURRENCY_KEY, String(concurrency));
  }, [concurrency]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    if (canUseServerFolder) return;
    setFolderFiles(null);
    setFolderDir(null);
  }, [canUseServerFolder]);

  const addJob = useCallback((job: Omit<Job, "id">): string => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setJobs((prev) => [{ id, ...job }, ...prev]);
    return id;
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const shouldStop = useCallback((id: string) => stopRequested.current.has(id), []);

  const clearFinished = useCallback(() => {
    setJobs((prev) => {
      const next = prev.filter(
        (j) => j.status === "processing" || j.status === "pending",
      );
      const active = new Set(next.map((j) => j.id));
      for (const id of stopRequested.current) {
        if (!active.has(id)) stopRequested.current.delete(id);
      }
      for (const [id] of controllers.current) {
        if (!active.has(id)) controllers.current.delete(id);
      }
      for (const [id] of uploadFileByJobId.current) {
        if (!active.has(id)) uploadFileByJobId.current.delete(id);
      }
      for (const [id] of folderNameByJobId.current) {
        if (!active.has(id)) folderNameByJobId.current.delete(id);
      }
      return next;
    });
  }, []);

  const stopJob = useCallback(
    (id: string) => {
      stopRequested.current.add(id);
      const controller = controllers.current.get(id);
      if (controller) controller.abort();
      updateJob(id, {
        status: "stopped",
        endedAt: Date.now(),
        error: undefined,
      });
      onAnyChange();
    },
    [onAnyChange, updateJob],
  );

  const stopAll = useCallback(() => {
    const now = Date.now();
    setJobs((prev) =>
      prev.map((j) => {
        if (j.status !== "pending" && j.status !== "processing") return j;
        stopRequested.current.add(j.id);
        return {
          ...j,
          status: "stopped",
          endedAt: now,
          error: undefined,
        };
      }),
    );
    for (const controller of controllers.current.values()) {
      controller.abort();
    }
    onAnyChange();
  }, [onAnyChange]);

  const runWithBusyRetries = useCallback(
    async <T>(id: string, task: () => Promise<T>): Promise<T> => {
      let attempt = 0;
      while (true) {
        try {
          return await task();
        } catch (err) {
          if (isAbortError(err) || shouldStop(id)) throw err;
          attempt += 1;
          if (!isBusyError(err) || attempt >= BUSY_RETRY_ATTEMPTS) throw err;
          await sleep(BUSY_RETRY_BASE_MS * attempt);
        }
      }
    },
    [shouldStop],
  );

  const runUploadJob = useCallback(
    async (id: string, file: File) => {
      if (shouldStop(id)) return;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      updateJob(id, {
        status: "processing",
        startedAt: Date.now(),
        endedAt: undefined,
        error: undefined,
      });
      try {
        const report = await runWithBusyRetries(id, () =>
          api.uploadReport(file, controller.signal),
        );
        if (shouldStop(id)) return;
        updateJob(id, {
          status: "uploaded",
          endedAt: Date.now(),
          measurementCount: report.measurements.length,
          error: undefined,
        });
      } catch (err) {
        if (isAbortError(err) || shouldStop(id)) {
          updateJob(id, {
            status: "stopped",
            endedAt: Date.now(),
            error: undefined,
          });
          return;
        }
        updateJob(id, {
          status: "error",
          endedAt: Date.now(),
          error: normalizeErrorMessage(err),
        });
      } finally {
        controllers.current.delete(id);
      }
      onAnyChange();
    },
    [onAnyChange, runWithBusyRetries, shouldStop, updateJob],
  );

  const runFolderJob = useCallback(
    async (id: string, filename: string) => {
      if (shouldStop(id)) return;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      updateJob(id, {
        status: "processing",
        startedAt: Date.now(),
        endedAt: undefined,
        error: undefined,
      });
      try {
        const result = await runWithBusyRetries(id, () =>
          api.ingestFileFromDir(filename, controller.signal),
        );
        if (shouldStop(id)) return;
        updateJob(id, {
          status: result.skipped_duplicate ? "skipped" : "uploaded",
          endedAt: Date.now(),
          measurementCount: result.report.measurements.length,
          error: undefined,
        });
      } catch (err) {
        if (isAbortError(err) || shouldStop(id)) {
          updateJob(id, {
            status: "stopped",
            endedAt: Date.now(),
            error: undefined,
          });
          return;
        }
        updateJob(id, {
          status: "error",
          endedAt: Date.now(),
          error: normalizeErrorMessage(err),
        });
      } finally {
        controllers.current.delete(id);
      }
      onAnyChange();
    },
    [onAnyChange, runWithBusyRetries, shouldStop, updateJob],
  );

  const retryJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((j) => j.id === id);
      if (!job || job.status !== "error") return;

      stopRequested.current.delete(id);
      if (job.source === "upload") {
        const file = uploadFileByJobId.current.get(id);
        if (!file) {
          updateJob(id, {
            status: "error",
            endedAt: Date.now(),
            error: "Retry unavailable for this upload.",
          });
          return;
        }
        void runUploadJob(id, file);
        return;
      }

      const filename = folderNameByJobId.current.get(id) ?? job.name;
      folderNameByJobId.current.set(id, filename);
      void runFolderJob(id, filename);
    },
    [runFolderJob, runUploadJob, updateJob],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const queued = files.map((file) => ({
        file,
        id: (() => {
          const id = addJob({ name: file.name, source: "upload", status: "pending" });
          uploadFileByJobId.current.set(id, file);
          return id;
        })(),
      }));

      await pool(queued, concurrency, async ({ file, id }) => {
        await runUploadJob(id, file);
      });
    },
    [addJob, concurrency, runUploadJob],
  );

  const importFolderFile = useCallback(
    async (filename: string) => {
      if (!canUseServerFolder) return;
      const id = addJob({
        name: filename,
        source: "folder",
        status: "pending",
      });
      folderNameByJobId.current.set(id, filename);
      await runFolderJob(id, filename);
    },
    [addJob, canUseServerFolder, runFolderJob],
  );

  const importAllFolder = useCallback(async () => {
    if (!canUseServerFolder) return;
    if (!folderFiles || folderFiles.length === 0) return;
    const folderConcurrency = Math.min(concurrency, FOLDER_IMPORT_MAX_CONCURRENCY);
    const queued = folderFiles.map((name) => ({
      name,
      id: (() => {
        const id = addJob({ name, source: "folder", status: "pending" });
        folderNameByJobId.current.set(id, name);
        return id;
      })(),
    }));

    await pool(queued, folderConcurrency, async ({ name, id }) => {
      await runFolderJob(id, name);
    });
  }, [addJob, canUseServerFolder, concurrency, folderFiles, runFolderJob]);

  const loadFolder = useCallback(async () => {
    if (!canUseServerFolder) return ADMIN_ONLY_ERROR;
    setLoadingFolder(true);
    try {
      const listing = await api.listDataDirectory();
      setFolderFiles(listing.files);
      setFolderDir(listing.directory);
      return null;
    } catch (err) {
      return normalizeErrorMessage(err);
    } finally {
      setLoadingFolder(false);
    }
  }, [canUseServerFolder]);

  return {
    jobs,
    addJob,
    updateJob,
    clearFinished,
    concurrency,
    setConcurrency,
    folderFiles,
    folderDir,
    loadingFolder,
    loadFolder,
    uploadFiles,
    importFolderFile,
    importAllFolder,
    retryJob,
    stopJob,
    stopAll,
  };
}
