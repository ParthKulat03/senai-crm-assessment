import { Router } from 'express';
import { query } from '../db.js';
import { runAgent } from '../services/agentRunner.js';

const router = Router();

router.post('/dry-run/:emailId', async (req, res) => {
  const { emailId } = req.params;
  const emailResult = await query('SELECT * FROM emails WHERE id = $1', [emailId]);
  if (emailResult.rows.length === 0) {
    res.status(404).json({ error: 'Email not found' });
    return;
  }
  const email = emailResult.rows[0];
  const classification = {
    category: email.category || 'Other',
    urgency: email.urgency || 'Medium',
    requires_human: email.requires_human,
    escalation_reason: email.escalation_reason,
    suggested_reply: email.suggested_reply,
    confidence: email.confidence
  };
  const result = await runAgent(email, classification, true);
  res.json(result);
});

export default router;
