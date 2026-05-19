import { Router } from 'express';
import { query } from '../db.js';
import { classifyAndSave } from '../services/classifyAndSave.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * POST /api/reclassify-all
 * Re-runs Groq classification on every email that has confidence=0 or category IS NULL.
 * Processes one at a time with a 2-second delay to stay within Groq rate limits.
 * Returns immediately with a count; processing continues in the background.
 */
router.post('/reclassify-all', async (req, res) => {
  const delayMs = parseInt((req.query.delay as string) || '2000');

  const pending = await query(
    `SELECT id, message_id, sender, subject, body, thread_id
     FROM emails
     WHERE is_spam = false
       AND is_internal = false
       AND (confidence IS NULL OR confidence = 0 OR category IS NULL OR category = 'Other')
     ORDER BY timestamp ASC`
  );

  const emails = pending.rows as { id: string; message_id: string; sender: string; subject?: string; body?: string; thread_id?: string }[];

  if (emails.length === 0) {
    res.json({ status: 'nothing_to_do', count: 0 });
    return;
  }

  res.json({ status: 'started', count: emails.length, delay_ms: delayMs });
  logger.info(`reclassify-all: processing ${emails.length} emails with ${delayMs}ms delay between each`);

  // Process sequentially in the background
  (async () => {
    let success = 0;
    let failed = 0;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      try {
        await classifyAndSave(email);
        success++;
        logger.info(`reclassify-all: [${i + 1}/${emails.length}] OK — ${email.message_id}`);
      } catch {
        failed++;
        logger.warn(`reclassify-all: [${i + 1}/${emails.length}] FAILED — ${email.message_id}, skipping`);
      }

      if (i < emails.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    logger.info(`reclassify-all: DONE — success=${success} failed=${failed} total=${emails.length}`);
  })().catch(err => logger.error({ err }, 'reclassify-all background loop crashed'));
});

/**
 * GET /api/reclassify-all/status
 * Returns how many emails still need classification.
 */
router.get('/reclassify-all/status', async (req, res) => {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE confidence IS NULL OR confidence = 0 OR category IS NULL OR category = 'Other') AS pending,
       COUNT(*) FILTER (WHERE confidence > 0 AND category IS NOT NULL AND category != 'Other') AS done,
       COUNT(*) AS total
     FROM emails
     WHERE is_spam = false AND is_internal = false`
  );
  res.json(result.rows[0]);
});

export default router;
