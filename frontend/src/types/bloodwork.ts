export interface Measurement {
  id: number;
  canonical_name: string; // slug used for grouping
  display_name: string; // LLM-normalized English name
  raw_name: string; // original-language string from the PDF
  value: number;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  taken_at: string | null;
}

export interface Report {
  id: number;
  source_filename: string;
  language: string | null;
  collected_at: string | null;
  uploaded_at: string;
  measurements: Measurement[];
}

export interface AggregatedPoint {
  taken_at: string;
  value: number;
  unit: string | null;
}

export interface AggregatedSeries {
  canonical_name: string;
  unit: string | null;
  points: AggregatedPoint[];
}

export interface IngestError {
  file: string;
  error: string;
}

export interface IngestSummary {
  directory: string;
  imported: number;
  skipped: number;
  errors: IngestError[];
}

export interface DataDirectoryListing {
  directory: string;
  files: string[];
}

export interface IngestFileResult {
  filename: string;
  skipped_duplicate: boolean;
  report: Report;
}

export type AttentionSeverity = "low" | "medium" | "high";

export interface AttentionItem {
  canonical_name: string;
  display_name: string;
  severity: AttentionSeverity;
  reason: string;
}

export interface AttentionResult {
  reports_considered: number;
  items: AttentionItem[];
}

export interface AskResponse {
  answer: string;
  reports_considered: number;
  model: string | null;
}

export interface ProviderInfo {
  configured: string | null;
  default_model: string | null;
  suggested_models: string[];
}

export interface TestInfoResponse {
  canonical_name: string;
  title: string;
  description: string;
  importance: string;
  mentioned_as: string[];
}

export interface User {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
}

export interface AuthResponse {
  user: User;
}
