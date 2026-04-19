import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  LayoutDashboard,
  LineChart,
  LogOut,
  Moon,
  Sun,
  Table as TableIcon,
  Upload,
} from "lucide-react";
import { api } from "./api/client";
import { Dashboard } from "./components/Dashboard";
import { Export } from "./components/Export";
import { Graphics } from "./components/Graphics";
import { Import } from "./components/Import";
import { TableViewer } from "./components/TableViewer";
import { cn } from "./lib/utils";
import { useImportController } from "./lib/useImportController";
import type { AttentionResult, Report, User } from "./types/bloodwork";

type View = "dashboard" | "table" | "graphics" | "import" | "export";

const TABS: { id: View; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "table", label: "Table Viewer", Icon: TableIcon },
  { id: "graphics", label: "Graphics", Icon: LineChart },
  { id: "import", label: "Import", Icon: Upload },
  { id: "export", label: "Export", Icon: Download },
];

const ATTENTION_STORAGE_PREFIX = "bloodwork.attention.";
const THEME_STORAGE_KEY = "bloodwork.theme";

type ThemeMode = "light" | "dark";

function attentionStorageKey(userId: number): string {
  return `${ATTENTION_STORAGE_PREFIX}${userId}`;
}

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function isUnauthorizedError(msg: string): boolean {
  return msg.startsWith("401 ");
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attention, setAttention] = useState<AttentionResult | null>(null);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(resolveInitialTheme);
  const canUseServerFolder = user?.role === "admin";

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setReports(await api.listReports());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isUnauthorizedError(msg)) {
        setUser(null);
        setReports([]);
        return;
      }
      setError(msg);
    }
  }, []);

  const refreshAttention = useCallback(async () => {
    if (!user) throw new Error("Not authenticated");
    setAttentionLoading(true);
    setAttentionError(null);
    try {
      const res = await api.getAttention();
      setAttention(res);
      localStorage.setItem(attentionStorageKey(user.id), JSON.stringify(res));
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAttentionError(msg);
      throw err;
    } finally {
      setAttentionLoading(false);
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void (async () => {
      setAuthLoading(true);
      try {
        const res = await api.me();
        setUser(res.user);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!isUnauthorizedError(msg)) setAuthError(msg);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [refresh, user]);

  useEffect(() => {
    if (!user) {
      setAttention(null);
      return;
    }
    const raw = localStorage.getItem(attentionStorageKey(user.id));
    if (!raw) {
      setAttention(null);
      return;
    }
    try {
      setAttention(JSON.parse(raw) as AttentionResult);
    } catch {
      setAttention(null);
    }
  }, [user]);

  // Auto-refresh attention when the set of reports changes (e.g. after uploads).
  // Debounced so a batch import doesn't spam the LLM endpoint.
  const lastAutoRef = useRef<string>("");
  useEffect(() => {
    if (reports.length === 0) return;
    const signature = reports
      .map((r) => r.id)
      .sort()
      .join(",");
    if (signature === lastAutoRef.current) return;
    lastAutoRef.current = signature;

    const timer = window.setTimeout(() => {
      void refreshAttention().catch(() => {
        // swallow — attentionError state is set for the UI
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [reports, refreshAttention]);

  const importController = useImportController(refresh, canUseServerFolder);
  const inFlight = importController.jobs.some(
    (j) => j.status === "processing" || j.status === "pending",
  );

  const submitAuth = useCallback(async () => {
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      const res =
        authMode === "login"
          ? await api.login(email, password)
          : await api.register(email, password);
      setUser(res.user);
      setPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthSubmitting(false);
    }
  }, [authMode, email, password]);

  const logout = useCallback(async () => {
    const activeUserId = user?.id ?? null;
    try {
      await api.logout();
    } catch {
      // Ignore backend logout errors; local state must still clear.
    }
    if (activeUserId !== null) {
      localStorage.removeItem(attentionStorageKey(activeUserId));
    }
    setAttention(null);
    setUser(null);
    setReports([]);
    setError(null);
  }, [user]);

  const toggleTheme = useCallback(() => {
    setTheme((curr) => (curr === "dark" ? "light" : "dark"));
  }, []);

  if (authLoading) {
    return (
      <div className="relative grid min-h-screen place-items-center bg-gray-50">
        <button
          onClick={toggleTheme}
          className="absolute right-4 top-4 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-100"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <p className="text-sm text-gray-600">Loading session...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative grid min-h-screen place-items-center bg-gray-50 px-4">
        <button
          onClick={toggleTheme}
          className="absolute right-4 top-4 rounded-lg border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-100"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl text-blue-600">Blood Work Analytics</h1>
          <p className="mt-1 text-sm text-gray-600">
            {authMode === "login" ? "Sign in to continue." : "Create an account."}
          </p>

          <div className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-gray-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                autoComplete="email"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-gray-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
          </div>

          {authError && (
            <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {authError}
            </p>
          )}

          <button
            onClick={() => void submitAuth()}
            disabled={authSubmitting || !email || !password}
            className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {authSubmitting
              ? "Please wait..."
              : authMode === "login"
                ? "Sign In"
                : "Create Account"}
          </button>

          <button
            onClick={() =>
              setAuthMode((m) => (m === "login" ? "register" : "login"))
            }
            className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
          >
            {authMode === "login"
              ? "Need an account? Register"
              : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <h1 className="mr-6 text-xl text-blue-600">Blood Work Analytics</h1>
            {TABS.map(({ id, label, Icon }) => {
              const isImport = id === "import";
              const badge = isImport && inFlight;
              return (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={cn(
                    "relative flex items-center gap-2 rounded-lg px-4 py-2 transition-colors",
                    view === id
                      ? "bg-blue-600 text-white"
                      : "text-gray-700 hover:bg-gray-100",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                  {badge && (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button
              onClick={toggleTheme}
              className="rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-100"
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => void logout()}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto max-w-7xl">
        {error && (
          <p className="mx-6 mt-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-red-700">
            {error}
          </p>
        )}
        {view === "dashboard" && (
          <Dashboard
            reports={reports}
            attention={attention}
            attentionLoading={attentionLoading}
            attentionError={attentionError}
            refreshAttention={refreshAttention}
          />
        )}
        {view === "table" && <TableViewer reports={reports} />}
        {view === "graphics" && <Graphics reports={reports} />}
        {view === "import" && (
          <Import
            canUseServerFolder={canUseServerFolder}
            concurrency={importController.concurrency}
            onConcurrencyChange={importController.setConcurrency}
            jobs={importController.jobs}
            folderFiles={importController.folderFiles}
            folderDir={importController.folderDir}
            loadingFolder={importController.loadingFolder}
            loadFolder={importController.loadFolder}
            uploadFiles={importController.uploadFiles}
            importFolderFile={importController.importFolderFile}
            importAllFolder={importController.importAllFolder}
            retryJob={importController.retryJob}
            stopJob={importController.stopJob}
            stopAll={importController.stopAll}
            clearFinished={importController.clearFinished}
          />
        )}
        {view === "export" && <Export reports={reports} />}
      </main>
    </div>
  );
}
