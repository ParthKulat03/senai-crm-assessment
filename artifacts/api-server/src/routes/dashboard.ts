import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/stats', async (req, res) => {
  const result = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status='Open' OR status='Received') as pending,
      COUNT(*) FILTER (WHERE status='Replied') as replied,
      COUNT(*) FILTER (WHERE status='Escalated') as escalated,
      COUNT(*) FILTER (WHERE urgency='Critical') as critical,
      COUNT(*) FILTER (WHERE is_spam=true) as spam,
      COUNT(*) FILTER (WHERE requires_human=true AND status NOT IN ('Replied','Resolved')) as needs_human,
      COUNT(*) as total
    FROM emails
  `);
  res.json(result.rows[0]);
});

router.get('/emails', async (req, res) => {
  const { tab = 'all', search = '', urgency = '', category = '', page = '1', limit = '50' } = req.query as Record<string, string>;
  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 50, 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (tab === 'needs_human') conditions.push('requires_human = true AND status NOT IN (\'Replied\', \'Resolved\')');
  else if (tab === 'replied') conditions.push('status = \'Replied\'');
  else if (tab === 'escalated') conditions.push('status = \'Escalated\'');
  else if (tab === 'spam') conditions.push('is_spam = true');
  else if (tab === 'internal') conditions.push('is_internal = true');

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(sender ILIKE $${params.length} OR subject ILIKE $${params.length})`);
  }
  if (urgency) {
    params.push(urgency);
    conditions.push(`urgency = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limitNum, offset);
  const result = await query(
    `SELECT * FROM emails ${where} ORDER BY CASE WHEN urgency='Critical' THEN 0 ELSE 1 END, timestamp DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countResult = await query(`SELECT COUNT(*) as total FROM emails ${where}`, params.slice(0, -2));

  res.json({
    emails: result.rows,
    total: parseInt(countResult.rows[0].total),
    page: pageNum,
    limit: limitNum
  });
});

export default router;
