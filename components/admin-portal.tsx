"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ── Types ────────────────────────────────────────────────────── */

type AdminRow = { id: string; username: string; createdAt: string; createdBy: string | null };
type DataTab =
  | "users"
  | "projects"
  | "documents"
  | "knowledge"
  | "brains"
  | "blocked-emails"
  | "knowledge-permissions"
  | "audit-log"
  | "notifications"
  | "maintenance"
  | "health"
  | "knowledge-gaps"
  | "query-tester";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  targetType: string;
  sentAt: string | null;
  createdAt: string;
};

type HealthData = {
  status: string;
  checkedAt: string;
  database: { ok: boolean; latencyMs: number; error?: string };
  providers: Array<{ provider: string; ok: boolean; latencyMs: number; error?: string }>;
  memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
  uptime: number;
};

type MaintenanceConfig = { enabled: boolean; message: string };

type BrainRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  isSystem: boolean;
  documentCount?: number;
  chunkCount?: number;
};

type Analytics = {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
  totalChunks: number;
  totalBrains: number;
  totalMemories: number;
  totalProjects: number;
  totalAdmins: number;
  charts?: {
    dailySignups: Array<{ date: string; count: number }>;
    dailyMessages: Array<{ date: string; count: number }>;
    dailyKnowledgeUpdates: Array<{ date: string; count: number }>;
  };
  retrieval?: {
    totalTurns: number;
    brainUsage: Array<{ brain: string; count: number }>;
    retrievalMethods: { semantic: number; keywordFallback: number; none: number };
    clarification: { count: number; rate: number };
    zeroResults: { count: number; rate: number; recentQueries: string[] };
    failedRetrievals: number;
    topDocuments: Array<{ title: string; count: number }>;
    topQueries: Array<{ query: string; count: number }>;
    feedback: { helpful: number; notHelpful: number; total: number; helpfulRate: number };
    leastHelpfulQueries: string[];
    latency: { avgMs: number; p50Ms: number; count: number };
    errors: number;
    topFailedQueries: Array<{ query: string; count: number }>;
    trends: {
      clarification: Array<{ date: string; count: number }>;
      feedback: Array<{ date: string; helpful: number; notHelpful: number }>;
      latency: Array<{ date: string; avgMs: number }>;
    };
  };
};

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  createdAt: string | null;
  lastLogin: string | null;
  isDisabled: boolean | null;
  isTerminated: boolean | null;
  isSuspended: boolean | null;
};

type BlockedEmail = { id: string; email: string; reason: string | null; createdAt: string };
type KnowledgePerm = { id: string; email: string; grantedBy: string | null; createdAt: string };
type AuditEntry = {
  id: string;
  email: string;
  action: string;
  documentTitle: string;
  documentId: string | null;
  contentBefore: string | null;
  contentAfter: string | null;
  createdAt: string;
};

type KDoc = {
  id: string;
  title: string;
  category: string | null;
  sourceType: string;
  status: string;
  visibility: "private" | "global";
  projectId: string | null;
  projectName: string | null;
  brainId: string | null;
  brainName: string | null;
  brainIcon: string | null;
  userId: string;
  userEmail: string | null;
  createdAt: string;
};

type UserOpt = { id: string; email: string | null };
type ProjOpt = { id: string; name: string; userId: string };
type BrainOpt = { id: string; name: string; icon: string };

const CATEGORIES = ["Personal", "Family", "Education", "Business", "Trading", "Law", "Custom"];

/* ── Mini bar chart (no external deps) ───────────────────────── */

function BarChart({
  data,
  label,
}: {
  data: Array<{ date: string; count: number }>;
  label: string;
}) {
  if (!data.length) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border bg-muted/30 text-xs text-muted-foreground">
        No data yet
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex h-24 items-end gap-1 rounded-lg border bg-muted/20 px-2 pb-1 pt-2">
        {data.map((d) => (
          <div
            key={d.date}
            className="group relative flex-1"
            title={`${d.date}: ${d.count}`}
          >
            <div
              className="rounded-sm bg-primary/60 transition-all group-hover:bg-primary"
              style={{ height: `${Math.max(4, (d.count / max) * 72)}px` }}
            />
            <span className="absolute -top-4 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1 py-0.5 text-[10px] shadow group-hover:block">
              {d.count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.date?.slice(5)}</span>
        <span>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

/* ── Component ─────────────────────────────────────────────────── */

export default function AdminPortal() {
  /* auth */
  const [status, setStatus] = useState<"loading" | "login" | "dashboard">("loading");

  /* login form */
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  /* shared */
  const [error, setError] = useState<string | null>(null);

  /* admins section */
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [newU, setNewU] = useState("");
  const [newP, setNewP] = useState("");

  /* data tab */
  const [dataTab, setDataTab] = useState<DataTab>("users");
  const [dataRows, setDataRows] = useState<Record<string, unknown>[]>([]);

  /* users tab */
  const [userRows, setUserRows] = useState<UserRow[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userLoading, setUserLoading] = useState(false);

  /* blocked emails tab */
  const [blockedEmails, setBlockedEmails] = useState<BlockedEmail[]>([]);
  const [newBlockedEmail, setNewBlockedEmail] = useState("");

  /* knowledge permissions tab */
  const [knowledgePerms, setKnowledgePerms] = useState<KnowledgePerm[]>([]);
  const [newPermEmail, setNewPermEmail] = useState("");

  /* audit log tab */
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditExpanded, setAuditExpanded] = useState<string | null>(null);

  /* knowledge list */
  const [knowledge, setKnowledge] = useState<KDoc[]>([]);
  const [kSearch, setKSearch] = useState("");
  const [kCatFilter, setKCatFilter] = useState("");
  const [kProjFilter, setKProjFilter] = useState("");

  /* knowledge form state */
  type FormMode = "hidden" | "add" | "edit";
  const [formMode, setFormMode] = useState<FormMode>("hidden");
  const [editId, setEditId] = useState<string | null>(null);
  const [fUserId, setFUserId] = useState("");
  const [fProjId, setFProjId] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fContent, setFContent] = useState("");
  const [fSaving, setFSaving] = useState(false);

  /* pickers */
  const [allUsers, setAllUsers] = useState<UserOpt[]>([]);
  const [allProjects, setAllProjects] = useState<ProjOpt[]>([]);
  const [allBrainsOpt, setAllBrainsOpt] = useState<BrainOpt[]>([]);
  const [fBrainId, setFBrainId] = useState("");
  const [fVisibility, setFVisibility] = useState<"private" | "global">("private");

  /* brains tab */
  const [brains, setBrains] = useState<BrainRow[]>([]);
  const [brainForm, setBrainForm] = useState<{ name: string; slug: string; description: string; icon: string; color: string } | null>(null);
  const [brainEditId, setBrainEditId] = useState<string | null>(null);
  const [brainSaving, setBrainSaving] = useState(false);
  const [kBrainFilter, setKBrainFilter] = useState("");
  const [kVisFilter, setKVisFilter] = useState("");

  /* analytics */
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  /* knowledge gaps (Phase 3) */
  type Gaps = {
    zeroResultQueries: Array<{ query: string; count: number }>;
    clarificationQueries: Array<{ query: string; count: number }>;
    lowConfidenceQueries: Array<{ query: string; count: number; confidence: number }>;
    missingTopicSuggestions: string[];
  };
  const [gaps, setGaps] = useState<Gaps | null>(null);

  /* query tester (Phase 4) */
  type QueryTest = {
    query: string; routedBrain: string | null; confidence: number; confidenceThreshold: number;
    matchedKeywords: string[]; reason: string; multiBrains: string[] | null; wantRetrieval: boolean;
    clarificationDecision: string; semanticThreshold: number;
    retrieval: Array<{ brain: string; semantic: Array<{ title: string; score: number }>; keyword: Array<{ title: string; score: number }> }>;
  };
  const [qtInput, setQtInput] = useState("");
  const [qtResult, setQtResult] = useState<QueryTest | null>(null);
  const [qtLoading, setQtLoading] = useState(false);

  /* notifications */
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifTarget, setNotifTarget] = useState<"all" | "specific">("all");
  const [notifSending, setNotifSending] = useState<string | null>(null);

  /* maintenance */
  const [maintenance, setMaintenance] = useState<MaintenanceConfig | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  /* web search (Phase 7) */
  type WebStatus = {
    enabled: boolean; provider: string; productionGrade?: boolean; active?: boolean; lastSearchAt: number | null;
    cache: { entries: number; hits: number; misses: number; hitRate: number; byKind: Record<string, number> };
  };
  const [webStatus, setWebStatus] = useState<WebStatus | null>(null);

  /* health */
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  /* ── loaders ───────────────────────────────────────────────────── */

  const loadAdmins = useCallback(async (initial = false) => {
    const res = await fetch("/api/admin/admins");
    if (res.status === 401) { setStatus("login"); return; }
    const d = await res.json().catch(() => ({}));
    setAdmins(d.admins ?? []);
    setStatus("dashboard");
    if (initial) {
      void loadUsers(1, "");
      void loadKnowledge();
      void loadPickers();
      void loadBrains();
      void loadAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadAdmins(true); }, [loadAdmins]);

  async function loadUsers(page = 1, search = userSearch) {
    setUserLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) return;
      const d = await res.json().catch(() => ({}));
      setUserRows(d.users ?? []);
      setUserTotal(d.total ?? 0);
      setUserPage(page);
    } finally { setUserLoading(false); }
  }

  async function loadBlockedEmails() {
    const res = await fetch("/api/admin/blocked-emails");
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setBlockedEmails(d.blockedEmails ?? []);
  }

  async function loadKnowledgePerms() {
    const res = await fetch("/api/admin/knowledge-permissions");
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setKnowledgePerms(d.permissions ?? []);
  }

  async function loadAuditLog() {
    const res = await fetch("/api/admin/audit-log");
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setAuditLog(d.entries ?? []);
  }

  async function loadNotifications() {
    const res = await fetch("/api/admin/notifications");
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setNotifications(d.notifications ?? []);
  }

  async function loadMaintenance() {
    const res = await fetch("/api/admin/maintenance");
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setMaintenance(d);
    setMaintenanceMessage(d.message ?? "");
    void loadWebStatus();
  }

  async function loadWebStatus() {
    const res = await fetch("/api/admin/web-search");
    if (res.ok) setWebStatus(await res.json().catch(() => null));
  }

  async function toggleWebSearch(enabled: boolean) {
    const res = await fetch("/api/admin/web-search", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
    });
    if (res.ok) void loadWebStatus();
  }

  async function loadHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/admin/health");
      if (!res.ok) return;
      const d = await res.json().catch(() => null);
      setHealth(d);
    } finally { setHealthLoading(false); }
  }

  async function sendNotification(id: string) {
    setNotifSending(id);
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: "POST" });
      if (res.ok) await loadNotifications();
    } finally { setNotifSending(null); }
  }

  async function createNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    const res = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: notifTitle, message: notifMessage, targetType: notifTarget }),
    });
    if (res.ok) { setNotifTitle(""); setNotifMessage(""); await loadNotifications(); }
  }

  async function deleteNotification(id: string) {
    if (!confirm("Delete this notification?")) return;
    await fetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
    await loadNotifications();
  }

  async function saveMaintenance(e: React.FormEvent) {
    e.preventDefault();
    if (!maintenance) return;
    setMaintenanceSaving(true);
    try {
      await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: maintenance.enabled, message: maintenanceMessage }),
      });
      await loadMaintenance();
    } finally { setMaintenanceSaving(false); }
  }

  async function loadGaps() {
    const res = await fetch("/api/admin/knowledge-gaps");
    if (res.ok) { const d = await res.json(); setGaps(d.gaps ?? null); }
  }

  async function runQueryTest() {
    const q = qtInput.trim();
    if (!q) return;
    setQtLoading(true);
    try {
      const res = await fetch("/api/admin/query-test", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }),
      });
      if (res.ok) setQtResult(await res.json());
      else setError(`Query test failed (HTTP ${res.status})`);
    } finally { setQtLoading(false); }
  }

  /* Phase 3 — turn a gap query into a new knowledge document (prefills the form). */
  async function createDocFromQuery(query: string) {
    setDataTab("knowledge");
    await loadKnowledge();
    openAddForm();
    setFTitle(query);
    setFVisibility("global");
  }

  async function loadTab(tab: DataTab) {
    setDataTab(tab);
    if (tab === "knowledge") { void loadKnowledge(); return; }
    if (tab === "knowledge-gaps") { void loadGaps(); return; }
    if (tab === "query-tester") { return; }
    if (tab === "brains") { void loadBrains(); return; }
    if (tab === "users") { void loadUsers(1, ""); setUserSearch(""); setUserSearchInput(""); return; }
    if (tab === "blocked-emails") { void loadBlockedEmails(); return; }
    if (tab === "knowledge-permissions") { void loadKnowledgePerms(); return; }
    if (tab === "audit-log") { void loadAuditLog(); return; }
    if (tab === "notifications") { void loadNotifications(); return; }
    if (tab === "maintenance") { void loadMaintenance(); return; }
    if (tab === "health") { void loadHealth(); return; }
    const res = await fetch(`/api/admin/data?view=${tab}`);
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setDataRows((d[tab] as Record<string, unknown>[]) ?? []);
  }

  async function loadKnowledge() {
    const res = await fetch("/api/admin/knowledge?withBrain=1");
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setKnowledge(d.knowledge ?? []);
  }

  async function loadBrains() {
    const res = await fetch("/api/admin/brains?view=stats");
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setBrains(d.brains ?? []);
  }

  async function loadAnalytics() {
    const res = await fetch("/api/admin/analytics");
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    setAnalytics(d.analytics ?? null);
  }

  async function loadPickers() {
    const [uRes, pRes, bRes] = await Promise.all([
      fetch("/api/admin/data?view=users"),
      fetch("/api/admin/projects"),
      fetch("/api/admin/brains?view=picker"),
    ]);
    if (uRes.ok) {
      const d = await uRes.json().catch(() => ({}));
      setAllUsers(((d.users ?? []) as { id: string; email: string | null }[]).map((u) => ({ id: u.id, email: u.email })));
    }
    if (pRes.ok) {
      const d = await pRes.json().catch(() => ({}));
      setAllProjects((d.projects ?? []) as ProjOpt[]);
    }
    if (bRes.ok) {
      const d = await bRes.json().catch(() => ({}));
      setAllBrainsOpt((d.brains ?? []).map((b: { id: string; name: string; icon: string }) => ({ id: b.id, name: b.name, icon: b.icon })));
    }
  }

  /* ── admin CRUD ─────────────────────────────────────────────── */

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "Login failed"); return; }
    setPassword(""); void loadAdmins(true);
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const res = await fetch("/api/admin/admins", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newU, password: newP }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "Could not create admin"); return; }
    setNewU(""); setNewP(""); void loadAdmins();
  }

  async function deleteAdmin(id: string) {
    if (!confirm("Delete this admin?")) return;
    const res = await fetch(`/api/admin/admins/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not delete"); return; }
    void loadAdmins();
  }

  async function resetAdmin(id: string) {
    const pw = prompt("New password (min 8 chars):"); if (!pw) return;
    const res = await fetch(`/api/admin/admins/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const d = await res.json().catch(() => ({}));
    setError(res.ok ? null : (d.error ?? "Could not reset"));
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }); setStatus("login");
  }

  /* ── user management ────────────────────────────────────────── */

  async function userAction(id: string, action: "disable" | "enable" | "terminate" | "delete" | "reset-password" | "suspend" | "restore") {
    setError(null);
    if (action === "delete") {
      if (!confirm("Permanently delete this user and all their data?")) return;
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not delete"); return; }
      void loadUsers(userPage);
      return;
    }
    if (action === "terminate") {
      if (!confirm("Terminate this account? This will disable the account AND add the email to the blocked list. Future logins and registrations with this email will be permanently rejected.")) return;
      const res = await fetch(`/api/admin/users/${id}/terminate`, { method: "POST" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not terminate"); return; }
      void loadUsers(userPage);
      return;
    }
    if (action === "reset-password") {
      const pw = prompt("New password for user (min 8 chars):"); if (!pw) return;
      if (pw.length < 8) { setError("Password must be at least 8 characters"); return; }
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not reset password"); return; }
      return;
    }
    if (action === "suspend" || action === "restore") {
      const res = await fetch(`/api/admin/users/${id}/suspend`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspend: action === "suspend" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not update user"); return; }
      void loadUsers(userPage);
      return;
    }
    const disabled = action === "disable";
    const res = await fetch(`/api/admin/users/${id}/disable`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not update user"); return; }
    void loadUsers(userPage);
  }

  /* ── blocked emails ─────────────────────────────────────────── */

  async function addBlockedEmail(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const email = newBlockedEmail.trim();
    if (!email || !email.includes("@")) { setError("Valid email required"); return; }
    const res = await fetch("/api/admin/blocked-emails", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "Could not block email"); return; }
    setNewBlockedEmail(""); void loadBlockedEmails();
  }

  async function removeBlockedEmail(id: string) {
    const res = await fetch(`/api/admin/blocked-emails/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not remove"); return; }
    void loadBlockedEmails();
  }

  /* ── knowledge permissions ──────────────────────────────────── */

  async function addKnowledgePerm(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const email = newPermEmail.trim();
    if (!email || !email.includes("@")) { setError("Valid email required"); return; }
    const res = await fetch("/api/admin/knowledge-permissions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "Could not add permission"); return; }
    setNewPermEmail(""); void loadKnowledgePerms();
  }

  async function removeKnowledgePerm(id: string) {
    const res = await fetch(`/api/admin/knowledge-permissions/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not remove"); return; }
    void loadKnowledgePerms();
  }

  /* ── brain CRUD ──────────────────────────────────────────────── */

  function openBrainAdd() {
    setBrainEditId(null);
    setBrainForm({ name: "", slug: "", description: "", icon: "🧠", color: "#6366f1" });
    setError(null);
  }

  function openBrainEdit(b: BrainRow) {
    setBrainEditId(b.id);
    setBrainForm({ name: b.name, slug: b.slug, description: b.description ?? "", icon: b.icon, color: b.color });
    setError(null);
  }

  async function saveBrain(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBrainSaving(true);
    try {
      const method = brainEditId ? "PATCH" : "POST";
      const url = brainEditId ? `/api/admin/brains/${brainEditId}` : "/api/admin/brains";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(brainForm) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Could not save brain"); return; }
      setBrainForm(null); setBrainEditId(null); void loadBrains(); void loadAnalytics();
    } finally { setBrainSaving(false); }
  }

  async function deleteBrain(id: string, name: string, isSystem: boolean) {
    if (isSystem) { setError("Cannot delete a system brain"); return; }
    if (!confirm(`Delete brain "${name}"?`)) return;
    const res = await fetch(`/api/admin/brains/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "Could not delete"); return; }
    void loadBrains(); void loadAnalytics();
  }

  /* ── knowledge CRUD ─────────────────────────────────────────── */

  function openAddForm() {
    setEditId(null); setFUserId(""); setFProjId(""); setFBrainId(""); setFTitle("");
    setFCategory(""); setFContent(""); setFVisibility("private"); setFormMode("add"); setError(null);
  }

  async function openEditForm(doc: KDoc) {
    setError(null);
    const res = await fetch(`/api/admin/knowledge/${doc.id}`);
    if (!res.ok) { setError("Could not load document"); return; }
    const d = await res.json().catch(() => ({}));
    const full = d.document;
    setEditId(doc.id); setFUserId(doc.userId); setFProjId(doc.projectId ?? ""); setFBrainId(doc.brainId ?? "");
    setFTitle(full?.title ?? ""); setFCategory(full?.category ?? ""); setFContent(full?.content ?? "");
    setFVisibility(doc.visibility ?? "private"); setFormMode("edit");
  }

  function cancelForm() { setFormMode("hidden"); setEditId(null); setError(null); }

  async function saveKnowledge(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!fTitle.trim()) { setError("Title is required"); return; }
    if (!fContent.trim()) { setError("Content is required"); return; }
    if (formMode === "add" && !fUserId) { setError("Select a user first"); return; }
    setFSaving(true);
    try {
      let res: Response;
      if (formMode === "add") {
        res = await fetch("/api/admin/knowledge", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: fUserId, projectId: fProjId || null, brainId: fBrainId || null, title: fTitle, category: fCategory || null, content: fContent, visibility: fVisibility }),
        });
      } else {
        res = await fetch(`/api/admin/knowledge/${editId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: fTitle, category: fCategory || null, brainId: fBrainId || null, content: fContent, visibility: fVisibility }),
        });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "Could not save"); return; }
      cancelForm(); void loadKnowledge();
    } finally { setFSaving(false); }
  }

  async function deleteKnowledge(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    const res = await fetch(`/api/admin/knowledge/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Could not delete"); return; }
    void loadKnowledge();
  }

  /* ── derived data ───────────────────────────────────────────── */

  const userProjects = allProjects.filter((p) => p.userId === fUserId);
  const uniqueCategories = [...new Set(knowledge.map((d) => d.category).filter(Boolean))] as string[];
  const uniqueProjects = [...new Map(knowledge.filter((d) => d.projectId && d.projectName).map((d) => [d.projectId, { id: d.projectId!, name: d.projectName! }])).values()];

  const filteredKnowledge = useMemo(() => knowledge.filter((d) => {
    if (kSearch && !d.title.toLowerCase().includes(kSearch.toLowerCase())) return false;
    if (kCatFilter && d.category !== kCatFilter) return false;
    if (kProjFilter && d.projectId !== kProjFilter) return false;
    if (kBrainFilter && d.brainId !== kBrainFilter) return false;
    if (kVisFilter && d.visibility !== kVisFilter) return false;
    return true;
  }), [knowledge, kSearch, kCatFilter, kProjFilter, kBrainFilter, kVisFilter]);

  /* ── style helpers ──────────────────────────────────────────── */

  const input = "w-full rounded-lg border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm";
  const tabBtn = (active: boolean) =>
    `px-4 py-2 text-sm capitalize transition-colors border-b-2 whitespace-nowrap ${
      active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  function userStatus(u: UserRow) {
    if (u.isTerminated) return { label: "Terminated", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
    if (u.isSuspended) return { label: "Suspended", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
    if (u.isDisabled) return { label: "Disabled", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
    return { label: "Active", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
  }

  /* ── render ─────────────────────────────────────────────────── */

  if (status === "loading") return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  if (status === "login") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6">
        <form onSubmit={doLogin} className="w-full max-w-sm space-y-3">
          <h1 className="text-center text-2xl font-semibold">Admin Portal</h1>
          <p className="text-center text-sm text-muted-foreground">Sign in with admin credentials.</p>
          <input className={input} placeholder="Admin Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className={input} type="password" placeholder="Admin Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Enter</button>
          <div className="text-right text-xs text-muted-foreground"><a href="/" className="hover:text-foreground">← Back to chat</a></div>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <div className="flex gap-2">
          <a href="/" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">Back to chat</a>
          <button onClick={logout} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">Log out</button>
        </div>
      </div>

      {/* Analytics stats */}
      {analytics && (
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total Users", value: analytics.totalUsers },
              { label: "Active (30d)", value: analytics.activeUsers ?? "—" },
              { label: "New Today", value: analytics.newUsersToday ?? "—" },
              { label: "Conversations", value: analytics.totalConversations },
              { label: "Messages", value: analytics.totalMessages },
              { label: "Documents", value: analytics.totalDocuments },
              { label: "Chunks", value: analytics.totalChunks },
              { label: "Brains", value: analytics.totalBrains },
              { label: "Memories", value: analytics.totalMemories },
              { label: "Projects", value: analytics.totalProjects ?? "—" },
              { label: "Admins", value: analytics.totalAdmins ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border p-3 text-center">
                <p className="text-xl font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {analytics.charts && (
            <div className="grid gap-4 sm:grid-cols-3">
              <BarChart data={analytics.charts.dailySignups} label="Daily Signups (7d)" />
              <BarChart data={analytics.charts.dailyMessages} label="Daily Messages (7d)" />
              <BarChart data={analytics.charts.dailyKnowledgeUpdates} label="Knowledge Updates (7d)" />
            </div>
          )}

          {analytics.retrieval && (
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-semibold">
                Retrieval Analytics{" "}
                <span className="font-normal text-muted-foreground">
                  ({analytics.retrieval.totalTurns.toLocaleString()} turns · 30d)
                </span>
              </h2>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Clarifications", value: `${analytics.retrieval.clarification.count} (${Math.round(analytics.retrieval.clarification.rate * 100)}%)` },
                  { label: "Failed / Zero-result", value: `${analytics.retrieval.failedRetrievals} (${Math.round(analytics.retrieval.zeroResults.rate * 100)}%)` },
                  { label: "Semantic hits", value: analytics.retrieval.retrievalMethods.semantic },
                  { label: "Keyword fallback", value: analytics.retrieval.retrievalMethods.keywordFallback },
                  { label: "Helpful %", value: analytics.retrieval.feedback.total ? `${Math.round(analytics.retrieval.feedback.helpfulRate * 100)}% (${analytics.retrieval.feedback.total})` : "—" },
                  { label: "👍 / 👎", value: `${analytics.retrieval.feedback.helpful} / ${analytics.retrieval.feedback.notHelpful}` },
                  { label: "Avg latency", value: analytics.retrieval.latency.count ? `${analytics.retrieval.latency.avgMs} ms` : "—" },
                  { label: "Errors", value: analytics.retrieval.errors },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {(analytics.retrieval.trends.clarification.length > 0 || analytics.retrieval.trends.latency.length > 0 || analytics.retrieval.trends.feedback.length > 0) && (
                <div className="mb-4 grid gap-4 sm:grid-cols-3">
                  <BarChart data={analytics.retrieval.trends.clarification} label="Clarification trend" />
                  <BarChart data={analytics.retrieval.trends.latency.map((d) => ({ date: d.date, count: d.avgMs }))} label="Avg latency (ms)" />
                  <BarChart data={analytics.retrieval.trends.feedback.map((d) => ({ date: d.date, count: d.helpful - d.notHelpful }))} label="Feedback (👍−👎)" />
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Brain Usage</p>
                  {analytics.retrieval.brainUsage.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No data yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {analytics.retrieval.brainUsage.map((b) => (
                        <li key={b.brain} className="flex justify-between text-sm">
                          <span className="capitalize">{b.brain}</span>
                          <span className="tabular-nums text-muted-foreground">{b.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Top Documents</p>
                  {analytics.retrieval.topDocuments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No data yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {analytics.retrieval.topDocuments.map((d) => (
                        <li key={d.title} className="flex justify-between gap-2 text-sm">
                          <span className="truncate">{d.title}</span>
                          <span className="tabular-nums text-muted-foreground">{d.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Top Queries</p>
                  {analytics.retrieval.topQueries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No data yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {analytics.retrieval.topQueries.map((q) => (
                        <li key={q.query} className="flex justify-between gap-2 text-sm">
                          <span className="truncate">{q.query}</span>
                          <span className="tabular-nums text-muted-foreground">{q.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Recent Zero-Result Queries</p>
                  {analytics.retrieval.zeroResults.recentQueries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None — every retrieval returned context.</p>
                  ) : (
                    <ul className="space-y-1">
                      {analytics.retrieval.zeroResults.recentQueries.map((q, i) => (
                        <li key={`${q}-${i}`} className="truncate text-sm text-muted-foreground">{q}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Least-helpful (👎) Queries</p>
                  {analytics.retrieval.leastHelpfulQueries.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No 👎 feedback yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {analytics.retrieval.leastHelpfulQueries.map((q, i) => (
                        <li key={`${q}-${i}`} className="truncate text-sm text-muted-foreground">{q}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {/* Admins card */}
      <section className="mb-8 rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">Admins ({admins.length})</h2>
        <div className="mb-3 overflow-hidden rounded-lg border">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-0">
              <span className="font-medium">{a.username}</span>
              <span className="flex gap-3">
                <button onClick={() => resetAdmin(a.id)} className="text-xs text-muted-foreground hover:text-foreground">Reset password</button>
                <button onClick={() => deleteAdmin(a.id)} className="text-xs text-destructive hover:opacity-80">Delete</button>
              </span>
            </div>
          ))}
        </div>
        <form onSubmit={createAdmin} className="flex flex-col gap-2 sm:flex-row">
          <input className={input} placeholder="New admin username" value={newU} onChange={(e) => setNewU(e.target.value)} />
          <input className={input} type="password" placeholder="Password (min 8 chars)" value={newP} onChange={(e) => setNewP(e.target.value)} />
          <button className="min-h-11 shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">Create</button>
        </form>
      </section>

      {/* Data tab bar */}
      <div className="mb-0 flex gap-0 overflow-x-auto border-b">
        {(["users", "projects", "documents", "knowledge", "knowledge-gaps", "query-tester", "brains", "blocked-emails", "knowledge-permissions", "audit-log", "notifications", "maintenance", "health"] as DataTab[]).map((t) => (
          <button key={t} onClick={() => loadTab(t)} className={tabBtn(dataTab === t)}>
            {t === "knowledge" ? "Knowledge Base"
              : t === "knowledge-gaps" ? "Knowledge Gaps"
              : t === "query-tester" ? "Query Tester"
              : t === "blocked-emails" ? "Blocked Emails"
              : t === "knowledge-permissions" ? "K. Permissions"
              : t === "audit-log" ? "Audit Log"
              : t === "notifications" ? "Notifications"
              : t === "maintenance" ? "Maintenance"
              : t === "health" ? "Health"
              : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Users tab ── */}
      {dataTab === "users" && (
        <section className="mt-4">
          <div className="mb-3 flex gap-2">
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const s = userSearchInput.trim();
                setUserSearch(s);
                void loadUsers(1, s);
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Search by email, name, or username…"
                value={userSearchInput}
                onChange={(e) => setUserSearchInput(e.target.value)}
              />
              <button type="submit" className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-accent">Search</button>
              {userSearch && (
                <button
                  type="button"
                  onClick={() => { setUserSearch(""); setUserSearchInput(""); void loadUsers(1, ""); }}
                  className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
                >
                  Clear
                </button>
              )}
            </form>
            <a
              href="/api/admin/export/users"
              className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
              download
            >
              Export CSV
            </a>
          </div>

          {userLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading users…</p>
          ) : userRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>User</span>
                <span className="w-20 text-center">Status</span>
                <span className="w-28 text-right">Joined</span>
                <span className="w-28 text-right">Last Login</span>
                <span className="w-52 text-right">Actions</span>
              </div>
              {userRows.map((u) => {
                const st = userStatus(u);
                return (
                  <div key={u.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 border-b px-4 py-3 text-sm last:border-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.email ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[u.name, u.username ? `@${u.username}` : null].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className="w-20 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                    </span>
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </span>
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                    </span>
                    <span className="flex w-56 justify-end gap-1.5 flex-wrap">
                      <button onClick={() => userAction(u.id, "reset-password")} className="text-xs text-muted-foreground hover:text-foreground">Reset pw</button>
                      {u.isSuspended
                        ? <button onClick={() => userAction(u.id, "restore")} className="text-xs text-green-600 hover:opacity-80">Restore</button>
                        : <button onClick={() => userAction(u.id, "suspend")} className="text-xs text-orange-600 hover:opacity-80">Suspend</button>
                      }
                      {!u.isSuspended && (u.isDisabled
                        ? <button onClick={() => userAction(u.id, "enable")} className="text-xs text-green-600 hover:opacity-80">Enable</button>
                        : <button onClick={() => userAction(u.id, "disable")} className="text-xs text-amber-600 hover:opacity-80">Disable</button>
                      )}
                      {!u.isTerminated && (
                        <button onClick={() => userAction(u.id, "terminate")} className="text-xs text-destructive hover:opacity-80">Terminate</button>
                      )}
                      <button onClick={() => userAction(u.id, "delete")} className="text-xs text-destructive hover:opacity-80">Delete</button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{userTotal} user(s) total</span>
            {userTotal > 20 && (
              <div className="flex gap-2">
                <button
                  disabled={userPage <= 1}
                  onClick={() => loadUsers(userPage - 1)}
                  className="rounded border px-2 py-1 hover:bg-accent disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span>Page {userPage} of {Math.ceil(userTotal / 20)}</span>
                <button
                  disabled={userPage * 20 >= userTotal}
                  onClick={() => loadUsers(userPage + 1)}
                  className="rounded border px-2 py-1 hover:bg-accent disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Projects / Documents (raw JSON) ── */}
      {(dataTab === "projects" || dataTab === "documents") && (
        <section className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <pre className="max-h-96 overflow-auto p-3 text-xs">{JSON.stringify(dataRows, null, 2)}</pre>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{dataRows.length} record(s)</p>
        </section>
      )}

      {/* ── Blocked Emails tab ── */}
      {dataTab === "blocked-emails" && (
        <section className="mt-4">
          <form onSubmit={addBlockedEmail} className="mb-4 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Email to block…"
              value={newBlockedEmail}
              onChange={(e) => setNewBlockedEmail(e.target.value)}
              type="email"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90">
              Block Email
            </button>
          </form>

          {blockedEmails.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No blocked emails.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Email</span>
                <span className="w-28 text-right">Blocked On</span>
                <span className="w-16 text-right">Action</span>
              </div>
              {blockedEmails.map((b) => (
                <div key={b.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
                  <div>
                    <p className="font-medium">{b.email}</p>
                    {b.reason && <p className="text-xs text-muted-foreground">{b.reason}</p>}
                  </div>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleDateString()}
                  </span>
                  <span className="flex w-16 justify-end">
                    <button onClick={() => removeBlockedEmail(b.id)} className="text-xs text-destructive hover:opacity-80">Unblock</button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">{blockedEmails.length} blocked email(s)</p>
        </section>
      )}

      {/* ── Knowledge Permissions tab ── */}
      {dataTab === "knowledge-permissions" && (
        <section className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Only emails listed here (plus the built-in defaults) can add or edit knowledge.
          </p>
          <form onSubmit={addKnowledgePerm} className="mb-4 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Email to grant write access…"
              value={newPermEmail}
              onChange={(e) => setNewPermEmail(e.target.value)}
              type="email"
            />
            <button type="submit" className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              Grant Access
            </button>
          </form>

          <div className="mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Built-in defaults (always permitted): iamhajihaz@gmail.com · now.kuddosahib@gmail.com
          </div>

          {knowledgePerms.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No additional permissions configured.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Email</span>
                <span className="w-28 text-right">Granted On</span>
                <span className="w-16 text-right">Action</span>
              </div>
              {knowledgePerms.map((p) => (
                <div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
                  <p className="font-medium">{p.email}</p>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </span>
                  <span className="flex w-16 justify-end">
                    <button onClick={() => removeKnowledgePerm(p.id)} className="text-xs text-destructive hover:opacity-80">Revoke</button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">{knowledgePerms.length} custom permission(s)</p>
        </section>
      )}

      {/* ── Audit Log tab ── */}
      {dataTab === "audit-log" && (
        <section className="mt-4">
          {auditLog.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="w-16">Action</span>
                <span>Document</span>
                <span className="w-36 text-right">User</span>
                <span className="w-28 text-right">Time</span>
              </div>
              {auditLog.map((entry) => (
                <div key={entry.id} className="border-b last:border-0">
                  <div
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm cursor-pointer hover:bg-muted/30"
                    onClick={() => setAuditExpanded(auditExpanded === entry.id ? null : entry.id)}
                  >
                    <span className="w-16">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        entry.action === "create" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : entry.action === "delete" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}>
                        {entry.action}
                      </span>
                    </span>
                    <p className="truncate font-medium">{entry.documentTitle}</p>
                    <span className="w-36 truncate text-right text-xs text-muted-foreground">{entry.email}</span>
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {auditExpanded === entry.id && (entry.contentBefore || entry.contentAfter) && (
                    <div className="border-t bg-muted/20 px-4 py-3 text-xs">
                      {entry.contentBefore && (
                        <div className="mb-2">
                          <p className="mb-0.5 font-medium text-muted-foreground">Before:</p>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border bg-background p-2">{entry.contentBefore}</pre>
                        </div>
                      )}
                      {entry.contentAfter && (
                        <div>
                          <p className="mb-0.5 font-medium text-muted-foreground">After:</p>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border bg-background p-2">{entry.contentAfter}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{auditLog.length} audit entr{auditLog.length === 1 ? "y" : "ies"}</p>
            <a href="/api/admin/export/audit-log" className="text-xs text-muted-foreground hover:text-foreground" download>Export CSV</a>
          </div>
        </section>
      )}

      {/* ── Notifications tab ── */}
      {dataTab === "notifications" && (
        <section className="mt-4 space-y-4">
          <div className="rounded-xl border bg-muted/30 p-5">
            <h3 className="mb-3 text-sm font-semibold">Create Notification</h3>
            <form onSubmit={createNotification} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Title *</label>
                <input className={input} placeholder="e.g. Scheduled maintenance tonight" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Message *</label>
                <textarea className={`${input} min-h-20 resize-none`} placeholder="Notification message…" value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Target</label>
                <select className={input} value={notifTarget} onChange={(e) => setNotifTarget(e.target.value as "all" | "specific")}>
                  <option value="all">All active users</option>
                  <option value="specific">Specific users (send manually)</option>
                </select>
              </div>
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Create</button>
            </form>
          </div>

          {notifications.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Title</span>
                <span className="w-20 text-center">Target</span>
                <span className="w-28 text-right">Status</span>
                <span className="w-28 text-right">Created</span>
                <span className="w-24 text-right">Actions</span>
              </div>
              {notifications.map((n) => (
                <div key={n.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{n.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{n.message}</p>
                  </div>
                  <span className="w-20 text-center">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{n.targetType}</span>
                  </span>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {n.sentAt
                      ? <span className="text-green-600">Sent {new Date(n.sentAt).toLocaleDateString()}</span>
                      : <span className="text-amber-600">Draft</span>}
                  </span>
                  <span className="w-28 text-right text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleDateString()}</span>
                  <span className="flex w-24 justify-end gap-2">
                    {!n.sentAt && (
                      <button
                        onClick={() => sendNotification(n.id)}
                        disabled={notifSending === n.id}
                        className="text-xs text-primary hover:opacity-80 disabled:opacity-40"
                      >
                        {notifSending === n.id ? "Sending…" : "Send"}
                      </button>
                    )}
                    <button onClick={() => deleteNotification(n.id)} className="text-xs text-destructive hover:opacity-80">Delete</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Maintenance tab ── */}
      {dataTab === "maintenance" && (
        <section className="mt-4">
          {maintenance === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-xl border p-5 ${maintenance.enabled ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "bg-muted/30"}`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Maintenance Mode</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">When enabled, only admins can access the platform.</p>
                  </div>
                  <button
                    onClick={() => {
                      setMaintenance((m) => m ? { ...m, enabled: !m.enabled } : m);
                    }}
                    className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors ${maintenance.enabled ? "bg-red-500" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${maintenance.enabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                <form onSubmit={saveMaintenance} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Maintenance message (shown to users)</label>
                    <textarea
                      className={`${input} min-h-16 resize-none`}
                      value={maintenanceMessage}
                      onChange={(e) => setMaintenanceMessage(e.target.value)}
                      placeholder="We'll be back shortly…"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={maintenanceSaving}
                    className={`rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 ${maintenance.enabled ? "bg-red-600" : "bg-primary"}`}
                  >
                    {maintenanceSaving ? "Saving…" : maintenance.enabled ? "Save & Activate Maintenance" : "Save (Maintenance Off)"}
                  </button>
                </form>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                <p className="font-medium">How maintenance mode works</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>• Signed-in non-admin users are redirected to the maintenance page</li>
                  <li>• Admin users can access the platform normally</li>
                  <li>• Chat API returns a maintenance error for non-admin requests</li>
                  <li>• Takes effect within 30 seconds (cached setting)</li>
                </ul>
              </div>
            </div>
          )}

          {/* Web Search settings (Phase 7) */}
          <div className="mt-6 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Live Web Search</h3>
                <p className="text-xs text-muted-foreground">
                  Answers current/real-time questions (news, prices, weather, office-holders) from the web.
                </p>
              </div>
              {webStatus && (
                <button
                  onClick={() => toggleWebSearch(!webStatus.enabled)}
                  className={`min-h-9 shrink-0 rounded-lg px-4 text-sm font-medium ${webStatus.enabled ? "bg-green-600 text-white" : "bg-muted text-foreground"}`}
                >
                  {webStatus.enabled ? "ON" : "OFF"}
                </button>
              )}
            </div>
            {webStatus && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Provider", value: webStatus.provider },
                  { label: "Cache entries", value: webStatus.cache.entries },
                  { label: "Cache hit rate", value: `${Math.round(webStatus.cache.hitRate * 100)}%` },
                  { label: "Last search", value: webStatus.lastSearchAt ? new Date(webStatus.lastSearchAt).toLocaleTimeString() : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border p-2 text-center">
                    <p className="text-sm font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            )}
            {webStatus && webStatus.productionGrade === false && (
              <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                ⚠️ No search API key configured — live web search is <strong>inactive in production</strong> until
                you add <code>TAVILY_API_KEY</code> (or <code>BRAVE_SEARCH_API_KEY</code> / <code>SERPER_API_KEY</code>)
                to the environment. The keyless provider is used in development only.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Health tab ── */}
      {dataTab === "health" && (
        <section className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">System Health</h3>
            <button
              onClick={loadHealth}
              disabled={healthLoading}
              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-40"
            >
              {healthLoading ? "Checking…" : "Refresh"}
            </button>
          </div>

          {health === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {healthLoading ? "Checking system health…" : "Click Refresh to check system health."}
            </p>
          ) : (
            <div className="space-y-3">
              {/* Overall status */}
              <div className={`flex items-center gap-3 rounded-xl border p-4 ${health.status === "healthy" ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"}`}>
                <span className={`size-3 rounded-full ${health.status === "healthy" ? "bg-green-500" : "bg-amber-500"}`} />
                <div>
                  <p className="text-sm font-medium capitalize">{health.status}</p>
                  <p className="text-xs text-muted-foreground">Checked {new Date(health.checkedAt).toLocaleTimeString()}</p>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">Uptime {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span>
              </div>

              {/* Database */}
              <div className="rounded-xl border p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Database (Neon)</span>
                  <span className={`flex items-center gap-1.5 ${health.database.ok ? "text-green-600" : "text-red-500"}`}>
                    <span className={`size-2 rounded-full ${health.database.ok ? "bg-green-500" : "bg-red-500"}`} />
                    {health.database.ok ? `${health.database.latencyMs}ms` : "Error"}
                  </span>
                </div>
                {health.database.error && <p className="mt-1 text-xs text-red-500">{health.database.error}</p>}
              </div>

              {/* AI Providers */}
              <div className="rounded-xl border p-4">
                <p className="mb-3 text-sm font-medium">AI Providers</p>
                <div className="space-y-2">
                  {health.providers.map((p) => (
                    <div key={p.provider} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{p.provider}</span>
                      <span className={`flex items-center gap-1.5 ${p.ok ? "text-green-600" : "text-red-500"}`}>
                        <span className={`size-2 rounded-full ${p.ok ? "bg-green-500" : "bg-red-500"}`} />
                        {p.ok ? `${p.latencyMs}ms` : (p.error?.includes("No API key") ? "Not configured" : "Unreachable")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Memory */}
              <div className="rounded-xl border p-4">
                <p className="mb-3 text-sm font-medium">Memory Usage</p>
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{health.memory.heapUsedMB}MB</p>
                    <p className="text-xs text-muted-foreground">Heap Used</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{health.memory.heapTotalMB}MB</p>
                    <p className="text-xs text-muted-foreground">Heap Total</p>
                  </div>
                  <div>
                    <p className="text-xl font-semibold tabular-nums">{health.memory.rssMB}MB</p>
                    <p className="text-xs text-muted-foreground">RSS</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Knowledge Gaps tab (Phase 3) ── */}
      {dataTab === "knowledge-gaps" && (
        <section className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            Unmet demand from the last 30 days. Click any query to draft a document for it.
          </p>
          {!gaps ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {[
                { title: "Zero-result queries", rows: gaps.zeroResultQueries, hint: "Wanted knowledge, retrieved nothing" },
                { title: "Clarification queries", rows: gaps.clarificationQueries, hint: "Router asked which area they meant" },
              ].map(({ title, rows, hint }) => (
                <div key={title} className="rounded-xl border p-4">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None.</p>
                  ) : (
                    <ul className="space-y-1">
                      {rows.map((r) => (
                        <li key={r.query} className="flex items-center justify-between gap-2 text-sm">
                          <button onClick={() => createDocFromQuery(r.query)} className="truncate text-left text-primary hover:underline">{r.query}</button>
                          <span className="shrink-0 tabular-nums text-muted-foreground">×{r.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <div className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Low-confidence queries</h3>
                <p className="mb-2 text-xs text-muted-foreground">Routed to a brain but with a weak margin</p>
                {gaps.lowConfidenceQueries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None.</p>
                ) : (
                  <ul className="space-y-1">
                    {gaps.lowConfidenceQueries.map((r) => (
                      <li key={r.query} className="flex items-center justify-between gap-2 text-sm">
                        <button onClick={() => createDocFromQuery(r.query)} className="truncate text-left text-primary hover:underline">{r.query}</button>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{r.confidence}% · ×{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border p-4">
                <h3 className="mb-2 text-sm font-semibold">Missing-topic suggestions</h3>
                {gaps.missingTopicSuggestions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing outstanding.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {gaps.missingTopicSuggestions.map((s) => (
                      <button key={s} onClick={() => createDocFromQuery(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-accent">+ {s}</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Query Tester tab (Phase 4) ── */}
      {dataTab === "query-tester" && (
        <section className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Run the live routing + retrieval decision path for a query. Read-only — no answer is generated.
          </p>
          <div className="flex gap-2">
            <input
              className={input}
              placeholder="e.g. what is negligence"
              value={qtInput}
              onChange={(e) => setQtInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runQueryTest(); }}
            />
            <button onClick={() => void runQueryTest()} disabled={qtLoading} className="shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {qtLoading ? "Testing…" : "Test"}
            </button>
          </div>
          {qtResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Routed brain", value: qtResult.multiBrains ? `multi: ${qtResult.multiBrains.join(", ")}` : (qtResult.routedBrain ?? "— none —") },
                  { label: `Confidence (≥${qtResult.confidenceThreshold})`, value: `${qtResult.confidence}%` },
                  { label: "Clarification", value: qtResult.clarificationDecision },
                  { label: "Wants retrieval", value: qtResult.wantRetrieval ? "yes" : "no" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border p-3">
                    <p className="text-sm font-semibold">{value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border p-3 text-sm">
                <p><span className="text-muted-foreground">Matched keywords:</span> {qtResult.matchedKeywords.length ? qtResult.matchedKeywords.join(", ") : "—"}</p>
                <p className="mt-1"><span className="text-muted-foreground">Reason:</span> {qtResult.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">Semantic threshold: {qtResult.semanticThreshold}</p>
              </div>
              {qtResult.retrieval.length === 0 ? (
                <p className="text-sm text-muted-foreground">No brain scoped → no retrieval (clarify or general answer).</p>
              ) : (
                qtResult.retrieval.map((b) => (
                  <div key={b.brain} className="rounded-xl border p-3">
                    <p className="mb-2 text-sm font-semibold capitalize">{b.brain}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Semantic</p>
                        {b.semantic.length === 0 ? <p className="text-xs text-muted-foreground">no hits ≥ threshold</p> : (
                          <ul className="space-y-1">{b.semantic.map((h) => (<li key={h.title} className="flex justify-between gap-2 text-sm"><span className="truncate">{h.title}</span><span className="tabular-nums text-muted-foreground">{h.score.toFixed(2)}</span></li>))}</ul>
                        )}
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Keyword</p>
                        {b.keyword.length === 0 ? <p className="text-xs text-muted-foreground">no hits</p> : (
                          <ul className="space-y-1">{b.keyword.map((h) => (<li key={h.title} className="flex justify-between gap-2 text-sm"><span className="truncate">{h.title}</span><span className="tabular-nums text-muted-foreground">{h.score}</span></li>))}</ul>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Brains tab ── */}
      {dataTab === "brains" && (
        <section className="mt-4">
          {brainForm !== null && (
            <div className="mb-6 rounded-xl border bg-muted/30 p-5">
              <h3 className="mb-4 text-sm font-semibold">{brainEditId ? "Edit Brain" : "Add Brain"}</h3>
              <form onSubmit={saveBrain} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                    <input className={input} value={brainForm.name} onChange={(e) => setBrainForm((f) => f && ({ ...f, name: e.target.value }))} placeholder="e.g. Legal Brain" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Slug *</label>
                    <input className={input} value={brainForm.slug} onChange={(e) => setBrainForm((f) => f && ({ ...f, slug: e.target.value }))} placeholder="e.g. legal" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Icon</label>
                    <input className={input} value={brainForm.icon} onChange={(e) => setBrainForm((f) => f && ({ ...f, icon: e.target.value }))} placeholder="🧠" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Color</label>
                    <input type="color" className="h-10 w-full rounded-lg border bg-background px-2" value={brainForm.color} onChange={(e) => setBrainForm((f) => f && ({ ...f, color: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
                    <input className={input} value={brainForm.description} onChange={(e) => setBrainForm((f) => f && ({ ...f, description: e.target.value }))} placeholder="What this brain covers…" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={brainSaving} className="min-h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {brainSaving ? "Saving…" : brainEditId ? "Save" : "Create Brain"}
                  </button>
                  <button type="button" onClick={() => { setBrainForm(null); setBrainEditId(null); }} className="min-h-10 rounded-lg border px-4 text-sm hover:bg-accent">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {brainForm === null && (
            <button onClick={openBrainAdd} className="mb-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              + Add Brain
            </button>
          )}

          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Icon</span><span>Brain</span><span className="w-16 text-center">Docs</span><span className="w-16 text-center">Chunks</span><span className="w-16 text-right">Type</span><span className="w-20 text-right">Actions</span>
            </div>
            {brains.map((b) => (
              <div key={b.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
                <span className="text-xl">{b.icon}</span>
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.description ?? b.slug}</p>
                </div>
                <span className="w-16 text-center text-xs tabular-nums">{b.documentCount ?? 0}</span>
                <span className="w-16 text-center text-xs tabular-nums">{b.chunkCount ?? 0}</span>
                <span className="w-16 text-right">
                  {b.isSystem ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">System</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Custom</span>
                  )}
                </span>
                <span className="flex w-20 justify-end gap-2">
                  <button onClick={() => openBrainEdit(b)} className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
                  {!b.isSystem && (
                    <button onClick={() => deleteBrain(b.id, b.name, b.isSystem)} className="text-xs text-destructive hover:opacity-80">Delete</button>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{brains.length} brain(s)</p>
        </section>
      )}

      {/* ── Knowledge Base tab ── */}
      {dataTab === "knowledge" && (
        <section className="mt-4">
          {formMode !== "hidden" && (
            <div className="mb-6 rounded-xl border bg-muted/30 p-5">
              <h3 className="mb-4 text-sm font-semibold">{formMode === "add" ? "Add Knowledge" : "Edit Knowledge"}</h3>
              <form onSubmit={saveKnowledge} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {formMode === "add" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">User *</label>
                      <select className={input} value={fUserId} onChange={(e) => { setFUserId(e.target.value); setFProjId(""); }}>
                        <option value="">Select user…</option>
                        {allUsers.map((u) => (<option key={u.id} value={u.id}>{u.email ?? u.id}</option>))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Project <span className="font-normal text-muted-foreground/70">(optional)</span></label>
                    <select className={input} value={fProjId} onChange={(e) => setFProjId(e.target.value)} disabled={formMode === "add" && !fUserId}>
                      <option value="">No project (user-level)</option>
                      {(formMode === "add" ? userProjects : allProjects).map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Brain <span className="font-normal text-muted-foreground/70">(optional)</span></label>
                    <select className={input} value={fBrainId} onChange={(e) => setFBrainId(e.target.value)}>
                      <option value="">No brain (global)</option>
                      {allBrainsOpt.map((b) => (<option key={b.id} value={b.id}>{b.icon} {b.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Visibility</label>
                    <select className={input} value={fVisibility} onChange={(e) => setFVisibility(e.target.value as "private" | "global")}>
                      <option value="private">🔒 Private — owner only</option>
                      <option value="global">🌐 Global — all users</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Title *</label>
                    <input className={input} placeholder="e.g. College" value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                    <select className={input} value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
                      <option value="">None</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Content *</label>
                  <textarea className={`${input} min-h-[140px] resize-y font-mono text-xs leading-relaxed`} placeholder="Paste knowledge here…" value={fContent} onChange={(e) => setFContent(e.target.value)} />
                  <p className="mt-0.5 text-xs text-muted-foreground">{fContent.length.toLocaleString()} characters — automatically chunked and indexed on save.</p>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={fSaving} className="min-h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {fSaving ? "Saving…" : formMode === "add" ? "Add to Knowledge Base" : "Save Changes"}
                  </button>
                  <button type="button" onClick={cancelForm} className="min-h-10 rounded-lg border px-4 text-sm hover:bg-accent">Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {formMode === "hidden" && (
              <button onClick={openAddForm} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">+ Add Knowledge</button>
            )}
            <input className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Search by title…" value={kSearch} onChange={(e) => setKSearch(e.target.value)} />
            <select className="rounded-lg border bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={kCatFilter} onChange={(e) => setKCatFilter(e.target.value)}>
              <option value="">All categories</option>
              {uniqueCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="rounded-lg border bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={kProjFilter} onChange={(e) => setKProjFilter(e.target.value)}>
              <option value="">All projects</option>
              {uniqueProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="rounded-lg border bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={kBrainFilter} onChange={(e) => setKBrainFilter(e.target.value)}>
              <option value="">All brains</option>
              {allBrainsOpt.map((b) => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}
            </select>
            <select className="rounded-lg border bg-background px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" value={kVisFilter} onChange={(e) => setKVisFilter(e.target.value)}>
              <option value="">All visibility</option>
              <option value="global">🌐 Global</option>
              <option value="private">🔒 Private</option>
            </select>
          </div>

          {filteredKnowledge.length === 0 ? (
            <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
              {knowledge.length === 0 ? 'No knowledge documents yet. Click "+ Add Knowledge" to get started.' : "No results match your filters."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Title</span>
                <span className="w-20 text-center">Visibility</span>
                <span className="w-24 text-center">Category</span>
                <span className="w-24 text-center">Brain</span>
                <span className="w-32">Project</span>
                <span className="w-24 text-right">Created</span>
                <span className="w-20 text-right">Actions</span>
              </div>
              {filteredKnowledge.map((doc) => (
                <div key={doc.id} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{doc.userEmail ?? doc.userId}</p>
                  </div>
                  <span className="w-20 text-center">
                    {doc.visibility === "global" ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">🌐 Global</span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">🔒 Private</span>
                    )}
                  </span>
                  <span className="w-24 text-center">
                    {doc.category ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs">{doc.category}</span> : <span className="text-xs text-muted-foreground">—</span>}
                  </span>
                  <span className="w-24 text-center">
                    {doc.brainName ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs">{doc.brainIcon} {doc.brainName}</span> : <span className="text-xs text-muted-foreground">—</span>}
                  </span>
                  <span className="w-32 truncate text-xs text-muted-foreground">{doc.projectName ?? <span className="italic">User-level</span>}</span>
                  <span className="w-24 text-right text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</span>
                  <span className="flex w-20 justify-end gap-2">
                    <button onClick={() => openEditForm(doc)} className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
                    <button onClick={() => deleteKnowledge(doc.id, doc.title)} className="text-xs text-destructive hover:opacity-80">Delete</button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">{filteredKnowledge.length} of {knowledge.length} document(s)</p>
        </section>
      )}
    </main>
  );
}
