import http from "http";
import { WebSocketServer } from "ws";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { runMigrations } from "./db.js";
import { seedKnowledgeBase } from "./services/ragPipeline.js";
import { query } from "./db.js";
import { runHeuristicFilter } from "./services/heuristicFilter.js";
import { classifyEmail } from "./services/llmClassifier.js";
import { retrieveRelevantChunks } from "./services/ragPipeline.js";
import { runAgent } from "./services/agentRunner.js";
import path from "path";
import fs from "fs";

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

async function start() {
  await runMigrations();
  await seedKnowledgeBase();

  const emailCount = await query('SELECT COUNT(*) as count FROM emails');
  if (parseInt(emailCount.rows[0].count) === 0) {
    const testDataPath = path.join(process.cwd(), '..', '..', 'email-data-advanced.json');
    if (fs.existsSync(testDataPath)) {
      logger.info('Auto-seeding emails from email-data-advanced.json...');
      const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf8')) as Record<string, string>[];
      for (let i = 0; i < testData.length; i++) {
        const email = testData[i];
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
              } catch (e: unknown) { logger.error({ err: e }, 'Auto-seed classify error'); }
            }, i * 1500);
          }
        } catch (e: unknown) { logger.error({ err: e }, `Auto-seed error`); }
      }
      logger.info(`Auto-seeding initiated for ${testData.length} emails.`);
    }
  }

  server.listen(port, () => {
    logger.info({ port }, "SenAI CRM server listening");
  });
}

start().catch(err => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
