import http from "http";
import { WebSocketServer } from "ws";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { runMigrations } from "./db.js";
import { seedKnowledgeBase } from "./services/ragPipeline.js";
import { query } from "./db.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.locals.broadcast = (data: unknown) => {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
};

async function triggerReclassifyIfNeeded(): Promise<void> {
  const result = await query(
    `SELECT COUNT(*) as count FROM emails
     WHERE is_spam = false AND is_internal = false
       AND (confidence IS NULL OR confidence = 0 OR category IS NULL OR category = 'Other')`
  );
  const needsReclassify = parseInt(result.rows[0].count);

  if (needsReclassify > 10) {
    logger.info(`startup: ${needsReclassify} emails need classification — triggering reclassify-all with 2s delay`);
    // Import dynamically to avoid circular deps — reclassify logic lives in the service
    const { classifyAndSave } = await import('./services/classifyAndSave.js');

    const pending = await query(
      `SELECT id, message_id, sender, subject, body, thread_id
       FROM emails
       WHERE is_spam = false AND is_internal = false
         AND (confidence IS NULL OR confidence = 0 OR category IS NULL OR category = 'Other')
       ORDER BY timestamp ASC`
    );

    const emails = pending.rows as { id: string; message_id: string; sender: string; subject?: string; body?: string; thread_id?: string }[];

    (async () => {
      let success = 0, failed = 0;
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        try {
          await classifyAndSave(email);
          success++;
          logger.info(`startup reclassify: [${i + 1}/${emails.length}] OK — ${email.message_id}`);
        } catch {
          failed++;
          logger.warn(`startup reclassify: [${i + 1}/${emails.length}] FAILED — ${email.message_id}`);
        }
        if (i < emails.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      logger.info(`startup reclassify: DONE — success=${success} failed=${failed} total=${emails.length}`);
    })().catch(err => logger.error({ err }, 'startup reclassify crashed'));
  } else {
    logger.info(`startup: ${needsReclassify} emails need reclassification (threshold is 10) — skipping auto-reclassify`);
  }
}

async function start() {
  await runMigrations();
  await seedKnowledgeBase();
  await triggerReclassifyIfNeeded();

  server.listen(port, () => {
    logger.info({ port }, "SenAI CRM server listening");
  });
}

start().catch(err => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
