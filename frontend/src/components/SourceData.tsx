import { ExternalLink, FileText, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api/client";
import { formatIsoLikeDate, formatIsoLikeDateTime } from "../lib/date";
import type { Report } from "../types/bloodwork";

interface Props {
  reports: Report[];
}

export function SourceData({ reports }: Props) {
  const [preview, setPreview] = useState<Report | null>(null);

  const sortedReports = useMemo(
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

  if (sortedReports.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center sm:p-16">
          <h2 className="text-xl">No source files yet</h2>
          <p className="mt-1 text-gray-600">
            Upload reports in the Import tab and they will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl sm:text-3xl">Source data</h1>
          <p className="text-gray-600">
            {sortedReports.length} file{sortedReports.length === 1 ? "" : "s"} sorted
            from newest to oldest
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(200px,1fr)_minmax(220px,1fr)] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs uppercase tracking-wide text-gray-500 md:grid">
          <span>File</span>
          <span>Uploaded at</span>
          <span>Bloodwork performed at</span>
        </div>

        <ul className="divide-y divide-gray-100">
          {sortedReports.map((report) => (
            <li key={report.id} className="px-4 py-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,2fr)_minmax(200px,1fr)_minmax(220px,1fr)] md:gap-3">
                <button
                  onClick={() => setPreview(report)}
                  className="inline-flex min-w-0 items-center gap-2 text-left text-blue-700 hover:text-blue-800 hover:underline"
                  title="Open PDF viewer"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{report.source_filename}</span>
                </button>
                <p className="text-sm text-gray-700">
                  <span className="mr-2 text-xs uppercase tracking-wide text-gray-500 md:hidden">
                    Uploaded:
                  </span>
                  {formatIsoLikeDateTime(report.uploaded_at, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="mr-2 text-xs uppercase tracking-wide text-gray-500 md:hidden">
                    Performed:
                  </span>
                  {report.collected_at
                    ? formatIsoLikeDate(report.collected_at, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "Unknown"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6">
          <div className="flex h-[95vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-3 sm:p-4">
              <h2 className="truncate pr-4 text-base sm:text-lg">{preview.source_filename}</h2>
              <div className="flex items-center gap-2">
                <a
                  href={api.reportPdfUrl(preview.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  <span className="inline-flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in new tab
                  </span>
                </a>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-100"
                  aria-label="Close viewer"
                  title="Close viewer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <iframe
              title={`PDF preview for ${preview.source_filename}`}
              src={api.reportPdfUrl(preview.id)}
              className="h-full w-full rounded-b-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
