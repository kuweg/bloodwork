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
const DEFAULT_FOLDER_IMPORT_MAX_CONCURRENCY = 6;

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
  const stopRequested = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());

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

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const queued = files.map((file) => ({
        file,
        id: addJob({ name: file.name, source: "upload", status: "pending" }),
      }));

      await pool(queued, concurrency, async ({ file, id }) => {
        if (shouldStop(id)) return;
        const controller = new AbortController();
        controllers.current.set(id, controller);
        updateJob(id, { status: "processing", startedAt: Date.now() });
        try {
          const report = await api.uploadReport(file, controller.signal);
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
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          controllers.current.delete(id);
        }
        onAnyChange();
      });
    },
    [addJob, concurrency, onAnyChange, shouldStop, updateJob],
  );

  const importFolderFile = useCallback(
    async (filename: string) => {
      if (!canUseServerFolder) return;
      const id = addJob({
        name: filename,
        source: "folder",
        status: "processing",
        startedAt: Date.now(),
      });
      if (shouldStop(id)) return;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      try {
        const result = await api.ingestFileFromDir(filename, controller.signal);
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
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controllers.current.delete(id);
      }
      onAnyChange();
    },
    [addJob, canUseServerFolder, onAnyChange, shouldStop, updateJob],
  );

  const importAllFolder = useCallback(async () => {
    if (!canUseServerFolder) return;
    if (!folderFiles || folderFiles.length === 0) return;
    const folderConcurrency = Math.min(concurrency, FOLDER_IMPORT_MAX_CONCURRENCY);
    const queued = folderFiles.map((name) => ({
      name,
      id: addJob({ name, source: "folder", status: "pending" }),
    }));

    await pool(queued, folderConcurrency, async ({ name, id }) => {
      if (shouldStop(id)) return;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      updateJob(id, { status: "processing", startedAt: Date.now() });
      try {
        const result = await api.ingestFileFromDir(name, controller.signal);
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
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controllers.current.delete(id);
      }
      onAnyChange();
    });
  }, [
    addJob,
    canUseServerFolder,
    concurrency,
    folderFiles,
    onAnyChange,
    shouldStop,
    updateJob,
  ]);

  const loadFolder = useCallback(async () => {
    if (!canUseServerFolder) return ADMIN_ONLY_ERROR;
    setLoadingFolder(true);
    try {
      const listing = await api.listDataDirectory();
      setFolderFiles(listing.files);
      setFolderDir(listing.directory);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
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
    stopJob,
    stopAll,
  };
}
