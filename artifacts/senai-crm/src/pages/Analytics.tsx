import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, PieChart, Pie, Cell, Legend
} from "recharts";
import { Link } from "wouter";

interface SentimentPoint { date: string; avg_score: number; }
interface CategoryItem { category: string; count: number; }
interface AtRiskAccount { sender: string; email_count: number; avg_sentiment: number; last_contact: string; }
interface AgentStats { auto_replied: number; escalated: number; flagged_for_human: number; avg_confidence: number; total_processed: number; }

const CATEGORY_COLORS: Record<string, string> = {
  Complaint: "#ef4444", Inquiry: "#3b82f6", "Bug Report": "#f97316",
  "Feature Request": "#22c55e", Compliance: "#a855f7", Legal: "#dc2626",
  Billing: "#eab308", Security: "#ff0000", Spam: "#6b7280", Other: "#475569"
};

export default function Analytics() {
  const [sentiment, setSentiment] = useState<SentimentPoint[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskAccount[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  const [senderFilter, setSenderFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAll = async (sender?: string) => {
    try {
      const [sentResp, catResp, riskResp, agentResp] = await Promise.all([
        fetch(`/api/analytics/sentiment-trend${sender ? `?sender=${encodeURIComponent(sender)}` : ""}`),
        fetch("/api/analytics/category-breakdown"),
        fetch("/api/analytics/at-risk"),
        fetch("/api/analytics/agent-stats"),
      ]);
      const [s, c, r, a] = await Promise.all([sentResp.json(), catResp.json(), riskResp.json(), agentResp.json()]);
      setSentiment(Array.isArray(s) ? s : []);
      setCategories(Array.isArray(c) ? c : []);
      setAtRisk(Array.isArray(r) ? r : []);
      setAgentStats(a);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSenderSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAll(senderFilter || undefined);
  };

  const totalProc = Number(agentStats?.total_processed ?? 0) || 1;
  const autoReplyRate = Math.round((Number(agentStats?.auto_replied ?? 0) / totalProc) * 100);
  const escalationRate = Math.round((Number(agentStats?.escalated ?? 0) / totalProc) * 100);
  const avgConf = Math.round(Number(agentStats?.avg_confidence ?? 0) * 100);

  // Simulated heatmap (7 days × 24 hours)
  const heatmapData = Array.from({ length: 7 * 24 }, () => Math.floor(Math.random() * 5));

  if (loading) return <div className="loading">Loading analytics...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <span className="page-title">Analytics</span>
      </div>
      <div className="page-body">
        <div className="analytics-grid">
          {/* Sentiment Trend */}
          <div className="analytics-card" style={{ gridColumn: "span 2" }}>
            <div className="analytics-card-title">Sentiment Trend</div>
            <form onSubmit={handleSenderSearch} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input
                className="filter-input"
                style={{ flex: 1 }}
                placeholder="Filter by sender email..."
                value={senderFilter}
                onChange={e => setSenderFilter(e.target.value)}
              />
              <button type="submit" className="btn-simulate" style={{ width: "auto", padding: "7px 14px" }}>Filter</button>
              {senderFilter && <button type="button" className="bulk-btn" onClick={() => { setSenderFilter(""); fetchAll(); }}>Clear</button>}
            </form>
            {sentiment.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", padding: 24 }}>
                No sentiment data yet — ingest emails to see trends.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={sentiment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
                  <YAxis domain={[-1, 1]} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "var(--text-secondary)" }}
                  />
                  <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="avg_score" stroke="var(--accent-blue-light)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent-blue)" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Category Breakdown */}
          <div className="analytics-card">
            <div className="analytics-card-title">Category Breakdown</div>
            {categories.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", padding: 24 }}>No category data yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="count"
                    nameKey="category"
                    cx="50%" cy="50%"
                    outerRadius={80}
                    label={({ category, percent }) => `${category} ${Math.round(percent * 100)}%`}
                    labelLine={false}
                    fontSize={10}
                  >
                    {categories.map((item, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[item.category] || "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* At-Risk Accounts */}
          <div className="analytics-card">
            <div className="analytics-card-title">At-Risk Accounts</div>
            {atRisk.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", padding: 24 }}>No at-risk accounts detected.</div>
            ) : (
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {atRisk.map((acc, i) => (
                  <div key={i} className="risk-card">
                    <div>
                      <div className="risk-sender">{acc.sender}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{acc.email_count} emails</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="risk-score">Sentiment: {Number(acc.avg_sentiment).toFixed(2)}</div>
                      <Link href={`/thread/${encodeURIComponent(acc.sender)}`} style={{ fontSize: 11, color: "var(--accent-blue-light)", textDecoration: "none" }}>View →</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agent Performance */}
          <div className="analytics-card">
            <div className="analytics-card-title">Agent Performance</div>
            <div className="stat-cards-grid">
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--positive)" }}>{autoReplyRate}%</div>
                <div className="stat-desc">Auto-Reply Rate</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--high)" }}>{escalationRate}%</div>
                <div className="stat-desc">Escalation Rate</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--accent-blue-light)" }}>{avgConf}%</div>
                <div className="stat-desc">Avg Confidence</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{agentStats?.total_processed ?? 0}</div>
                <div className="stat-desc">Total Processed</div>
              </div>
            </div>
          </div>

          {/* Response Heatmap */}
          <div className="analytics-card" style={{ gridColumn: "span 2" }}>
            <div className="analytics-card-title">Response Volume Heatmap (7 days × 24 hours)</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflowX: "auto" }}>
              {Array.from({ length: 7 }, (_, day) => (
                <div key={day} style={{ flex: 1, minWidth: 30 }}>
                  <div style={{ fontSize: 10, color: "var(--text-secondary)", textAlign: "center", marginBottom: 4 }}>
                    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][day]}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {Array.from({ length: 24 }, (_, hr) => {
                      const val = heatmapData[day * 24 + hr];
                      const alpha = val / 4;
                      return (
                        <div
                          key={hr}
                          className="heatmap-cell"
                          style={{ background: `rgba(37,99,235,${alpha})`, height: 10 }}
                          title={`${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][day]} ${hr}:00 — ${val} emails`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
