import { query } from '../db.js';

export async function detectDeterioration(senderEmail: string): Promise<boolean> {
  const result = await query('SELECT sentiment_score FROM emails WHERE sender = $1 AND is_spam = false ORDER BY timestamp DESC LIMIT 3', [senderEmail]);
  if (result.rows.length < 3) return false;
  return result.rows.every((r: { sentiment_score: string }) => parseFloat(r.sentiment_score) < -0.3);
}

export async function getAtRiskAccounts() {
  const result = await query(`
    SELECT sender, COUNT(*) as email_count, AVG(sentiment_score) as avg_sentiment,
    MAX(timestamp) as last_contact, MIN(sentiment_score) as min_sentiment
    FROM emails
    WHERE is_spam = false AND timestamp > NOW() - INTERVAL '30 days'
    GROUP BY sender
    HAVING AVG(sentiment_score) < -0.3 OR COUNT(*) > 2
    ORDER BY avg_sentiment ASC
    LIMIT 20
  `);
  return result.rows;
}

export async function getSentimentTrend(senderEmail?: string, days = 30) {
  const q = senderEmail
    ? `SELECT DATE(timestamp) as date, AVG(sentiment_score) as avg_score FROM emails WHERE sender = $1 AND timestamp > NOW() - INTERVAL '${days} days' GROUP BY DATE(timestamp) ORDER BY date ASC`
    : `SELECT DATE(timestamp) as date, AVG(sentiment_score) as avg_score FROM emails WHERE timestamp > NOW() - INTERVAL '${days} days' GROUP BY DATE(timestamp) ORDER BY date ASC`;
  const result = senderEmail ? await query(q, [senderEmail]) : await query(q);
  return result.rows;
}
