import type {
  AggregatedSeries,
  AuthResponse,
  AskResponse,
  AttentionResult,
  DataDirectoryListing,
  IngestFileResult,
  IngestSummary,
  ProviderInfo,
  Report,
  TestInfoResponse,
} from "../types/bloodwork";

const BASE = "/api";

function toErrorMessage(status: number, statusText: string, bodyText: string): string {
  const text = bodyText.trim();
  const looksLikeHtml = /<html[\s>]/i.test(text) || /<!doctype html>/i.test(text);

  if (status === 504) {
    return `${status} ${statusText}: Server is processing too long. Please retry.`;
  }
  if ((status === 502 || status === 503) && looksLikeHtml) {
    return `${status} ${statusText}: Backend is temporarily unavailable.`;
  }
  if (looksLikeHtml) {
    return `${status} ${statusText}`;
  }
  return `${status} ${statusText}: ${text}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(toErrorMessage(res.status, res.statusText, text));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  register(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  },

  login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  },

  me(): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/me");
  },

  logout(): Promise<void> {
    return request<void>("/auth/logout", { method: "POST" });
  },

  uploadReport(file: File, signal?: AbortSignal): Promise<Report> {
    const body = new FormData();
    body.append("file", file);
    return request<Report>("/reports", { method: "POST", body, signal });
  },

  ingestDirectory(): Promise<IngestSummary> {
    return request<IngestSummary>("/reports/ingest-directory", { method: "POST" });
  },

  listDataDirectory(): Promise<DataDirectoryListing> {
    return request<DataDirectoryListing>("/reports/data-directory");
  },

  ingestFileFromDir(
    filename: string,
    signal?: AbortSignal,
  ): Promise<IngestFileResult> {
    const qs = new URLSearchParams({ filename });
    return request<IngestFileResult>(`/reports/ingest-file-from-dir?${qs}`, {
      method: "POST",
      signal,
    });
  },

  getProviderInfo(): Promise<ProviderInfo> {
    return request<ProviderInfo>("/analysis/providers");
  },

  getAttention(last?: number): Promise<AttentionResult> {
    const qs = last ? `?last=${last}` : "";
    return request<AttentionResult>(`/analysis/attention${qs}`);
  },

  ask(question: string, model?: string, last?: number): Promise<AskResponse> {
    return request<AskResponse>("/analysis/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, model: model || null, last: last ?? null }),
    });
  },

  getTestInfo(canonicalName: string): Promise<TestInfoResponse> {
    return request<TestInfoResponse>(
      `/analysis/test-info/${encodeURIComponent(canonicalName)}`,
    );
  },

  listReports(): Promise<Report[]> {
    return request<Report[]>("/results/reports");
  },

  aggregate(names?: string[]): Promise<AggregatedSeries[]> {
    const qs = names?.length
      ? `?${names.map((n) => `names=${encodeURIComponent(n)}`).join("&")}`
      : "";
    return request<AggregatedSeries[]>(`/results/aggregate${qs}`);
  },
};
