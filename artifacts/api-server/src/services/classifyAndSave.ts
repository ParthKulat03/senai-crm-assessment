import { query } from '../db.js';
import { classifyEmail } from './llmClassifier.js';
import { retrieveRelevantChunks } from './ragPipeline.js';
import { runAgent } from './agentRunner.js';
import { logger } from '../lib/logger.js';

interface EmailRow {
  id: string;
  message_id: string;
  sender: string;
  subject?: string;
  body?: string;
  thread_id?: string;
}

export async function classifyAndSave(email: EmailRow): Promise<void> {
  const tag = `[classify] ${email.message_id} (${email.sender})`;
  try {
    logger.info(tag + ' — starting RAG + LLM classification');

    const threadHistory = email.thread_id
      ? (await query('SELECT * FROM emails WHERE thread_id=$1 ORDER BY timestamp ASC', [email.thread_id])).rows
      : [];

    const ragChunks = await retrieveRelevantChunks(`${email.subject || ''} ${email.body || ''}`, 3);

    const cls = await classifyEmail(
      { message_id: email.message_id, sender: email.sender, subject: email.subject, body: email.body },
      threadHistory,
      ragChunks as { source_doc: string; chunk_text: string }[]
    );

    // Validate we actually got real data back
    if (!cls.category || cls.category === 'Other' && cls.confidence === 0) {
      logger.warn(`${tag} — classification returned low-confidence result: ${JSON.stringify(cls)}`);
    }

    await query(
      `UPDATE emails SET
        category        = $1,
        sentiment_label = $2,
        sentiment_score = $3,
        urgency         = $4,
        requires_human  = $5,
        confidence      = $6,
        suggested_reply = $7,
        escalation_reason = $8,
        policy_citations  = $9,
        detected_entities = $10
      WHERE id = $11`,
      [
        cls.category,
        cls.sentiment,
        cls.sentiment_score,
        cls.urgency,
        cls.requires_human,
        cls.confidence,
        cls.suggested_reply,
        cls.escalation_reason,
        JSON.stringify(cls.policy_citations ?? []),
        JSON.stringify(cls.detected_entities ?? {}),
        email.id,
      ]
    );

    logger.info(`${tag} — saved: category=${cls.category} sentiment=${cls.sentiment_score} urgency=${cls.urgency} confidence=${cls.confidence}`);

    const fullEmail = (await query('SELECT * FROM emails WHERE id=$1', [email.id])).rows[0];
    if (fullEmail) {
      try {
        await runAgent(fullEmail, cls, false);
      } catch (agentErr: unknown) {
        logger.error({ err: agentErr }, `${tag} — agent error (classification saved, agent skipped)`);
      }
    }
  } catch (err: unknown) {
    const e = err as Error & { response?: { status?: number; data?: unknown } };
    const status = e.response?.status;
    const body = e.response?.data;
    logger.error(
      { err, groq_status: status, groq_body: body },
      `${tag} — CLASSIFICATION FAILED: ${e.message}`
    );
    throw err; // re-throw so caller can decide retry/skip
  }
}
