import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { query } from '../db.js';
import { runHeuristicFilter } from '../services/heuristicFilter.js';
import { classifyAndSave } from '../services/classifyAndSave.js';
import { logger } from '../lib/logger.js';

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
        await classifyAndSave({ id: emailId, message_id, sender, subject, body: truncatedBody, thread_id });
        if (req.app.locals.broadcast) {
          req.app.locals.broadcast({ type: 'email_processed', emailId });
        }
      } catch (e: unknown) {
        logger.error({ err: e }, `ingest: async classification failed for ${message_id}`);
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
  const testDataPath = path.join(process.cwd(), '..', '..', 'email-data-advanced.json');
  if (!fs.existsSync(testDataPath)) {
    res.status(404).json({ error: 'email-data-advanced.json not found in project root' });
    return;
  }
  const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8')) as Record<string, string>[];
  res.json({ status: 'started', total: testData.length });
  logger.info(`simulate: ingesting ${testData.length} emails sequentially`);

  // Run in the background — ingest all, then reclassify sequentially
  (async () => {
    let inserted = 0;
    const toClassify: { id: string; message_id: string; sender: string; subject?: string; body?: string; thread_id?: string }[] = [];

    // Phase 1: insert all emails (fast, no Groq calls)
    for (const email of testData) {
      try {
        const hResult = runHeuristicFilter(email);
        await query('INSERT INTO contacts(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET last_contact_at=NOW()', [email.sender]);
        await query('INSERT INTO threads(thread_id, subject, sender_email) VALUES($1,$2,$3) ON CONFLICT(thread_id) DO UPDATE SET last_updated_at=NOW(), email_count=threads.email_count+1', [email.thread_id, email.subject, email.sender]);
        const insertResult = await query(
          'INSERT INTO emails(message_id, thread_id, sender, subject, body, timestamp, is_spam, is_internal, heuristic_flags, urgency, status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(message_id) DO NOTHING RETURNING id',
          [email.message_id, email.thread_id, email.sender, email.subject, email.body, email.timestamp, hResult.isSpam, hResult.isInternal, JSON.stringify(hResult.flags), hResult.initialPriority, 'Received']
        );
        if (!hResult.isSpam && !hResult.isInternal && insertResult.rows.length > 0) {
          inserted++;
          toClassify.push({ id: insertResult.rows[0].id, message_id: email.message_id, sender: email.sender, subject: email.subject, body: email.body, thread_id: email.thread_id });
        }
      } catch (e: unknown) {
        logger.error({ err: e }, `simulate: insert failed for ${email.message_id}`);
      }
    }

    logger.info(`simulate: inserted ${inserted} emails, starting sequential LLM classification of ${toClassify.length} emails (2s delay each)`);

    // Phase 2: classify sequentially with 2s delay to stay within Groq rate limits
    let success = 0;
    let failed = 0;
    for (let i = 0; i < toClassify.length; i++) {
      const email = toClassify[i];
      try {
        await classifyAndSave(email);
        success++;
        logger.info(`simulate: [${i + 1}/${toClassify.length}] classified ${email.message_id}`);
      } catch {
        failed++;
        logger.warn(`simulate: [${i + 1}/${toClassify.length}] classification failed for ${email.message_id}, skipping`);
      }
      if (i < toClassify.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    logger.info(`simulate: DONE — success=${success} failed=${failed} total=${toClassify.length}`);
  })().catch(err => logger.error({ err }, 'simulate background loop crashed'));
});

export default router;
