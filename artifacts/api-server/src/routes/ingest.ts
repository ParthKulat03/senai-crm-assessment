import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { query } from '../db.js';
import { runHeuristicFilter } from '../services/heuristicFilter.js';
import { classifyEmail } from '../services/llmClassifier.js';
import { retrieveRelevantChunks } from '../services/ragPipeline.js';
import { runAgent } from '../services/agentRunner.js';

const router = Router();

router.post('/ingest', async (req, res) => {
  const { message_id, sender, subject, body, timestamp, thread_id } = req.body;
  if (!message_id || !sender || !subject || !body || !timestamp || !thread_id) {
    res.status(400).json({ error: 'Missing required fields: message_id, sender, subject, body, timestamp, thread_id' });
    return;
  }

  const dup = await query('SELECT id FROM emails WHERE message_id = $1', [message_id]);
  if (dup.rows.length > 0) {
    res.json({ status: 'duplicate' });
    return;
  }

  const truncatedBody = (body as string).slice(0, 8000);
  const emailData = { message_id, sender, subject, body: truncatedBody };
  const hResult = runHeuristicFilter(emailData);

  await query(
    'INSERT INTO contacts(email, name) VALUES($1, $2) ON CONFLICT(email) DO UPDATE SET last_contact_at=NOW()',
    [sender, sender.split('@')[0]]
  );

  await query(
    'INSERT INTO threads(thread_id, subject, sender_email) VALUES($1,$2,$3) ON CONFLICT(thread_id) DO UPDATE SET last_updated_at=NOW(), email_count=threads.email_count+1',
    [thread_id, subject, sender]
  );

  const insertResult = await query(
    'INSERT INTO emails(message_id, thread_id, sender, subject, body, timestamp, is_spam, is_internal, heuristic_flags, urgency, status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(message_id) DO NOTHING RETURNING id',
    [message_id, thread_id, sender, subject, truncatedBody, timestamp, hResult.isSpam, hResult.isInternal, JSON.stringify(hResult.flags), hResult.initialPriority, 'Received']
  );

  if (!hResult.isSpam && !hResult.isInternal && insertResult.rows.length > 0) {
    const emailId = insertResult.rows[0].id;
    setImmediate(async () => {
      try {
        const threadHistory = (await query('SELECT * FROM emails WHERE thread_id=$1 ORDER BY timestamp ASC', [thread_id])).rows;
        const ragChunks = await retrieveRelevantChunks(`${subject} ${truncatedBody}`, 3);
        const cls = await classifyEmail({ message_id, sender, subject, body: truncatedBody }, threadHistory, ragChunks as { source_doc: string; chunk_text: string }[]);
        await query(
          'UPDATE emails SET category=$1, sentiment_label=$2, sentiment_score=$3, urgency=$4, requires_human=$5, confidence=$6, suggested_reply=$7, escalation_reason=$8, policy_citations=$9, detected_entities=$10 WHERE id=$11',
          [cls.category, cls.sentiment, cls.sentiment_score, cls.urgency, cls.requires_human, cls.confidence, cls.suggested_reply, cls.escalation_reason, JSON.stringify(cls.policy_citations), JSON.stringify(cls.detected_entities), emailId]
        );
        const fullEmail = (await query('SELECT * FROM emails WHERE id=$1', [emailId])).rows[0];
        if (fullEmail) await runAgent(fullEmail, cls, false);
        const app = req.app;
        if (app.locals.broadcast) {
          app.locals.broadcast({ type: 'email_processed', emailId });
        }
      } catch (e: unknown) {
        console.error('Classification error:', (e as Error).message);
      }
    });
  }

  res.json({
    status: 'accepted',
    email_id: insertResult.rows[0]?.id,
    message_id,
    initial_priority: hResult.initialPriority,
    flags: hResult.flags
  });
});

router.post('/simulate', async (req, res) => {
  const testDataPath = path.join(process.cwd(), 'email-data-advanced.json');
  if (!fs.existsSync(testDataPath)) {
    res.status(404).json({ error: 'email-data-advanced.json not found in project root' });
    return;
  }
  const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8')) as unknown[];
  res.json({ status: 'started', total: testData.length });

  for (let i = 0; i < testData.length; i++) {
    await new Promise(r => setTimeout(r, 800));
    const email = testData[i] as Record<string, string>;
    try {
      const hResult = runHeuristicFilter(email);
      await query('INSERT INTO contacts(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET last_contact_at=NOW()', [email.sender]);
      await query('INSERT INTO threads(thread_id, subject, sender_email) VALUES($1,$2,$3) ON CONFLICT(thread_id) DO UPDATE SET last_updated_at=NOW(), email_count=threads.email_count+1', [email.thread_id, email.subject, email.sender]);
      const insertResult = await query(
        'INSERT INTO emails(message_id, thread_id, sender, subject, body, timestamp, is_spam, is_internal, heuristic_flags, urgency, status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(message_id) DO NOTHING RETURNING id',
        [email.message_id, email.thread_id, email.sender, email.subject, email.body, email.timestamp, hResult.isSpam, hResult.isInternal, JSON.stringify(hResult.flags), hResult.initialPriority, 'Received']
      );
      if (!hResult.isSpam && !hResult.isInternal && insertResult.rows.length > 0) {
        const emailId = insertResult.rows[0].id;
        setTimeout(async () => {
          try {
            const threadHistory = (await query('SELECT * FROM emails WHERE thread_id=$1 ORDER BY timestamp ASC', [email.thread_id])).rows;
            const ragChunks = await retrieveRelevantChunks(`${email.subject} ${email.body}`, 3);
            const cls = await classifyEmail(email as { message_id: string; sender: string; subject?: string; body?: string }, threadHistory, ragChunks as { source_doc: string; chunk_text: string }[]);
            await query('UPDATE emails SET category=$1, sentiment_label=$2, sentiment_score=$3, urgency=$4, requires_human=$5, confidence=$6, suggested_reply=$7, escalation_reason=$8, policy_citations=$9, detected_entities=$10 WHERE id=$11',
              [cls.category, cls.sentiment, cls.sentiment_score, cls.urgency, cls.requires_human, cls.confidence, cls.suggested_reply, cls.escalation_reason, JSON.stringify(cls.policy_citations), JSON.stringify(cls.detected_entities), emailId]);
            const fullEmail = (await query('SELECT * FROM emails WHERE id=$1', [emailId])).rows[0];
            if (fullEmail) await runAgent(fullEmail, cls, false);
          } catch (e: unknown) { console.error('Sim classify error:', (e as Error).message); }
        }, i * 1500);
      }
    } catch (e: unknown) { console.error(`Sim error:`, (e as Error).message); }
  }
});

export default router;
