import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/by-sender/:email', async (req, res) => {
  const { email } = req.params;
  const result = await query(
    'SELECT t.*, COUNT(e.id) as email_count FROM threads t LEFT JOIN emails e ON e.thread_id = t.thread_id WHERE t.sender_email = $1 GROUP BY t.id ORDER BY t.last_updated_at DESC',
    [email]
  );
  res.json(result.rows);
});

router.get('/:threadId', async (req, res) => {
  const { threadId } = req.params;

  const threadResult = await query('SELECT * FROM threads WHERE thread_id = $1', [threadId]);
  if (threadResult.rows.length === 0) {
    res.status(404).json({ error: 'Thread not found' });
    return;
  }
  const thread = threadResult.rows[0];

  const emailsResult = await query(
    'SELECT e.*, a.action_type, a.proposed_content, a.agent_reasoning_log, a.is_approved FROM emails e LEFT JOIN actions a ON a.email_id = e.id AND a.created_at = (SELECT MAX(created_at) FROM actions WHERE email_id = e.id) WHERE e.thread_id = $1 ORDER BY e.timestamp ASC',
    [threadId]
  );

  const contactResult = await query('SELECT * FROM contacts WHERE email = $1', [thread.sender_email]);

  res.json({
    thread,
    emails: emailsResult.rows,
    contact: contactResult.rows[0] || null
  });
});

export default router;
