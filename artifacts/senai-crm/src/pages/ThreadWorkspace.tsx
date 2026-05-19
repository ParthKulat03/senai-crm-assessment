import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";

interface ThreadData {
  thread: {
    thread_id: string; subject: string; sender_email: string;
    status: string; email_count: number; executive_summary?: string;
    last_updated_at: string;
  };
  emails: EmailRecord[];
  contact: Contact | null;
}

interface EmailRecord {
  id: string; sender: string; subject: string; body: string;
  timestamp: string; sentiment_score: number; sentiment_label: string;
  category: string; urgency: string; requires_human: boolean;
  confidence: number; suggested_reply: string | null;
  escalation_reason: string | null; policy_citations: string[];
  detected_entities: Record<string, string[]>;
  agent_reasoning_log?: ReasoningStep[] | string;
  action_type?: string;
}

interface ReasoningStep {
  thought: string; action: string;
  action_input?: Record<string, string>;
  observation?: string;
}

interface Contact {
  email: string; name?: string; company?: string;
  status?: string; account_value?: number; churn_risk_score?: number;
}

function highlightBody(text: string): string {
  if (!text) return "";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/(\$[\d,]+(?:\.\d{2})?)/g, '<mark class="money">$1</mark>')
    .replace(/(#\d+)/g, '<mark class="ticket">$1</mark>')
    .replace(/\b(by|before|within)\s+(\w+)\s+(hour|day|week|month)s?\b/gi, '<mark class="deadline">$&</mark>');
}

function SentimentSparkline({ emails }: { emails: EmailRecord[] }) {
  const scored = emails.filter(e => e.sentiment_score != null);
  if (scored.length === 0) return null;
  const w = 100 / scored.length;
  return (
    <svg className="sparkline" viewBox={`0 0 100 40`} preserveAspectRatio="none">
      <line x1="0" y1="20" x2="100" y2="20" stroke="var(--border)" strokeWidth="0.5" />
      {scored.map((e, i) => {
        const s = Number(e.sentiment_score);
        const y = 20 - s * 18;
        const x = i * w + w / 2;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="2" fill={s > 0.3 ? "var(--positive)" : s < -0.3 ? "var(--negative)" : "var(--neutral)"} />
          </g>
        );
      })}
      {scored.length > 1 && (
        <polyline
          points={scored.map((e, i) => `${i * w + w / 2},${20 - Number(e.sentiment_score) * 18}`).join(" ")}
          fill="none"
          stroke="var(--accent-blue)"
          strokeWidth="1"
          opacity="0.5"
        />
      )}
    </svg>
  );
}

function ReasoningPanel({ log }: { log?: ReasoningStep[] | string | null }) {
  const [open, setOpen] = useState(false);
  if (!log) return null;
  let steps: ReasoningStep[] = [];
  if (typeof log === "string") {
    try { steps = JSON.parse(log); } catch { return null; }
  } else if (Array.isArray(log)) {
    steps = log;
  }
  if (steps.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <span>Agent Reasoning ({steps.length} steps)</span>
        <span>{open ? "▲" : "▼"}</span>
      </div>
      {open && steps.map((step, i) => (
        <div key={i} className="reasoning-step">
          <div className="step-thought">💭 {step.thought}</div>
          <span className="step-action">⚡ {step.action}</span>
          {step.observation && <div className="step-observation">→ {step.observation}</div>}
        </div>
      ))}
    </div>
  );
}

function CitationsPanel({ citations }: { citations?: string[] }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <span>Policy Citations ({citations.length})</span>
        <span>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "8px 0", display: "flex", flexWrap: "wrap" }}>
          {citations.map((c, i) => (
            <span key={i} className="citation-chip">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ThreadWorkspace() {
  const { threadId } = useParams<{ threadId: string }>();
  const [data, setData] = useState<ThreadData | null>(null);
  const [activeEmail, setActiveEmail] = useState<EmailRecord | null>(null);
  const [reply, setReply] = useState("");
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!threadId) return;
    fetch(`/api/threads/${threadId}`)
      .then(r => r.json())
      .then((d: ThreadData) => {
        setData(d);
        if (d.emails?.length > 0) {
          const latest = d.emails[d.emails.length - 1];
          setActiveEmail(latest);
          setReply(latest.suggested_reply || "");
        }
      })
      .catch(console.error);
  }, [threadId]);

  if (!data) {
    return (
      <div className="thread-layout">
        <div style={{ padding: 24, flex: 1 }}>
          <div className="loading">Loading thread...</div>
        </div>
      </div>
    );
  }

  const { thread, emails, contact } = data;
  const email = activeEmail || emails[emails.length - 1];

  const sentimentClass = (score?: number) => {
    const s = Number(score ?? 0);
    if (s > 0.3) return "sentiment-positive";
    if (s < -0.3) return "sentiment-negative";
    return "sentiment-neutral";
  };

  const urgencyBadgeMap: Record<string, string> = {
    Critical: "badge-critical", High: "badge-high", Medium: "badge-medium", Low: "badge-low"
  };

  const churnRisk = Number(contact?.churn_risk_score ?? 0);
  const churnClass = churnRisk > 0.6 ? "churn-high" : churnRisk > 0.35 ? "churn-med" : "churn-low";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Link href="/" className="back-link">← Back to Inbox</Link>
      <div className="thread-layout" style={{ flex: 1 }}>
        {/* LEFT — Email body */}
        <div className="thread-col thread-col-left">
          <div className="col-title">Current Email</div>
          {email && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{email.sender}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>{email.subject}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {new Date(email.timestamp).toLocaleString()}
                </div>
              </div>
              <div
                className="email-body-text"
                dangerouslySetInnerHTML={{ __html: highlightBody(email.body || "") }}
              />
              <div className="meta-card">
                <div className="meta-row">
                  <span className="meta-label">Category</span>
                  <span className="badge badge-blue">{email.category || "—"}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Sentiment</span>
                  <span>{email.sentiment_label || "—"} ({Number(email.sentiment_score ?? 0).toFixed(2)})</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Urgency</span>
                  <span className={`badge ${urgencyBadgeMap[email.urgency] || "badge-low"}`}>{email.urgency || "—"}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Confidence</span>
                  <span>{email.confidence ? `${Math.round(Number(email.confidence) * 100)}%` : "—"}</span>
                </div>
                {email.confidence && (
                  <div className="confidence-bar">
                    <div className="confidence-fill" style={{ width: `${Math.round(Number(email.confidence) * 100)}%` }} />
                  </div>
                )}
                {email.policy_citations && email.policy_citations.length > 0 && (
                  <div style={{ paddingTop: 8 }}>
                    <div className="meta-label" style={{ marginBottom: 4 }}>Policy Citations</div>
                    <div>{email.policy_citations.map((c, i) => <span key={i} className="citation-chip">{c}</span>)}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* CENTER — Thread timeline */}
        <div className="thread-col thread-col-center">
          <div className="col-title">Thread Timeline</div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              {thread.executive_summary || thread.subject}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>
              {emails.length} emails · {thread.status}
            </div>
            <SentimentSparkline emails={emails} />
          </div>
          {emails.map(e => (
            <div
              key={e.id}
              className={`thread-email-card ${sentimentClass(e.sentiment_score)} ${activeEmail?.id === e.id ? "ring-1" : ""}`}
              style={activeEmail?.id === e.id ? { outline: "1px solid var(--accent-blue)" } : {}}
              onClick={() => {
                setActiveEmail(e);
                setReply(e.suggested_reply || "");
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div className="avatar-circle">{e.sender.slice(0, 2).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{e.sender}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {new Date(e.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              {expandedEmails.has(e.id) ? (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {e.body}
                  <button
                    style={{ marginLeft: 8, fontSize: 11, color: "var(--accent-blue-light)", background: "none", border: "none", cursor: "pointer" }}
                    onClick={(ev) => { ev.stopPropagation(); setExpandedEmails(prev => { const n = new Set(prev); n.delete(e.id); return n; }); }}
                  >Collapse</button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "flex-end", gap: 6 }}>
                  <span>{(e.body || "").slice(0, 150)}...</span>
                  <button
                    style={{ fontSize: 11, color: "var(--accent-blue-light)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
                    onClick={(ev) => { ev.stopPropagation(); setExpandedEmails(prev => new Set(prev).add(e.id)); }}
                  >Expand</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* RIGHT — Contact + AI panels */}
        <div className="thread-col thread-col-right">
          {email?.requires_human && (
            <div className={`warning-banner ${email.category === "Security" ? "warning-security" : "warning-human"}`}>
              {email.category === "Security" ? "🚨 SECURITY THREAT — Do not auto-reply" : "⚠ Requires Human Review"}
              {email.escalation_reason && (
                <div style={{ fontWeight: 400, marginTop: 4, fontSize: 11 }}>{email.escalation_reason}</div>
              )}
            </div>
          )}

          {contact && (
            <div className="contact-card">
              <div className="col-title" style={{ marginBottom: 10 }}>Contact</div>
              <div className="contact-name">{contact.name || contact.email.split("@")[0]}</div>
              <div className="contact-email">{contact.email}</div>
              {contact.company && <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{contact.company}</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <span className="badge badge-blue">{contact.status || "Active"}</span>
                <span className="badge badge-neutral">${Number(contact.account_value ?? 0).toFixed(2)}/mo</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "var(--text-secondary)" }}>Churn Risk</span>
                  <span style={{ color: churnRisk > 0.6 ? "var(--negative)" : "var(--text-secondary)" }}>
                    {Math.round(churnRisk * 100)}%
                  </span>
                </div>
                <div className="churn-bar">
                  <div className={`churn-fill ${churnClass}`} style={{ width: `${churnRisk * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          <ReasoningPanel log={email?.agent_reasoning_log} />
          <CitationsPanel citations={email?.policy_citations} />

          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            <div className="col-title" style={{ marginBottom: 10 }}>Actions</div>
            {email?.suggested_reply ? (
              <textarea
                className="reply-textarea"
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Suggested reply..."
              />
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, fontStyle: "italic" }}>
                No suggested reply (requires human review)
              </div>
            )}
            <div className="action-buttons">
              {email?.suggested_reply && (
                <button className="action-btn btn-approve">✓ Approve & Send</button>
              )}
              <button className="action-btn btn-edit">✏ Edit Draft</button>
              <button className="action-btn btn-escalate">⚡ Escalate</button>
              <button className="action-btn btn-spam">🚫 Mark Spam</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
