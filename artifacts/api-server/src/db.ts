import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query(text: string, params?: unknown[]) {
  const res = await pool.query(text, params);
  return res;
}

export async function runMigrations() {
  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  await query(`CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    company VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Active',
    account_value DECIMAL(12,2) DEFAULT 0,
    churn_risk_score DECIMAL(3,2) DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_contact_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id VARCHAR(255) UNIQUE NOT NULL,
    subject VARCHAR(500),
    sender_email VARCHAR(255) NOT NULL,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'Open',
    email_count INTEGER DEFAULT 0,
    executive_summary TEXT
  )`);

  await query(`CREATE TABLE IF NOT EXISTS emails (
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
  )`);

  await query(`CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID,
    action_type VARCHAR(100),
    proposed_content TEXT,
    agent_reasoning_log JSONB DEFAULT '[]',
    is_approved BOOLEAN DEFAULT FALSE,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_doc VARCHAR(255) NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER,
    keywords TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS internal_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID,
    title VARCHAR(500),
    body TEXT,
    assignee VARCHAR(255),
    priority VARCHAR(50) DEFAULT 'Medium',
    status VARCHAR(50) DEFAULT 'Open',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(100),
    entity_id VARCHAR(255),
    action VARCHAR(255),
    performed_by VARCHAR(255) DEFAULT 'system',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    diff JSONB DEFAULT '{}'
  )`);

  await query(`CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_emails_timestamp ON emails(timestamp)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_threads_sender ON threads(sender_email)`);

  console.log("Migrations complete.");
}
