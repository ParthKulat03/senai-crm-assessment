import { Router } from 'express';
import { query } from '../db.js';
import { getAtRiskAccounts, getSentimentTrend } from '../services/sentimentTracker.js';

const router = Router();

router.get('/sentiment-trend', async (req, res) => {
  const { sender, days = '30' } = req.query as Record<string, string>;
  const trend = await getSentimentTrend(sender || undefined, parseInt(days));
  res.json(trend);
});

router.get('/category-breakdown', async (req, res) => {
  const result = await query(
    'SELECT category, COUNT(*) as count FROM emails WHERE is_spam=false AND category IS NOT NULL GROUP BY category ORDER BY count DESC'
  );
  res.json(result.rows);
});

router.get('/at-risk', async (req, res) => {
  const accounts = await getAtRiskAccounts();
  res.json(accounts);
});

router.get('/agent-stats', async (req, res) => {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status='Replied') as auto_replied,
      COUNT(*) FILTER (WHERE status='Escalated') as escalated,
      COUNT(*) FILTER (WHERE requires_human=true) as flagged_for_human,
      COALESCE(AVG(confidence), 0) as avg_confidence,
      COUNT(*) as total_processed
    FROM emails WHERE is_spam=false
  `);
  res.json(result.rows[0]);
});

export default router;
