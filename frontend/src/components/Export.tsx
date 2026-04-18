import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { historyByTest } from "../lib/data";
import type { Report } from "../types/bloodwork";

interface Props {
  reports: Report[];
}

type ExportFormat = "xlsx" | "csv" | "txt" | "pdf";

const FORMAT_OPTIONS: Array<{ id: ExportFormat; label: string }> = [
  { id: "xlsx", label: "Excel (.xlsx)" },
  { id: "csv", label: "CSV (.csv)" },
  { id: "txt", label: "Text (.txt)" },
  { id: "pdf", label: "PDF (.pdf)" },
];

function todayStamp(): string {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildFilename(format: ExportFormat): string {
  return `bloodwork-table-${todayStamp()}.${format}`;
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCell(value: string | number | undefined): string {
  return value == null ? "" : String(value);
}

export function Export({ reports }: Props) {
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const history = useMemo(() => historyByTest(reports), [reports]);

  const allDates = useMemo(() => {
    const set = new Set<string>();
    history.forEach((test) => {
      Object.keys(test.dates).forEach((d) => set.add(d));
    });
    return [...set].sort();
  }, [history]);

  const headers = useMemo(
    () => ["Test Name", "Canonical", "Unit", "Normal Range", ...allDates],
    [allDates],
  );

  const tableRows = useMemo(() => {
    return history
      .slice()
      .sort((a, b) => a.testName.localeCompare(b.testName))
      .map((test) => {
        const row: Array<string | number> = [
          test.testName,
          test.canonical,
          test.unit || "",
          test.normalRange || "",
        ];
        allDates.forEach((date) => {
          const cell = test.dates[date];
          row.push(cell ? `${cell.value} ${cell.unit}`.trim() : "");
        });
        return row;
      });
  }, [allDates, history]);

  function exportData() {
    if (tableRows.length === 0) return;
    setExporting(true);
    try {
      const filename = buildFilename(format);

      if (format === "xlsx") {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...tableRows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Historical Table");
        XLSX.writeFile(wb, filename);
        return;
      }

      if (format === "csv") {
        const csvLines = [headers, ...tableRows].map((row) =>
          row.map((cell) => escapeCsvCell(toCell(cell))).join(","),
        );
        downloadBlob(filename, new Blob([csvLines.join("\n")], { type: "text/csv" }));
        return;
      }

      if (format === "txt") {
        const txtLines = [headers, ...tableRows].map((row) =>
          row.map((cell) => toCell(cell)).join("\t"),
        );
        downloadBlob(filename, new Blob([txtLines.join("\n")], { type: "text/plain" }));
        return;
      }

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(12);
      doc.text("Bloodwork Historical Table", 20, 24);
      autoTable(doc, {
        head: [headers],
        body: tableRows.map((row) => row.map((cell) => toCell(cell))),
        startY: 34,
        margin: { left: 20, right: 20, bottom: 20, top: 20 },
        styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fillColor: [37, 99, 235] },
        theme: "grid",
      });
      doc.save(filename);
    } finally {
      setExporting(false);
    }
  }

  if (tableRows.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-16 text-center">
          <FileSpreadsheet className="mx-auto mb-3 h-8 w-8 text-blue-600" />
          <h2 className="text-xl">No data to export</h2>
          <p className="mt-1 text-gray-600">
            Upload reports first, then export the table as CSV, TXT, Excel, or PDF.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 text-3xl">Export</h1>
          <p className="text-gray-600">
            Export the full historical table in your preferred file format.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={exportData}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-lg">What will be exported</h2>
        <p className="text-sm text-gray-600">
          {tableRows.length} test{tableRows.length === 1 ? "" : "s"} across{" "}
          {allDates.length} date{allDates.length === 1 ? "" : "s"}.
        </p>
      </section>
    </div>
  );
}
