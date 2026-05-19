import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import ingestRouter from "./routes/ingest.js";
import dashboardRouter from "./routes/dashboard.js";
import threadsRouter from "./routes/threads.js";
import analyticsRouter from "./routes/analytics.js";
import ragRouter from "./routes/rag.js";
import contactsRouter from "./routes/contacts.js";
import agentRouter from "./routes/agent.js";
import intelligenceRouter from "./routes/intelligence.js";
import reclassifyRouter from "./routes/reclassify.js";
import { query } from "./db.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', ingestRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/threads', threadsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/rag', ragRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/agent', agentRouter);
app.use('/api/intelligence', intelligenceRouter);
app.use('/api', reclassifyRouter);

app.get('/api/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', async (req, res) => {
  try {
    const chunks = await query('SELECT COUNT(*) as count FROM knowledge_chunks');
    const emails = await query('SELECT COUNT(*) as count FROM emails');
    res.json({
      status: 'ok',
      kb_chunks: parseInt(chunks.rows[0].count),
      emails_processed: parseInt(emails.rows[0].count),
      uptime_seconds: Math.floor(process.uptime())
    });
  } catch {
    res.json({ status: 'ok', uptime_seconds: Math.floor(process.uptime()) });
  }
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err);
  res.status(500).json({ error_code: 'INTERNAL_ERROR', message: err.message });
});

export default app;
