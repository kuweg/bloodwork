import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FolderInput,
  Loader2,
  RefreshCw,
  SkipForward,
  Square,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  CONCURRENCY_OPTIONS,
  type Concurrency,
  type Job,
  type JobStatus,
} from "../lib/useImportController";
import { formatIsoLikeDateTime } from "../lib/date";
import { cn } from "../lib/utils";
import type { Report } from "../types/bloodwork";

interface Props {
  reports: Report[];
  canUseServerFolder: boolean;
  concurrency: Concurrency;
  onConcurrencyChange: (next: Concurrency) => void;
  jobs: Job[];
  folderFiles: string[] | null;
  folderDir: string | null;
  loadingFolder: boolean;
  loadFolder: () => Promise<string | null>;
  uploadFiles: (files: File[]) => Promise<void>;
  importFolderFile: (filename: string) => Promise<void>;
  importAllFolder: () => Promise<void>;
  retryJob: (id: string) => void;
  stopJob: (id: string) => void;
  stopAll: () => void;
  clearFinished: () => void;
}

export function Import({
  reports,
  canUseServerFolder,
  concurrency,
  onConcurrencyChange,
  jobs,
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
  clearFinished,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function triggerLoad() {
    setServerError(await loadFolder());
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length) void uploadFiles(files);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith(".pdf"),
    );
    if (files.length) void uploadFiles(files);
  }

  const pendingCount = useMemo(
    () =>
      jobs.filter((j) => j.status === "processing" || j.status === "pending")
        .length,
    [jobs],
  );
  const uploadedFiles = useMemo(
    () =>
      [...reports].sort((a, b) => {
        const left = Date.parse(a.uploaded_at);
        const right = Date.parse(b.uploaded_at);
        if (Number.isNaN(left) || Number.isNaN(right)) {
          return b.uploaded_at.localeCompare(a.uploaded_at);
        }
        return right - left;
      }),
    [reports],
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="mb-1 text-2xl sm:text-3xl">Import</h1>
        <p className="text-gray-600">
          {canUseServerFolder
            ? "Upload PDF reports from your computer or pull them from the server-side data folder."
            : "Upload PDF reports from your computer."}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-lg">Concurrency</h2>
          <select
            value={concurrency}
            onChange={(e) =>
              onConcurrencyChange(Number(e.target.value) as Concurrency)
            }
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CONCURRENCY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "file" : "files"} in parallel
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-500">
            Default set via{" "}
            <code className="rounded bg-gray-100 px-1">VITE_DEFAULT_CONCURRENCY</code>.
          </p>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-lg">Queue</h2>
          <p className="text-sm text-gray-600">
            {jobs.length === 0
              ? "No files yet."
              : `${jobs.length} file${jobs.length === 1 ? "" : "s"} · ${pendingCount} in flight`}
          </p>
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">Files</h2>
          <p className="text-sm text-gray-600">
            {uploadedFiles.length} uploaded file{uploadedFiles.length === 1 ? "" : "s"}
          </p>
        </div>
        {uploadedFiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
            Uploaded files will appear here.
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded border border-gray-100">
            {uploadedFiles.map((report) => (
              <li
                key={report.id}
                className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 items-center gap-2 text-gray-800">
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{report.source_filename}</span>
                </span>
                <span className="text-xs text-gray-500">
                  {formatIsoLikeDateTime(report.uploaded_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-lg">Upload from your computer</h2>
        <DropZone
          dragging={dragging}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onPick={onPick}
        />
      </section>

      {canUseServerFolder && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg">Server data folder</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={triggerLoad}
                disabled={loadingFolder}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                <RefreshCw className={cn("h-4 w-4", loadingFolder && "animate-spin")} />
                {folderFiles ? "Refresh" : "List files"}
              </button>
              {folderFiles && folderFiles.length > 0 && (
                <button
                  onClick={() => void importAllFolder()}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                >
                  <FolderInput className="h-4 w-4" />
                  Import all ({folderFiles.length})
                </button>
              )}
            </div>
          </div>

          {serverError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}

          {folderFiles === null ? (
            <p className="text-sm text-gray-500">
              Click <strong>List files</strong> to see what's available in{" "}
              <code className="rounded bg-gray-100 px-1">blood_work_data/</code>.
            </p>
          ) : folderFiles.length === 0 ? (
            <p className="text-sm text-gray-500">
              No PDFs found in <code className="rounded bg-gray-100 px-1">{folderDir}</code>.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-gray-500">
                <code className="rounded bg-gray-100 px-1">{folderDir}</code>
              </p>
              <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded border border-gray-100">
                {folderFiles.map((name) => (
                  <li
                    key={name}
                    className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="flex items-center gap-2 text-gray-800">
                      <FileText className="h-4 w-4 text-gray-400" />
                      {name}
                    </span>
                    <button
                      onClick={() => void importFolderFile(name)}
                      className="rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                    >
                      Import
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg">Activity</h2>
          {jobs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {pendingCount > 0 && (
                <button
                  onClick={stopAll}
                  className="flex items-center gap-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop all
                </button>
              )}
              <button
                onClick={clearFinished}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                <Trash2 className="h-4 w-4" />
                Clear finished
              </button>
            </div>
          )}
        </div>
        {jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-gray-500 sm:p-10">
            Files will appear here with their status.
          </div>
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onStop={stopJob} onRetry={retryJob} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DropZone({
  dragging,
  onDragEnter,
  onDragLeave,
  onDrop,
  onPick,
}: {
  dragging: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLLabelElement>) => void;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-8",
        dragging
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40",
      )}
    >
      <Upload className="h-8 w-8 text-blue-600" />
      <p className="text-gray-700">Drop PDFs here or click to browse</p>
      <p className="text-xs text-gray-500">Multiple files supported · PDF only</p>
      <input
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={onPick}
      />
    </label>
  );
}

/** Live elapsed ms since `since`, ~20fps while active. */
function useElapsed(since: number | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || since == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(id);
  }, [active, since]);
  return since == null ? 0 : now - since;
}

function JobRow({
  job,
  onStop,
  onRetry,
}: {
  job: Job;
  onStop: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const active = job.status === "processing";
  const canStop = job.status === "processing" || job.status === "pending";
  const canRetry = job.status === "error";
  const elapsed = useElapsed(job.startedAt, active);
  const totalMs =
    job.startedAt != null && job.endedAt != null
      ? job.endedAt - job.startedAt
      : elapsed;

  const pct = active
    ? Math.min(95, 100 * (1 - Math.exp(-elapsed / 8000)))
    : job.status === "uploaded" ||
        job.status === "skipped" ||
        job.status === "error" ||
        job.status === "stopped"
      ? 100
      : 0;

  const barColor =
    job.status === "error"
      ? "bg-red-500"
      : job.status === "skipped"
        ? "bg-gray-400"
        : job.status === "stopped"
          ? "bg-gray-300"
        : job.status === "uploaded"
          ? "bg-green-500"
          : "bg-blue-500";

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-2.5 sm:p-3">
      <div className="flex items-center gap-3">
        <StatusIcon status={job.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="truncate text-sm text-gray-800">{job.name}</p>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{job.source === "upload" ? "upload" : "folder"}</span>
                <span>·</span>
                <span>{formatElapsed(totalMs)}</span>
              </div>
              {canRetry && (
                <button
                  onClick={() => onRetry(job.id)}
                  className="rounded border border-blue-300 p-1 text-blue-700 hover:bg-blue-50"
                  title="Retry this file"
                  aria-label="Retry this file"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
              {canStop && (
                <button
                  onClick={() => onStop(job.id)}
                  className="rounded border border-red-300 px-1.5 py-0.5 text-[11px] text-red-700 hover:bg-red-50"
                  title="Stop this job"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn("h-full transition-[width] duration-150 ease-out", barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {statusLabel(job)}
            {job.measurementCount != null ? ` · ${job.measurementCount} tests` : ""}
          </p>
          {job.error && <p className="mt-1 text-xs text-red-600">{job.error}</p>}
        </div>
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: JobStatus }) {
  const common = "h-5 w-5 shrink-0";
  switch (status) {
    case "processing":
      return <Loader2 className={cn(common, "animate-spin text-blue-600")} />;
    case "uploaded":
      return <CheckCircle2 className={cn(common, "text-green-600")} />;
    case "skipped":
      return <SkipForward className={cn(common, "text-gray-500")} />;
    case "error":
      return <XCircle className={cn(common, "text-red-600")} />;
    case "stopped":
      return <Square className={cn(common, "text-gray-500")} />;
    case "pending":
    default:
      return <AlertCircle className={cn(common, "text-gray-400")} />;
  }
}

function statusLabel(job: Job): string {
  switch (job.status) {
    case "processing":
      return "Processing…";
    case "uploaded":
      return "Uploaded";
    case "skipped":
      return "Already imported (deduped)";
    case "error":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "pending":
    default:
      return "Queued";
  }
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return "0s";
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}
