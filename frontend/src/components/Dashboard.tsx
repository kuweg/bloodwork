import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle,
  Info,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type {
  AttentionItem,
  AttentionResult,
  AttentionSeverity,
  ProviderInfo,
  Report,
  TestInfoResponse,
} from "../types/bloodwork";
import { api } from "../api/client";
import { formatIsoLikeDate } from "../lib/date";
import { latestDate, latestTests } from "../lib/data";
import type { Status } from "../lib/metrics";
import { cn } from "../lib/utils";

interface Props {
  reports: Report[];
  attention: AttentionResult | null;
  attentionLoading: boolean;
  attentionError: string | null;
  refreshAttention: () => Promise<AttentionResult>;
}

export function Dashboard({
  reports,
  attention,
  attentionLoading,
  attentionError,
  refreshAttention,
}: Props) {
  const [selected, setSelected] = useState<"all" | Status>("all");
  const [providers, setProviders] = useState<ProviderInfo | null>(null);
  const [showAttention, setShowAttention] = useState(false);
  const [infoFor, setInfoFor] = useState<
    { canonical: string; title: string } | null
  >(null);

  useEffect(() => {
    api.getProviderInfo().then(setProviders).catch(() => setProviders(null));
  }, []);

  const tests = useMemo(() => latestTests(reports), [reports]);
  const lastDate = useMemo(() => latestDate(reports), [reports]);

  const heuristicCounts = useMemo(
    () => ({
      good: tests.filter((t) => t.status === "good").length,
      mid: tests.filter((t) => t.status === "mid").length,
      bad: tests.filter((t) => t.status === "bad").length,
    }),
    [tests],
  );

  const llmAttentionTests = useMemo(() => {
    if (!attention) return [];
    const flagged = new Set(attention.items.map((i) => i.canonical_name));
    return tests.filter((t) => flagged.has(t.canonical));
  }, [attention, tests]);

  // Attention count from the LLM analysis overrides the heuristic mid count.
  // Keep count and filtering aligned by using the same flagged test list.
  const midCount = attention ? llmAttentionTests.length : heuristicCounts.mid;

  const filtered = useMemo(() => {
    if (selected === "all") return tests;
    if (selected === "mid" && attention) return llmAttentionTests;
    return tests.filter((t) => t.status === selected);
  }, [selected, tests, attention, llmAttentionTests]);

  if (tests.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-16 text-center">
          <Activity className="mx-auto mb-3 h-8 w-8 text-blue-600" />
          <h2 className="text-xl">No measurements yet</h2>
          <p className="mt-1 text-gray-600">
            Upload a PDF lab report to see your dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-3xl">Blood Work Dashboard</h1>
          <p className="text-gray-600">
            {lastDate ? `Last analysis: ${formatLongDate(lastDate)}` : "No dates detected"}
          </p>
        </div>
        <Activity className="h-8 w-8 text-blue-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          label="Good Range"
          count={heuristicCounts.good}
          tone="good"
          active={selected === "good"}
          onClick={() => setSelected(selected === "good" ? "all" : "good")}
        />
        <SummaryCard
          label="Needs Attention"
          count={midCount}
          tone="mid"
          active={selected === "mid"}
          onClick={() => setSelected(selected === "mid" ? "all" : "mid")}
          loading={attentionLoading && !attention}
          action={
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAttention(true);
              }}
              className="flex items-center gap-1 rounded-md border border-yellow-300 bg-white px-2 py-1 text-xs font-medium text-yellow-800 hover:bg-yellow-100"
              title="Open LLM analysis"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Analyse
            </button>
          }
          hint={
            attention
              ? `From LLM · ${attention.reports_considered} report${attention.reports_considered === 1 ? "" : "s"}`
              : attentionError
                ? "LLM unavailable — heuristic"
                : attentionLoading
                  ? "Analysing…"
                  : "Heuristic"
          }
        />
        <SummaryCard
          label="Out of Range"
          count={heuristicCounts.bad}
          tone="bad"
          active={selected === "bad"}
          onClick={() => setSelected(selected === "bad" ? "all" : "bad")}
        />
      </div>

      <ChatBar providers={providers} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((test) => (
          <article
            key={test.id}
            className="rounded-lg border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-1.5">
                  <h3 className="text-lg">{test.name}</h3>
                  <button
                    onClick={() =>
                      setInfoFor({ canonical: test.canonical, title: test.name })
                    }
                    className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                    aria-label="About this test"
                    title="About this test"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-gray-600">
                  Normal: {test.normalRange} {test.unit}
                </p>
              </div>
              <StatusIcon status={test.status} />
            </div>
            <p className="mb-3 text-3xl text-gray-800">
              {test.value}{" "}
              <span className="text-base text-gray-600">{test.unit}</span>
            </p>
            {test.description && (
              <p className="text-sm leading-relaxed text-gray-700">
                {test.description}
              </p>
            )}
          </article>
        ))}
      </div>

      {infoFor && (
        <TestInfoModal
          canonicalName={infoFor.canonical}
          fallbackTitle={infoFor.title}
          onClose={() => setInfoFor(null)}
        />
      )}

      {showAttention && (
        <AttentionModal
          data={attention}
          loading={attentionLoading}
          error={attentionError}
          providers={providers}
          onRefresh={refreshAttention}
          onClose={() => setShowAttention(false)}
        />
      )}
    </div>
  );
}

// ----- Summary card -----
function SummaryCard({
  label,
  count,
  tone,
  active,
  onClick,
  action,
  hint,
  loading,
}: {
  label: string;
  count: number;
  tone: Status;
  active: boolean;
  onClick: () => void;
  action?: React.ReactNode;
  hint?: string;
  loading?: boolean;
}) {
  const palette: Record<
    Status,
    { bg: string; border: string; fg: string; icon: string; big: string; hint: string }
  > = {
    good: {
      bg: "bg-green-50",
      border: "border-green-200",
      fg: "text-green-700",
      icon: "text-green-600",
      big: "text-green-800",
      hint: "text-green-700/70",
    },
    mid: {
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      fg: "text-yellow-700",
      icon: "text-yellow-600",
      big: "text-yellow-800",
      hint: "text-yellow-800/70",
    },
    bad: {
      bg: "bg-red-50",
      border: "border-red-200",
      fg: "text-red-700",
      icon: "text-red-600",
      big: "text-red-800",
      hint: "text-red-800/70",
    },
  };
  const p = palette[tone];
  const Icon = tone === "good" ? CheckCircle : AlertCircle;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={cn(
        "cursor-pointer rounded-lg border-2 p-6 text-left transition-shadow hover:shadow-lg",
        p.bg,
        p.border,
        active && "ring-2 ring-blue-500 ring-offset-2",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={p.fg}>{label}</span>
        <div className="flex items-center gap-2">
          {action}
          <Icon className={cn("h-6 w-6", p.icon)} />
        </div>
      </div>
      <p className={cn("flex items-center gap-2 text-4xl", p.big)}>
        {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : count}
      </p>
      {hint && <p className={cn("mt-1 text-xs", p.hint)}>{hint}</p>}
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  const color =
    status === "good" ? "bg-green-500" : status === "mid" ? "bg-yellow-500" : "bg-red-500";
  const Icon = status === "good" ? CheckCircle : AlertCircle;
  return (
    <div className={cn("rounded-full p-2 text-white", color)}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

// ----- Chat bar -----
function ChatBar({ providers }: { providers: ProviderInfo | null }) {
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportsConsidered, setReportsConsidered] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (providers?.default_model && !model) setModel(providers.default_model);
  }, [providers, model]);

  const notConfigured = providers && !providers.configured;
  const suggested = providers?.suggested_models ?? [];

  async function submit() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.ask(question.trim(), model || undefined);
      setAnswer(res.answer);
      setReportsConsidered(res.reports_considered);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={
              notConfigured
                ? "Configure an LLM provider in backend .env to enable chat."
                : "Ask about your blood work — e.g. 'Is my LDL trending up?'"
            }
            disabled={!!notConfigured}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          />
          <Sparkles className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!!notConfigured || suggested.length === 0}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          title={providers?.configured ? `Provider: ${providers.configured}` : "No provider"}
        >
          {suggested.length === 0 && <option value="">no models</option>}
          {suggested.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!question.trim() || busy || !!notConfigured}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {answer && !error && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
            <span>
              Answer · {reportsConsidered} report{reportsConsidered === 1 ? "" : "s"} considered
            </span>
            <button
              onClick={() => setAnswer(null)}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {answer}
          </p>
        </div>
      )}
    </div>
  );
}

// ----- Attention modal -----
function AttentionModal({
  data,
  loading,
  error,
  providers,
  onRefresh,
  onClose,
}: {
  data: AttentionResult | null;
  loading: boolean;
  error: string | null;
  providers: ProviderInfo | null;
  onRefresh: () => Promise<AttentionResult>;
  onClose: () => void;
}) {
  const notConfigured = providers && !providers.configured;
  const items = data?.items ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              Needs Attention
            </h2>
            <p className="text-sm text-gray-600">
              {loading
                ? "Analysing your recent reports…"
                : data
                  ? `Based on your last ${data.reports_considered} report${data.reports_considered === 1 ? "" : "s"}.`
                  : "No analysis yet."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void onRefresh().catch(() => {})}
              disabled={loading || !!notConfigured}
              className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Re-run LLM analysis"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Re-analyse
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {notConfigured && (
          <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No LLM provider configured. Set <code>BW_LLM_PROVIDER</code> and{" "}
            <code>BW_LLM_API_KEY</code> in <code>backend/.env</code>.
          </p>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {error && (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && data && items.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
            <CheckCircle className="mx-auto mb-2 h-6 w-6 text-green-600" />
            <p className="text-gray-700">Nothing stands out right now.</p>
          </div>
        )}

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item, idx) => (
              <AttentionRow key={`${item.canonical_name}-${idx}`} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const palette: Record<AttentionSeverity, { bg: string; fg: string; dot: string }> = {
    low: { bg: "bg-blue-50", fg: "text-blue-800", dot: "bg-blue-500" },
    medium: { bg: "bg-yellow-50", fg: "text-yellow-900", dot: "bg-yellow-500" },
    high: { bg: "bg-red-50", fg: "text-red-900", dot: "bg-red-500" },
  };
  const p = palette[item.severity] ?? palette.medium;
  return (
    <li className={cn("rounded-lg border border-gray-200 p-3", p.bg)}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", p.dot)} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className={cn("font-medium", p.fg)}>{item.display_name}</p>
            <span className={cn("text-xs uppercase tracking-wide", p.fg)}>
              {item.severity}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-700">{item.reason}</p>
        </div>
      </div>
    </li>
  );
}

// ----- Test info modal -----
function TestInfoModal({
  canonicalName,
  fallbackTitle,
  onClose,
}: {
  canonicalName: string;
  fallbackTitle: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TestInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getTestInfo(canonicalName)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canonicalName]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="flex items-center gap-2 text-2xl">
            <BookOpen className="h-5 w-5 text-blue-600" />
            {data?.title || fallbackTitle}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {error && !loading && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {data.mentioned_as.length > 0 && (
              <section>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Mentioned in your data as
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {data.mentioned_as.map((alias) => (
                    <li
                      key={alias}
                      className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-700"
                    >
                      {alias}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.description && (
              <section>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Description
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {data.description}
                </p>
              </section>
            )}

            {data.importance && (
              <section>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Why it is important
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                  {data.importance}
                </p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatLongDate(iso: string): string {
  return formatIsoLikeDate(iso, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
