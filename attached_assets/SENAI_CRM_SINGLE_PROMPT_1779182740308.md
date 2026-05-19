Build a complete full-stack AI-powered CRM system called "SenAI CRM" from scratch. Use Node.js + Express for the backend, React (Vite) for the frontend, Replit's built-in PostgreSQL as the database, and the Groq API (model: llama3-70b-8192) for all LLM calls. Do NOT use OpenAI. Do NOT use any paid external database or vector store.

---

## SECRETS REQUIRED
- GROQ_API_KEY — from console.groq.com (user will provide)
- DATABASE_URL — auto-provided by Replit PostgreSQL (do not ask user for this)
- SESSION_SECRET — hardcode as "senai_crm_secret_2024" if not provided

---

## PROJECT FILE STRUCTURE

Create exactly this structure:

```
/
├── server/
│   ├── index.js
│   ├── db.js
│   ├── routes/
│   │   ├── ingest.js
│   │   ├── threads.js
│   │   ├── analytics.js
│   │   ├── rag.js
│   │   ├── agent.js
│   │   ├── contacts.js
│   │   ├── dashboard.js
│   │   └── intelligence.js
│   ├── services/
│   │   ├── heuristicFilter.js
│   │   ├── llmClassifier.js
│   │   ├── ragPipeline.js
│   │   ├── agentRunner.js
│   │   └── sentimentTracker.js
│   └── knowledge/
│       ├── pricing_policy.md
│       ├── sla_policy.md
│       ├── refund_policy.md
│       ├── api_docs.md
│       ├── compliance_faq.md
│       └── escalation_matrix.md
├── client/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── App.css
│       └── pages/
│           ├── Inbox.jsx
│           ├── ThreadWorkspace.jsx
│           └── Analytics.jsx
├── email-data-advanced.json   ← user will upload this file
├── package.json
└── .replit
```

---

## PART 1 — DATABASE (db.js + migrations)

### db.js
Connect to PostgreSQL using process.env.DATABASE_URL. Export a `query(text, params)` helper and a `runMigrations()` function. Call runMigrations on server start.

### Tables to create (run on startup if not exist):

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  company VARCHAR(255),
  status VARCHAR(50) DEFAULT 'Active',
  account_value DECIMAL(12,2) DEFAULT 0,
  churn_risk_score DECIMAL(3,2) DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id VARCHAR(255) UNIQUE NOT NULL,
  subject VARCHAR(500),
  sender_email VARCHAR(255) NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'Open',
  email_count INTEGER DEFAULT 0,
  executive_summary TEXT
);

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id VARCHAR(255),
  message_id VARCHAR(255) UNIQUE NOT NULL,
  sender VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  body TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  sentiment_score DECIMAL(4,2),
  sentiment_label VARCHAR(50),
  category VARCHAR(100),
  urgency VARCHAR(50),
  requires_human BOOLEAN DEFAULT FALSE,
  confidence DECIMAL(4,2),
  suggested_reply TEXT,
  policy_citations JSONB DEFAULT '[]',
  detected_entities JSONB DEFAULT '{}',
  escalation_reason TEXT,
  status VARCHAR(50) DEFAULT 'Received',
  is_spam BOOLEAN DEFAULT FALSE,
  is_internal BOOLEAN DEFAULT FALSE,
  heuristic_flags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id UUID,
  action_type VARCHAR(100),
  proposed_content TEXT,
  agent_reasoning_log JSONB DEFAULT '[]',
  is_approved BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_doc VARCHAR(255) NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER,
  keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id UUID,
  title VARCHAR(500),
  body TEXT,
  assignee VARCHAR(255),
  priority VARCHAR(50) DEFAULT 'Medium',
  status VARCHAR(50) DEFAULT 'Open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  action VARCHAR(255),
  performed_by VARCHAR(255) DEFAULT 'system',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  diff JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_timestamp ON emails(timestamp);
CREATE INDEX IF NOT EXISTS idx_threads_sender ON threads(sender_email);
```

---

## PART 2 — KNOWLEDGE BASE FILES

Create these files in server/knowledge/ with exactly this content:

### server/knowledge/pricing_policy.md
```
# Pricing Policy
## Plans
- Starter: $49/month — 3 users, 1000 emails/month
- Standard: $149/month — 15 users, 10000 emails/month
- Professional: $399/month — 50 users, 50000 emails/month
- Enterprise: Custom pricing, unlimited users, dedicated SLA

## Non-Profit Discount
Registered non-profits (501c3 or equivalent) receive 30% off the Standard plan on annual subscriptions upon verified proof of status.

## Pro-Rata Billing
Upgrades mid-cycle are charged as: (days remaining / total days) × price difference. Downgrades take effect next billing cycle. No pro-rata credits for downgrades.

## Annual Billing
Annual subscriptions get 2 months free (16.7% discount). Annual contracts are non-refundable after 30 days.

## Enterprise
Enterprise deals (50+ seats) negotiated individually. Typical: $15-$25/seat/month. Volume discounts at 100+ seats.

## White-label
White-label branding available at $200/month for Enterprise plans only.
```

### server/knowledge/sla_policy.md
```
# SLA Policy
## Uptime Guarantee
99.9% monthly uptime guaranteed for all paid plans. Maximum 43.8 minutes unplanned downtime per month.

## Incident Classification
- P0 Critical: Full outage, all users affected. Response: 15 min. Resolution: 4 hours.
- P1 High: Major feature down or 50%+ users affected. Response: 1 hour. Resolution: 8 hours.
- P2 Medium: Partial degradation, workaround exists. Response: 4 hours. Resolution: 24 hours.
- P3 Low: Minor cosmetic issues. Response: 1 business day.

## SLA Credits
- 99.0-99.9% uptime: 10% service credit
- 95.0-99.0%: 25% service credit
- Below 95%: 50% service credit
Credits applied to next invoice. Credits are the sole remedy — no cash refunds for SLA breaches.

## Root Cause Analysis
P0 incidents: RCA within 24 hours of resolution. P1: RCA within 72 hours. RCA must include: timeline, root cause, impact, corrective actions, preventive measures.

## Enterprise SLA
Enterprise can negotiate 99.95% uptime, 5-minute P0 response, dedicated incident commander.
```

### server/knowledge/refund_policy.md
```
# Refund Policy
## Standard Window
Refunds available within 14 days of initial purchase for new customers. After 14 days, no monetary refunds.

## Eligible Scenarios
- Service inaccessible 48+ hours due to our error
- Accidental duplicate charges
- Plan purchased in error within 48 hours with no usage

## Credits vs Refunds
When monetary refund is not applicable:
- Verified service issues: 1.5x credit (e.g. $100 issue = $150 credit)
- Goodwill retention: up to 1 month free (manager approval required)
- Credits expire after 12 months

## Exception Process
Beyond 14 days: requires CSM review, VP approval for amounts over $500. Processing: 5-10 business days.

## Churn Retention Playbook
1. Acknowledge the issue immediately — never be defensive
2. Offer 30-day free extension as goodwill gesture (no approval required)
3. Escalate to CSM for accounts over $500/month
4. For VIP accounts over $2000/month: escalate to VP Customer Success immediately
5. If public review threat (Twitter, G2, Trustpilot): add 15% loyalty discount offer
6. Document all retention interactions in CRM
```

### server/knowledge/api_docs.md
```
# API Documentation
## Authentication
All requests require Bearer token: Authorization: Bearer YOUR_API_KEY
v2 API requires separate v2-scoped key. v1 keys do NOT work on v2 endpoints.

## Rate Limits
- Starter: 100 req/min
- Standard: 1000 req/min
- Professional: 5000 req/min
- Enterprise: 10000 req/min (negotiable)

## v1 Deprecation
API v1 is deprecated and will be sunset December 31 2023. All integrations must migrate to v2. v1 endpoints return HTTP 410 after sunset.

## v2 Breaking Changes from v1
1. New auth: v2 requires X-API-Key-V2 header in addition to Bearer token
2. Paginated responses: all list endpoints return { data: [], pagination: { page, per_page, total } }
3. Webhook signatures: v2 uses HMAC-SHA256 in X-Webhook-Signature header
4. Error format changed: v2 uses { error_code, message, details }

## Common Errors
- 403 on /v2/events: You are using a v1 API key. Generate a v2 key in the dashboard settings.
- 429 Too Many Requests: Rate limit exceeded. Retry after X-RateLimit-Reset header timestamp.
- 422 Unprocessable Entity: Invalid payload schema.
```

### server/knowledge/compliance_faq.md
```
# Compliance FAQ
## HIPAA
We offer a HIPAA Business Associate Agreement (BAA) for Enterprise customers. Controls: AES-256 encryption at rest, TLS 1.3 in transit, role-based access control, audit logging, annual workforce training, incident response procedures. Contact enterprise@company.com to request BAA. Processing: 3-5 business days.

## GDPR
We are GDPR compliant. A Data Processing Agreement (DPA) is available for all customers.

GDPR Article 20 — Right to Data Portability: We honor all data portability requests within the statutory 30-day window. Submit to privacy@company.com. Data provided in JSON or CSV format. THIS IS A LEGAL OBLIGATION — route to legal/compliance team immediately.

GDPR Article 17 — Right to Erasure: Data deletion within 30 days. Backups purged within 90 days. Some data may be retained for legal compliance.

EU Data Residency: Available for Enterprise customers. Data stored in Frankfurt by default for EU customers.

## SOC 2
We hold SOC 2 Type II certification covering Security, Availability, and Confidentiality. Last audit: Q3 2023. Report available to Enterprise customers under NDA.

## Data Retention
User data retained for subscription duration plus 90 days after cancellation, then permanently deleted.
```

### server/knowledge/escalation_matrix.md
```
# Escalation Matrix

## Legal Threats (Lawsuits, GDPR Formal Requests, Cease & Desist)
Route to: legal@company.com
Action: Flag email, DO NOT auto-reply, create legal ticket
Response SLA: Legal team acknowledges within 2 business hours
Send holding reply: "We have received your request and our legal team will be in touch within 2 business days."

## Security Incidents (Ransomware, Suspicious Login, Data Breach)
Route to: security@company.com + CTO
Action: CRITICAL ALERT — DO NOT REPLY TO ATTACKER — NEVER auto-reply
Response SLA: 15 minutes
Never: share internal details, acknowledge to attacker, auto-reply

## PR and Reputation Crisis (Public Review Threats, Press Inquiries)
Route to: pr@company.com
Trigger: customer mentions Twitter, G2, Trustpilot, TechCrunch, media
Retention offer: CSM authorized to offer 1 month free + 15% loyalty discount for VIP accounts
Press inquiries: route to CEO/CMO, do not comment without approval

## VIP Churn Risk
Trigger: account value over $2000/month OR sentiment score below -0.6 for 3+ emails
Route to: VP Customer Success
Response SLA: 2 hours
Authorized offers: up to 2 months free, custom pricing, dedicated support

## GDPR Requests
Route to: privacy@company.com and legal@company.com
Mandatory: create compliance ticket, send auto-acknowledgement within 24 hours
Statutory deadline: 30 days from request date
Never: treat as generic inquiry or delay routing

## P0 Incidents
Route to: on-call engineer + Engineering Manager
SLA: 15-minute response, 4-hour resolution
Customer comms: update every 30 minutes until resolved
Post-incident: RCA within 24 hours

## Billing/Refund Disputes over $500
Route to: VP Customer Success + Finance
CSM can approve up to $200 without approval, VP approves up to $2000
```

---

## PART 3 — HEURISTIC FILTER (server/services/heuristicFilter.js)

```javascript
const SPAM_KEYWORDS = ['seo', 'front page of google', 'boost your seo', 'limited offer', 'click here to claim', 'make money', 'free!!!', '300%', 'just $99'];
const SPAM_DOMAINS = ['marketing-guru.io', 'spam-domain.com', 'promo-blast.net'];
const SECURITY_KEYWORDS = ['ransomware', 'send 2 btc', 'bitcoin', 'suspicious login', 'data breach', 'malware', 'hack', 'pyongyang', 'north korea', 'compromised credentials', 'your files are encrypted'];
const LEGAL_KEYWORDS = ['gdpr', 'article 20', 'data portability', 'cease and desist', 'lawsuit', 'attorney', 'legal action', 'formal request', 'statutory', 'right to erasure'];
const URGENCY_KEYWORDS = ['urgent', 'p0', 'production down', 'outage', 'critical', 'losing $', 'immediately', 'legal', 'lawyer', 'legal team'];
const INTERNAL_DOMAINS = ['internal.com', 'mycompany.com'];

function runHeuristicFilter(email) {
  const text = `${email.subject || ''} ${email.body || ''}`.toLowerCase();
  const senderDomain = (email.sender || '').split('@')[1]?.toLowerCase() || '';

  const result = { isSpam: false, isInternal: false, isSecurity: false, isLegal: false, urgencyScore: 0, flags: [], initialPriority: 'Low' };

  if (INTERNAL_DOMAINS.some(d => senderDomain.includes(d))) {
    result.isInternal = true;
    result.flags.push('INTERNAL');
    return result;
  }

  const spamHits = SPAM_KEYWORDS.filter(k => text.includes(k)).length;
  if (spamHits >= 2 || SPAM_DOMAINS.some(d => senderDomain.includes(d))) {
    result.isSpam = true;
    result.flags.push('SPAM');
    return result;
  }

  if (SECURITY_KEYWORDS.some(k => text.includes(k))) {
    result.isSecurity = true;
    result.urgencyScore = 100;
    result.initialPriority = 'Critical';
    result.flags.push('SECURITY_THREAT');
  }

  if (LEGAL_KEYWORDS.some(k => text.includes(k))) {
    result.isLegal = true;
    result.initialPriority = 'Critical';
    result.flags.push('LEGAL_FLAG');
  }

  const urgencyHits = URGENCY_KEYWORDS.filter(k => text.includes(k)).length;
  if (!result.isSecurity) {
    result.urgencyScore = Math.min(100, urgencyHits * 25);
  }

  if (!result.isSecurity && !result.isLegal) {
    if (result.urgencyScore >= 75) result.initialPriority = 'Critical';
    else if (result.urgencyScore >= 50) result.initialPriority = 'High';
    else if (result.urgencyScore >= 25) result.initialPriority = 'Medium';
    else result.initialPriority = 'Low';
  }

  return result;
}

module.exports = { runHeuristicFilter };
```

---

## PART 4 — RAG PIPELINE (server/services/ragPipeline.js)

Implement keyword-based retrieval (no external vector DB needed):

```javascript
const fs = require('fs');
const path = require('path');
const { query } = require('../db');

function chunkText(text, chunkSize = 400, overlap = 50) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

function extractKeywords(text) {
  const stopwords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','this','that','these','those','it','its','we','you','i','my','your','our','their','not','no','as','if','then','than','so','up','out','about','into','through','during','before','after','above','below','between','each','all','any','both','few','more','most','other','some','such','only','own','same','than','too','very','just','but','can','will','shall']);
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w));
}

function scoreChunk(chunkKeywords, queryKeywords) {
  if (!chunkKeywords || chunkKeywords.length === 0) return 0;
  const querySet = new Set(queryKeywords);
  const matches = chunkKeywords.filter(k => querySet.has(k)).length;
  return matches / Math.max(queryKeywords.length, 1);
}

async function seedKnowledgeBase() {
  const existing = await query('SELECT COUNT(*) as count FROM knowledge_chunks');
  if (parseInt(existing.rows[0].count) > 0) {
    console.log('Knowledge base already seeded, skipping.');
    return;
  }
  const kbDir = path.join(__dirname, '../knowledge');
  const files = fs.readdirSync(kbDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(kbDir, file), 'utf8');
    const chunks = chunkText(content);
    for (let i = 0; i < chunks.length; i++) {
      const keywords = [...new Set(extractKeywords(chunks[i]))];
      await query(
        'INSERT INTO knowledge_chunks (source_doc, chunk_text, chunk_index, keywords) VALUES ($1, $2, $3, $4)',
        [file, chunks[i], i, keywords]
      );
    }
  }
  console.log(`Knowledge base seeded: ${files.length} documents.`);
}

async function retrieveRelevantChunks(queryText, topK = 3) {
  const queryKeywords = extractKeywords(queryText);
  const result = await query('SELECT id, source_doc, chunk_text, keywords FROM knowledge_chunks');
  const scored = result.rows.map(row => ({
    ...row,
    score: scoreChunk(row.keywords, queryKeywords)
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter(c => c.score > 0);
}

module.exports = { seedKnowledgeBase, retrieveRelevantChunks, extractKeywords };
```

---

## PART 5 — LLM CLASSIFIER (server/services/llmClassifier.js)

```javascript
const axios = require('axios');

async function classifyEmail(email, threadHistory = [], ragChunks = []) {
  const contextChunks = ragChunks.map(c => `[${c.source_doc}]: ${c.chunk_text}`).join('\n\n');
  const threadContext = threadHistory.length > 0
    ? threadHistory.map(e => `[${e.timestamp}] FROM: ${e.sender}\nSUBJECT: ${e.subject}\n${e.body?.slice(0, 300)}`).join('\n---\n')
    : 'No prior thread history.';

  const systemPrompt = `You are a precise AI triage agent for a B2B SaaS customer support team. Classify incoming emails accurately. CRITICAL RULES:
1. Ransomware/security threats: category=Legal OR Security, urgency=Critical, requires_human=true, suggested_reply=null — NEVER suggest a reply
2. GDPR requests: category=Compliance, urgency=Critical, requires_human=true
3. If confidence < 0.70: requires_human=true
4. Respond ONLY with valid JSON — no markdown, no explanation, no backticks.`;

  const userPrompt = `KNOWLEDGE BASE CONTEXT:
${contextChunks || 'No relevant KB context found.'}

THREAD HISTORY:
${threadContext}

CURRENT EMAIL TO CLASSIFY:
Message ID: ${email.message_id}
From: ${email.sender}
Subject: ${email.subject}
Body: ${email.body?.slice(0, 2000)}

Respond with this exact JSON structure:
{
  "category": "Complaint|Inquiry|Bug Report|Feature Request|Compliance|Legal|Billing|Spam|Internal|Security|Other",
  "sentiment": "Positive|Neutral|Negative|Mixed",
  "sentiment_score": <number -1.0 to 1.0>,
  "urgency": "Critical|High|Medium|Low",
  "requires_human": <true|false>,
  "escalation_reason": "<string or null>",
  "suggested_reply": "<string or null — null if requires_human is true or security/GDPR>",
  "confidence": <number 0.0 to 1.0>,
  "detected_entities": {
    "order_ids": [],
    "ticket_ids": [],
    "monetary_amounts": [],
    "deadlines": [],
    "company_names": []
  },
  "policy_citations": ["<list of kb doc filenames that informed this>"]
}`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        max_tokens: 1000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    let raw = response.data.choices[0].message.content.trim();
    raw = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);

    // Enforce hard rules
    const bodyLower = (email.body || '').toLowerCase();
    const subjectLower = (email.subject || '').toLowerCase();
    const fullText = bodyLower + ' ' + subjectLower;

    if (fullText.includes('btc') || fullText.includes('ransomware') || fullText.includes('your files are encrypted') || fullText.includes('send 2 btc')) {
      parsed.category = 'Security';
      parsed.urgency = 'Critical';
      parsed.requires_human = true;
      parsed.suggested_reply = null;
      parsed.escalation_reason = 'SECURITY THREAT: Ransomware or extortion detected. Never auto-reply.';
    }

    if (fullText.includes('article 20') || fullText.includes('data portability') || fullText.includes('gdpr') && fullText.includes('portability')) {
      parsed.category = 'Compliance';
      parsed.urgency = 'Critical';
      parsed.requires_human = true;
      parsed.escalation_reason = 'GDPR Article 20 data portability request — legal obligation, route to privacy@company.com';
      parsed.suggested_reply = 'We have received your GDPR Article 20 data portability request. Under our legal obligations, we will provide a complete export of your personal data within the statutory 30-day window. Our Data Protection Officer will be in contact shortly. Reference: privacy@company.com';
    }

    if (parsed.confidence < 0.70) {
      parsed.requires_human = true;
      parsed.escalation_reason = (parsed.escalation_reason || '') + ' Low confidence classification — flagged for human review.';
    }

    return parsed;
  } catch (err) {
    console.error('LLM classification error:', err.message);
    return {
      category: 'Other', sentiment: 'Neutral', sentiment_score: 0,
      urgency: 'Medium', requires_human: true, confidence: 0,
      escalation_reason: 'Classification failed — defaulting to human review.',
      suggested_reply: null, detected_entities: {}, policy_citations: []
    };
  }
}

module.exports = { classifyEmail };
```

---

## PART 6 — AGENT RUNNER (server/services/agentRunner.js)

Implement a ReAct-style agent loop:

```javascript
const axios = require('axios');
const { query } = require('../db');
const { retrieveRelevantChunks } = require('./ragPipeline');

async function runAgent(email, classificationResult, dryRun = false) {
  const reasoningLog = [];
  let stepCount = 0;
  const MAX_STEPS = 6;

  // Tool definitions
  const tools = {
    search_knowledge_base: async ({ queryText }) => {
      const chunks = await retrieveRelevantChunks(queryText, 3);
      return chunks.map(c => `[${c.source_doc}] ${c.chunk_text}`).join('\n\n');
    },
    get_thread_history: async ({ sender_email }) => {
      const result = await query('SELECT sender, subject, body, timestamp, sentiment_score, category FROM emails WHERE sender = $1 ORDER BY timestamp ASC', [sender_email]);
      return JSON.stringify(result.rows.slice(-10));
    },
    get_contact_profile: async ({ email }) => {
      const result = await query('SELECT * FROM contacts WHERE email = $1', [email]);
      return JSON.stringify(result.rows[0] || { email, status: 'Unknown', account_value: 0 });
    },
    escalate_to_human: async ({ email_id, reason, priority }) => {
      if (!dryRun) {
        await query('INSERT INTO actions (email_id, action_type, proposed_content, agent_reasoning_log) VALUES ($1, $2, $3, $4)', [email_id, 'Escalate', reason, JSON.stringify(reasoningLog)]);
        await query('UPDATE emails SET status = $1, requires_human = true WHERE id = $2', ['Escalated', email_id]);
      }
      return `Escalated to human: ${reason} (Priority: ${priority})`;
    },
    flag_for_legal: async ({ email_id, issue_type }) => {
      if (!dryRun) {
        await query('INSERT INTO actions (email_id, action_type, proposed_content) VALUES ($1, $2, $3)', [email_id, 'Legal-Flag', issue_type]);
        await query('UPDATE emails SET status = $1 WHERE id = $2', ['Escalated', email_id]);
      }
      return `Legal flag created for: ${issue_type}`;
    },
    create_internal_ticket: async ({ title, body, assignee, priority }) => {
      if (!dryRun) {
        await query('INSERT INTO internal_tickets (email_id, title, body, assignee, priority) VALUES ($1, $2, $3, $4, $5)', [email.id, title, body, assignee, priority || 'High']);
      }
      return `Internal ticket created: ${title} → assigned to ${assignee}`;
    },
    send_auto_reply: async ({ email_id, content }) => {
      if (!dryRun) {
        await query('INSERT INTO actions (email_id, action_type, proposed_content, is_approved, agent_reasoning_log) VALUES ($1, $2, $3, $4, $5)', [email_id, 'Auto-Reply', content, false, JSON.stringify(reasoningLog)]);
        await query('UPDATE emails SET status = $1, suggested_reply = $2 WHERE id = $3', ['Replied', content, email_id]);
      }
      return `Auto-reply drafted and pending approval.`;
    }
  };

  // HARD RULES — override any agent decision
  const isSecurityThreat = classificationResult.category === 'Security' || (classificationResult.escalation_reason || '').toLowerCase().includes('ransomware');
  const isGDPR = classificationResult.category === 'Compliance' && (email.body || '').toLowerCase().includes('portab');
  const isCritical = classificationResult.urgency === 'Critical';

  if (isSecurityThreat) {
    const obs = await tools.escalate_to_human({ email_id: email.id, reason: 'SECURITY THREAT — ransomware or extortion. Never auto-reply.', priority: 'Critical' });
    reasoningLog.push({ thought: 'Security threat detected by heuristic. Hard rule: escalate immediately, never auto-reply.', action: 'escalate_to_human', observation: obs });
    return { reasoningLog, finalAction: 'Escalated', dryRun };
  }

  if (isGDPR) {
    const flagObs = await tools.flag_for_legal({ email_id: email.id, issue_type: 'GDPR Article 20 Data Portability Request — statutory 30-day obligation' });
    const ticketObs = await tools.create_internal_ticket({ title: `GDPR Data Portability Request - ${email.sender}`, body: email.body, assignee: 'privacy@company.com', priority: 'Critical' });
    const replyObs = await tools.send_auto_reply({ email_id: email.id, content: classificationResult.suggested_reply || 'We have received your GDPR Article 20 data portability request and will respond within the statutory 30-day window. Our DPO will be in contact shortly.' });
    reasoningLog.push({ thought: 'GDPR Article 20 request detected. Hard rule: flag legal, create compliance ticket, send statutory acknowledgement.', action: 'flag_for_legal + create_internal_ticket + send_auto_reply', observation: `${flagObs} | ${ticketObs} | ${replyObs}` });
    return { reasoningLog, finalAction: 'GDPR-Compliance', dryRun };
  }

  // Build agent context for LLM reasoning
  const systemPrompt = `You are an autonomous CRM agent deciding what to do with a classified email. You have these tools: search_knowledge_base, get_thread_history, get_contact_profile, escalate_to_human, flag_for_legal, create_internal_ticket, send_auto_reply. Respond ONLY with JSON: {"thought": "...", "action": "tool_name", "action_input": {...}} or {"thought": "...", "action": "FINISH", "final_answer": "..."}. Max ${MAX_STEPS} steps.`;

  const conversationHistory = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Email from: ${email.sender}\nSubject: ${email.subject}\nBody: ${(email.body || '').slice(0, 1000)}\nClassification: ${JSON.stringify(classificationResult)}\nEmail DB ID: ${email.id}\nDecide what actions to take. RULE: If urgency is Critical, you MUST escalate to human.` }
  ];

  while (stepCount < MAX_STEPS) {
    stepCount++;
    try {
      const resp = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        { model: 'llama3-70b-8192', max_tokens: 500, temperature: 0.1, messages: conversationHistory },
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
      );

      let raw = resp.data.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
      const step = JSON.parse(raw);

      if (step.action === 'FINISH') {
        reasoningLog.push({ thought: step.thought, action: 'FINISH', observation: step.final_answer });
        break;
      }

      const toolFn = tools[step.action];
      let observation = 'Tool not found.';
      if (toolFn) {
        observation = await toolFn(step.action_input || {});
      }

      reasoningLog.push({ thought: step.thought, action: step.action, action_input: step.action_input, observation });
      conversationHistory.push({ role: 'assistant', content: raw });
      conversationHistory.push({ role: 'user', content: `Observation: ${observation}\nContinue or FINISH.` });

    } catch (err) {
      reasoningLog.push({ thought: 'Agent step failed', action: 'ERROR', observation: err.message });
      break;
    }
  }

  if (stepCount >= MAX_STEPS) {
    await tools.escalate_to_human({ email_id: email.id, reason: 'Agent reached max steps without resolution.', priority: classificationResult.urgency });
    reasoningLog.push({ thought: 'Max steps reached.', action: 'escalate_to_human', observation: 'Escalated due to max steps.' });
  }

  // Store reasoning log in action record
  if (!dryRun) {
    await query('UPDATE actions SET agent_reasoning_log = $1 WHERE email_id = $2 AND created_at = (SELECT MAX(created_at) FROM actions WHERE email_id = $2)', [JSON.stringify(reasoningLog), email.id]);
  }

  return { reasoningLog, finalAction: reasoningLog[reasoningLog.length - 1]?.action || 'Unknown', dryRun };
}

module.exports = { runAgent };
```

---

## PART 7 — SENTIMENT TRACKER (server/services/sentimentTracker.js)

```javascript
const { query } = require('../db');

async function detectDeterioration(senderEmail) {
  const result = await query('SELECT sentiment_score FROM emails WHERE sender = $1 AND is_spam = false ORDER BY timestamp DESC LIMIT 3', [senderEmail]);
  if (result.rows.length < 3) return false;
  return result.rows.every(r => parseFloat(r.sentiment_score) < -0.3);
}

async function getAtRiskAccounts() {
  const result = await query(`
    SELECT sender, COUNT(*) as email_count, AVG(sentiment_score) as avg_sentiment,
    MAX(timestamp) as last_contact, MIN(sentiment_score) as min_sentiment
    FROM emails
    WHERE is_spam = false AND timestamp > NOW() - INTERVAL '30 days'
    GROUP BY sender
    HAVING AVG(sentiment_score) < -0.3 OR COUNT(*) > 2
    ORDER BY avg_sentiment ASC
    LIMIT 20
  `);
  return result.rows;
}

async function getSentimentTrend(senderEmail, days = 30) {
  const q = senderEmail
    ? `SELECT DATE(timestamp) as date, AVG(sentiment_score) as avg_score FROM emails WHERE sender = $1 AND timestamp > NOW() - INTERVAL '${days} days' GROUP BY DATE(timestamp) ORDER BY date ASC`
    : `SELECT DATE(timestamp) as date, AVG(sentiment_score) as avg_score FROM emails WHERE timestamp > NOW() - INTERVAL '${days} days' GROUP BY DATE(timestamp) ORDER BY date ASC`;
  const result = senderEmail ? await query(q, [senderEmail]) : await query(q);
  return result.rows;
}

module.exports = { detectDeterioration, getAtRiskAccounts, getSentimentTrend };
```

---

## PART 8 — ALL API ROUTES

### server/routes/ingest.js
POST /api/ingest:
1. Validate: message_id, sender, subject, body, timestamp, thread_id all required → 400 if missing
2. Duplicate check: SELECT from emails WHERE message_id = $1 → if exists, return 200 {status:"duplicate"}
3. Truncate body to 8000 chars
4. Run runHeuristicFilter(email)
5. Upsert contact: INSERT INTO contacts(email, name) VALUES(...) ON CONFLICT(email) DO UPDATE SET last_contact_at=NOW()
6. Upsert thread: INSERT INTO threads(thread_id, subject, sender_email) VALUES(...) ON CONFLICT(thread_id) DO UPDATE SET last_updated_at=NOW(), email_count=threads.email_count+1
7. Insert email record with heuristic results (is_spam, is_internal, heuristic_flags, urgency=initialPriority)
8. If not spam and not internal: run classification asynchronously (don't await — respond immediately)
    - Async: get thread history, get RAG chunks, call classifyEmail, update email record, run agentRunner
9. Return: {status:"accepted", email_id, message_id, initial_priority, flags}

POST /api/simulate:
- Read email-data-advanced.json from process.cwd()
- For each email: call the ingest logic with 800ms delay between emails
- Return {status:"started", total: N}

### server/routes/dashboard.js
GET /dashboard/stats:
```sql
SELECT
  COUNT(*) FILTER (WHERE status='Open' OR status='Received') as pending,
  COUNT(*) FILTER (WHERE status='Replied') as replied,
  COUNT(*) FILTER (WHERE status='Escalated') as escalated,
  COUNT(*) FILTER (WHERE urgency='Critical') as critical,
  COUNT(*) FILTER (WHERE is_spam=true) as spam,
  COUNT(*) FILTER (WHERE requires_human=true AND status NOT IN ('Replied','Resolved')) as needs_human,
  COUNT(*) as total
FROM emails
```

GET /dashboard/emails:
- Query params: tab (all/needs_human/replied/escalated/spam/internal), search, urgency, category, page, limit
- Return paginated emails with all classification fields
- Order by: Critical first, then by timestamp DESC

### server/routes/threads.js
GET /threads/:threadId:
- Return thread object + all emails in thread ordered by timestamp + latest action + contact profile
- Join emails with contacts and actions

GET /threads/by-sender/:email:
- Return all threads from a sender with email counts

### server/routes/analytics.js
GET /analytics/sentiment-trend:
- Query params: sender, days (default 30)
- Call getSentimentTrend from sentimentTracker

GET /analytics/category-breakdown:
```sql
SELECT category, COUNT(*) as count FROM emails WHERE is_spam=false GROUP BY category ORDER BY count DESC
```

GET /analytics/at-risk:
- Call getAtRiskAccounts from sentimentTracker

GET /analytics/agent-stats:
```sql
SELECT
  COUNT(*) FILTER (WHERE status='Replied') as auto_replied,
  COUNT(*) FILTER (WHERE status='Escalated') as escalated,
  COUNT(*) FILTER (WHERE requires_human=true) as flagged_for_human,
  AVG(confidence) as avg_confidence,
  COUNT(*) as total_processed
FROM emails WHERE is_spam=false
```

### server/routes/rag.js
GET /rag/search?q=...:
- Call retrieveRelevantChunks(q, 5)
- Return chunks with source_doc, chunk_text, score

### server/routes/contacts.js
GET /contacts/:email:
- Return contact + all threads from that sender + churn risk assessment

PATCH /contacts/:email/status:
- Update contact status

### server/routes/agent.js
POST /agent/dry-run/:emailId:
- Fetch email, run agentRunner(email, classification, dryRun=true)
- Return full reasoningLog without writing to DB

### server/routes/intelligence.js
GET /intelligence/reputation:
- Return mock intelligence data: {g2_rating: 4.4, trustpilot_rating: 4.1, recent_reviews_count: 12, negative_reviews_summary: "Users report slow support response times", competitor_g2: 4.6, scraped_at: new Date()}

---

## PART 9 — server/index.js

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
require('express-async-errors');

const { runMigrations } = require('./db');
const { seedKnowledgeBase } = require('./services/ragPipeline');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// WebSocket broadcast helper
app.locals.broadcast = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// Routes
app.use('/api', require('./routes/ingest'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/threads', require('./routes/threads'));
app.use('/analytics', require('./routes/analytics'));
app.use('/rag', require('./routes/rag'));
app.use('/contacts', require('./routes/contacts'));
app.use('/agent', require('./routes/agent'));
app.use('/intelligence', require('./routes/intelligence'));

// Health check
app.get('/health', async (req, res) => {
  const { query } = require('./db');
  const chunks = await query('SELECT COUNT(*) as count FROM knowledge_chunks');
  const emails = await query('SELECT COUNT(*) as count FROM emails');
  res.json({ status: 'ok', kb_chunks: parseInt(chunks.rows[0].count), emails_processed: parseInt(emails.rows[0].count), uptime_seconds: Math.floor(process.uptime()) });
});

// Serve React frontend
const clientDist = path.join(__dirname, '../client/dist');
if (require('fs').existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error_code: 'INTERNAL_ERROR', message: err.message });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await runMigrations();
  await seedKnowledgeBase();

  // Auto-seed test data if DB is empty and file exists
  const { query } = require('./db');
  const emailCount = await query('SELECT COUNT(*) as count FROM emails');
  if (parseInt(emailCount.rows[0].count) === 0) {
    const testDataPath = path.join(process.cwd(), 'email-data-advanced.json');
    if (require('fs').existsSync(testDataPath)) {
      console.log('Auto-seeding 60 test emails from email-data-advanced.json...');
      const testData = JSON.parse(require('fs').readFileSync(testDataPath, 'utf8'));
      const { runHeuristicFilter } = require('./services/heuristicFilter');
      const { classifyEmail } = require('./services/llmClassifier');
      const { retrieveRelevantChunks } = require('./services/ragPipeline');
      const { runAgent } = require('./services/agentRunner');

      // Ingest all emails with a small delay to avoid rate limits
      for (let i = 0; i < testData.length; i++) {
        const email = testData[i];
        try {
          const hResult = runHeuristicFilter(email);
          // Upsert contact
          await query('INSERT INTO contacts(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET last_contact_at=NOW()', [email.sender]);
          // Upsert thread
          await query('INSERT INTO threads(thread_id, subject, sender_email) VALUES($1,$2,$3) ON CONFLICT(thread_id) DO UPDATE SET last_updated_at=NOW(), email_count=threads.email_count+1', [email.thread_id, email.subject, email.sender]);
          // Insert email
          const insertResult = await query(
            'INSERT INTO emails(message_id, thread_id, sender, subject, body, timestamp, is_spam, is_internal, heuristic_flags, urgency, status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(message_id) DO NOTHING RETURNING id',
            [email.message_id, email.thread_id, email.sender, email.subject, email.body, email.timestamp, hResult.isSpam, hResult.isInternal, JSON.stringify(hResult.flags), hResult.initialPriority, 'Received']
          );
          // Async classify (no await)
          if (!hResult.isSpam && !hResult.isInternal && insertResult.rows.length > 0) {
            const emailId = insertResult.rows[0].id;
            setTimeout(async () => {
              try {
                const threadHistory = (await query('SELECT * FROM emails WHERE thread_id=$1 ORDER BY timestamp ASC', [email.thread_id])).rows;
                const ragChunks = await retrieveRelevantChunks(`${email.subject} ${email.body}`, 3);
                const cls = await classifyEmail(email, threadHistory, ragChunks);
                await query('UPDATE emails SET category=$1, sentiment_label=$2, sentiment_score=$3, urgency=$4, requires_human=$5, confidence=$6, suggested_reply=$7, escalation_reason=$8, policy_citations=$9, detected_entities=$10 WHERE id=$11',
                  [cls.category, cls.sentiment, cls.sentiment_score, cls.urgency, cls.requires_human, cls.confidence, cls.suggested_reply, cls.escalation_reason, JSON.stringify(cls.policy_citations), JSON.stringify(cls.detected_entities), emailId]);
                const fullEmail = (await query('SELECT * FROM emails WHERE id=$1', [emailId])).rows[0];
                await runAgent(fullEmail, cls, false);
              } catch(e) { console.error('Classification error:', e.message); }
            }, i * 1500); // 1.5s delay between classifications to respect rate limits
          }
        } catch(e) { console.error(`Error seeding email ${email.message_id}:`, e.message); }
      }
      console.log('Test data seeding initiated for all 60 emails.');
    }
  }

  server.listen(PORT, () => {
    console.log(`SenAI CRM running on port ${PORT}`);
    console.log('Knowledge base seeded. Database ready. Listening for emails.');
  });
}

start().catch(console.error);
```

---

## PART 10 — REACT FRONTEND

### client/vite.config.js
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000', '/dashboard': 'http://localhost:3000', '/threads': 'http://localhost:3000', '/analytics': 'http://localhost:3000', '/rag': 'http://localhost:3000', '/contacts': 'http://localhost:3000', '/agent': 'http://localhost:3000', '/intelligence': 'http://localhost:3000', '/health': 'http://localhost:3000' } }
});
```

### client/src/App.jsx
Create a React app with React Router with these routes:
- / → Inbox page
- /thread/:threadId → ThreadWorkspace page
- /analytics → Analytics page
- /rag-debug → RAG Debug page (simple search box, calls GET /rag/search?q=, shows results as cards)

Include a sidebar with navigation links and a "▶ Simulate Emails" button (calls POST /api/simulate, shows a toast "Simulation started — 60 emails ingesting...").

### client/src/pages/Inbox.jsx

Build a full inbox dashboard:

**Header**: "SenAI Mission Control" logo left, live clock right, colored stats badges showing counts from GET /dashboard/stats (poll every 5 seconds).

**Tabs**: All | Needs Human | Auto-Replied | Escalated | Spam | Internal — each showing count badge.

**Filter bar**: text search input, urgency dropdown (All/Critical/High/Medium/Low), category dropdown.

**Email list**: For each email from GET /dashboard/emails, render a row with:
- Left colored bar: Critical=red, High=orange, Medium=yellow, Low=gray
- Sender email (bold), subject (truncated to 60 chars), relative time ("2h ago" using date math)
- Sentiment badge: pill with score number, colors: Positive(score>0.3)=green, Negative(score<-0.3)=red, Neutral=gray, Mixed=orange
- Urgency badge: pill colored by urgency level
- Category badge: different color per category
- 🔴 icon if requires_human is true
- If is_spam: gray out the row, show "SPAM" badge
- Thread grouping: group by thread_id, show email count badge if count > 1, collapsed by default

**Clicking a row** navigates to /thread/:threadId.

**Bulk actions**: checkboxes + "Mark Spam" and "Archive" buttons appear when items selected.

**Real-time**: show green pulsing "LIVE" dot, poll stats every 5 seconds, poll emails every 10 seconds.

### client/src/pages/ThreadWorkspace.jsx

Three-column layout fetching from GET /threads/:threadId:

**LEFT (35%)**: Current email body with entity highlighting (use `<mark>` tags):
- Monetary amounts (regex: \$[\d,]+): gold background
- Ticket/order IDs (regex: #\d+): blue background
- Deadline keywords (regex: \b(by|before|within)\s+\w+\s+(hour|day|week|month)\b): red background
Below: classification metadata card showing category, sentiment, urgency, confidence as progress bar, policy citations list.

**CENTER (35%)**: Thread timeline
- Header shows executive_summary if present, else thread subject
- Sentiment sparkline (simple bar or line chart using inline SVG) showing score history across thread emails
- Each email as a card: left border colored by sentiment_score, sender avatar (initials circle), timestamp, body preview (first 150 chars)
- Expand/collapse individual emails

**RIGHT (30%)**:
1. Contact card: name, email, company, status badge, account_value, churn_risk_score as colored bar (0-1 scale, red if >0.6)
2. Agent Reasoning Panel (collapsible accordion): for each step in agent_reasoning_log, show Thought / Action (with icon) / Observation
3. RAG Context Panel (collapsible): if policy_citations available, show them as chips
4. Requires human warning banner (yellow/red) if requires_human=true

**Bottom action area**:
- If suggested_reply exists: show editable textarea pre-filled with it
- Buttons: "✓ Approve & Send" (green), "✏ Edit Draft" (blue), "⚡ Escalate" (orange), "🚫 Mark Spam" (red)

### client/src/pages/Analytics.jsx

Dashboard with these panels using Recharts library:

1. **Sentiment Trend** (LineChart): X=date, Y=sentiment_score (-1 to 1). Data from GET /analytics/sentiment-trend. Sender filter dropdown. Reference line at y=0. Red area below 0, green above.

2. **Category Breakdown** (PieChart + legend): Data from GET /analytics/category-breakdown. Color each category differently.

3. **At-Risk Accounts** (list): Data from GET /analytics/at-risk. Red warning cards showing sender, avg_sentiment, email_count. "View Thread" button on each.

4. **Agent Performance** (stat cards): Data from GET /analytics/agent-stats. Show: Auto-Reply Rate %, Escalation Rate %, Avg Confidence %, Total Processed.

5. **Response Heatmap** (CSS grid 7×24): Simulate with email counts by day/hour if data available.

### Styling (client/src/App.css)

Write comprehensive CSS for a dark professional dashboard:

```css
:root {
  --bg-primary: #0a0f1e;
  --bg-secondary: #111827;
  --bg-card: #1a2235;
  --border: #2d3748;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --accent-blue: #2563eb;
  --accent-blue-light: #3b82f6;
  --critical: #ef4444;
  --high: #f97316;
  --medium: #eab308;
  --low: #6b7280;
  --positive: #22c55e;
  --negative: #ef4444;
  --neutral: #6b7280;
  --mixed: #f97316;
  --font-body: 'IBM Plex Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-body); }

/* Import IBM Plex fonts from Google Fonts in index.html */
```

Add `<link>` tags in client/index.html for IBM Plex Sans and IBM Plex Mono from Google Fonts.

Style all components with dark theme, colored badges, smooth hover transitions, pulsing animations for Critical urgency badges, loading skeleton animations for async data, and empty state illustrations.

---

## PART 11 — package.json

```json
{
  "name": "senai-crm",
  "version": "1.0.0",
  "scripts": {
    "start": "node server/index.js",
    "dev:server": "node server/index.js",
    "dev:client": "cd client && npm run dev",
    "build": "cd client && npm install && npm run build",
    "postinstall": "npm run build"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.3",
    "dotenv": "^16.3.1",
    "axios": "^1.6.0",
    "ws": "^8.14.2",
    "uuid": "^9.0.0",
    "express-async-errors": "^3.1.1",
    "concurrently": "^8.2.2"
  }
}
```

### client/package.json
```json
{
  "name": "senai-crm-client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "axios": "^1.6.0",
    "recharts": "^2.10.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

### .replit
```
run = "npm start"
entrypoint = "server/index.js"

[nix]
channel = "stable-23_11"

[deployment]
run = ["sh", "-c", "npm start"]
deploymentTarget = "cloudrun"
```

---

## PART 12 — CRITICAL SPECIAL SCENARIO HANDLING

Make absolutely sure these scenarios work correctly:

**Scenario A — Ransomware (msg_038: "Send 2 BTC or we publish your data")**
- Heuristic filter MUST flag: SECURITY_THREAT
- Category: Security, Urgency: Critical, requires_human: true, suggested_reply: null
- Agent MUST call escalate_to_human, MUST NOT call send_auto_reply
- Action type: Security-Alert

**Scenario B — GDPR (msg_052 from marcus.del@fintech-startup.co)**
- LLM classifier MUST detect "Article 20" + "data portability"
- Category: Compliance, Urgency: Critical
- Agent MUST: flag_for_legal, create_internal_ticket (assignee: privacy@company.com), send statutory acknowledgement
- Acknowledgement text: "We have received your GDPR Article 20 data portability request and will respond within the statutory 30-day window."

**Scenario C — Bob Jones escalation (msg_060)**
- Prior thread: msgs 002, 009, 042, 060 — legal team is now involved
- Agent MUST retrieve thread history (4 emails), detect pattern
- Action: flag_for_legal, escalate_to_human with note "Legal team involvement, SLA breach, renewal on hold"
- Never send auto-reply

**Scenario D — Karen churn threat (msgs 006, 018 + follow-ups)**
- Multiple emails, no replies, mentions Twitter + G2 + Trustpilot
- Sentiment deterioration detected
- Action: escalate with retention offer (1 month free + 15% loyalty discount from refund_policy.md)

**Scenario E — Alice non-profit thread (msgs 001, 005, 014)**
- RAG must retrieve pricing_policy.md
- Correct discount: 30% off Standard plan for 501(c)(3)
- Agent must reference thread history across 5 emails before replying

---

## FINAL INSTRUCTIONS

1. Install all dependencies automatically when the Repl starts
2. The app MUST work with only the GROQ_API_KEY secret set — Replit provides DATABASE_URL automatically
3. On first start: run DB migrations, seed knowledge base, auto-ingest email-data-advanced.json if present and DB is empty
4. Build the React client during deployment (run `npm run build` which runs `cd client && npm install && npm run build`)
5. Serve the built React app from server/index.js as static files
6. All Groq API calls use model: "llama3-70b-8192"
7. Handle rate limit errors from Groq gracefully (429) — retry after 2 seconds, max 2 retries
8. Never crash the server on classification failure — catch all errors and default to requires_human=true
9. The frontend must work at the Replit preview URL — ensure CORS and proxy are configured correctly
10. After building everything, verify: GET /health returns {status:"ok"}, GET /dashboard/stats returns counts, GET /rag/search?q=refund returns results

Build the complete project now. All files, all services, all routes, all frontend pages — everything production-ready and working.
```
