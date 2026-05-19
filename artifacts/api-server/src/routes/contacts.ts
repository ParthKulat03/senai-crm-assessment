import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/:email', async (req, res) => {
  const { email } = req.params;
  const contactResult = await query('SELECT * FROM contacts WHERE email = $1', [email]);
  const contact = contactResult.rows[0] || { email, status: 'Unknown', account_value: 0 };

  const threadsResult = await query(
    'SELECT t.*, COUNT(e.id) as email_count FROM threads t LEFT JOIN emails e ON e.thread_id = t.thread_id WHERE t.sender_email = $1 GROUP BY t.id ORDER BY t.last_updated_at DESC',
    [email]
  );

  const sentimentResult = await query(
    'SELECT AVG(sentiment_score) as avg_sentiment, COUNT(*) as email_count, MIN(sentiment_score) as min_sentiment FROM emails WHERE sender = $1 AND is_spam = false',
    [email]
  );

  const avgSentiment = parseFloat(sentimentResult.rows[0]?.avg_sentiment || '0');
  const emailCount = parseInt(sentimentResult.rows[0]?.email_count || '0');
  const churnRisk = Math.max(0, Math.min(1, (-avgSentiment + 1) / 2 * (emailCount > 3 ? 1.2 : 1)));

  res.json({
    contact: { ...contact, churn_risk_score: churnRisk.toFixed(2) },
    threads: threadsResult.rows,
    sentiment: sentimentResult.rows[0]
  });
});

router.patch('/:email/status', async (req, res) => {
  const { email } = req.params;
  const { status } = req.body as { status: string };
  await query('UPDATE contacts SET status = $1 WHERE email = $2', [status, email]);
  res.json({ success: true });
});

export default router;
