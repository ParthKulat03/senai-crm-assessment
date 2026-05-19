import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

interface Stats {
  pending: number; replied: number; escalated: number;
  critical: number; spam: number; needs_human: number; total: number;
}

interface Email {
  id: string; thread_id: string; message_id: string; sender: string;
  subject: string; body: string; timestamp: string;
  sentiment_score: number; sentiment_label: string; category: string;
  urgency: string; requires_human: boolean; confidence: number;
  suggested_reply: string; is_spam: boolean; is_internal: boolean;
  status: string; heuristic_flags: string[];
}

function relativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SentimentBadge({ score, label }: { score?: number; label?: string }) {
  const s = Number(score ?? 0);
  let cls = "badge-neutral", txt = label || "Neutral";
  if (s > 0.3) { cls = "badge-positive"; txt = label || "Positive"; }
  else if (s < -0.3) { cls = "badge-negative"; txt = label || "Negative"; }
  else if (label === "Mixed") { cls = "badge-mixed"; txt = "Mixed"; }
  return <span className={`badge ${cls}`}>{txt} {score != null ? `(${s.toFixed(2)})` : ""}</span>;
}

function UrgencyBadge({ urgency }: { urgency?: string }) {
  const map: Record<string, string> = { Critical: "badge-critical pulse", High: "badge-high", Medium: "badge-medium", Low: "badge-low" };
  return <span className={`badge ${map[urgency || "Low"] ?? "badge-low"}`}>{urgency || "Low"}</span>;
}

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  return <span className="badge badge-blue">{category}</span>;
}

const TABS = [
  { key: "all", label: "All" },
  { key: "needs_human", label: "Needs Human" },
  { key: "replied", label: "Auto-Replied" },
  { key: "escalated", label: "Escalated" },
  { key: "spam", label: "Spam" },
  { key: "internal", label: "Internal" },
];

export default function Inbox() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clock, setClock] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/stats");
      const d = await r.json();
      setStats(d);
    } catch {}
  }, []);

  const fetchEmails = useCallback(async () => {
    try {
      const params = new URLSearchParams({ tab, limit: "100" });
      if (search) params.set("search", search);
      if (urgencyFilter) params.set("urgency", urgencyFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const r = await fetch(`/api/dashboard/emails?${params}`);
      const d = await r.json();
      setEmails(d.emails || []);
      setTotal(d.total || 0);
    } catch {}
  }, [tab, search, urgencyFilter, categoryFilter]);

  useEffect(() => { fetchStats(); fetchEmails(); }, [fetchStats, fetchEmails]);
  useEffect(() => {
    const si = setInterval(fetchStats, 5000);
    const ei = setInterval(fetchEmails, 10000);
    return () => { clearInterval(si); clearInterval(ei); };
  }, [fetchStats, fetchEmails]);

  const tabCounts: Record<string, number> = {
    all: stats?.total ?? 0,
    needs_human: stats?.needs_human ?? 0,
    replied: stats?.replied ?? 0,
    escalated: stats?.escalated ?? 0,
    spam: stats?.spam ?? 0,
    internal: 0,
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="page-title">SenAI Mission Control</span>
          <span className="live-dot">LIVE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {stats ? (
            <div className="stats-bar">
              <div className="stat-chip"><span className="stat-label">Pending</span><span className="stat-val">{stats.pending}</span></div>
              <div className="stat-chip"><span className="stat-label">Escalated</span><span className="stat-val" style={{ color: "var(--high)" }}>{stats.escalated}</span></div>
              <div className="stat-chip"><span className="stat-label">Critical</span><span className="stat-val" style={{ color: "var(--critical)" }}>{stats.critical}</span></div>
              <div className="stat-chip"><span className="stat-label">Spam</span><span className="stat-val">{stats.spam}</span></div>
              <div className="stat-chip"><span className="stat-label">Total</span><span className="stat-val">{stats.total}</span></div>
            </div>
          ) : (
            <div className="skeleton" style={{ width: 300, height: 28 }} />
          )}
          <span className="live-clock">{clock}</span>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="tab-count">{tabCounts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <input
          className="filter-input"
          placeholder="Search sender, subject..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}>
          <option value="">All Urgency</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select className="filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          <option value="Complaint">Complaint</option>
          <option value="Inquiry">Inquiry</option>
          <option value="Bug Report">Bug Report</option>
          <option value="Feature Request">Feature Request</option>
          <option value="Compliance">Compliance</option>
          <option value="Legal">Legal</option>
          <option value="Billing">Billing</option>
          <option value="Security">Security</option>
          <option value="Other">Other</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{total} results</span>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} selected</span>
          <button className="bulk-btn">Mark Spam</button>
          <button className="bulk-btn">Archive</button>
          <button className="bulk-btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="email-list">
        {emails.length === 0 && (
          <div className="loading">
            {stats === null ? "Loading..." : "No emails found. Click '▶ Simulate Emails' to ingest test data."}
          </div>
        )}
        {emails.map(email => (
          <div
            key={email.id}
            className={`email-row ${email.is_spam ? "spam-row" : ""}`}
            onClick={() => navigate(`/thread/${email.thread_id}`)}
          >
            <div className={`urgency-bar ${(email.urgency || "low").toLowerCase()}`} />
            <input
              type="checkbox"
              className="email-checkbox"
              checked={selected.has(email.id)}
              onClick={(e) => toggleSelect(email.id, e)}
              readOnly
            />
            <div className="email-info">
              <div className="email-sender">{email.sender}</div>
              <div className="email-subject">{(email.subject || "").slice(0, 60)}</div>
            </div>
            <div className="email-meta">
              {email.is_spam && <span className="badge badge-spam">SPAM</span>}
              {email.requires_human && <span className="human-flag" title="Requires human review">🔴</span>}
              <SentimentBadge score={email.sentiment_score} label={email.sentiment_label} />
              <UrgencyBadge urgency={email.urgency} />
              {email.category && <CategoryBadge category={email.category} />}
              <span className="email-time">{relativeTime(email.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
