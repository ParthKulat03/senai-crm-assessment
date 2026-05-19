import axios from 'axios';
import { query } from '../db.js';
import { retrieveRelevantChunks } from './ragPipeline.js';

interface Email {
  id: string;
  sender: string;
  subject?: string;
  body?: string;
  thread_id?: string;
}

interface ClassificationResult {
  category: string;
  urgency: string;
  requires_human?: boolean;
  escalation_reason?: string | null;
  suggested_reply?: string | null;
  confidence?: number;
}

interface ReasoningStep {
  thought: string;
  action: string;
  action_input?: Record<string, unknown>;
  observation?: string;
  final_answer?: string;
}

async function groqRequest(messages: { role: string; content: string }[], maxTokens = 500) {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        { model: 'llama-3.3-70b-versatile', max_tokens: maxTokens, temperature: 0.1, messages },
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
      );
      return resp.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 429) {
        await new Promise(res => setTimeout(res, 2000));
        lastErr = err as Error;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function runAgent(email: Email, classificationResult: ClassificationResult, dryRun = false) {
  const reasoningLog: ReasoningStep[] = [];
  let stepCount = 0;
  const MAX_STEPS = 6;

  const tools: Record<string, (input: Record<string, string>) => Promise<string>> = {
    search_knowledge_base: async ({ queryText }) => {
      const chunks = await retrieveRelevantChunks(queryText, 3);
      return (chunks as { source_doc: string; chunk_text: string }[]).map(c => `[${c.source_doc}] ${c.chunk_text}`).join('\n\n');
    },
    get_thread_history: async ({ sender_email }) => {
      const result = await query('SELECT sender, subject, body, timestamp, sentiment_score, category FROM emails WHERE sender = $1 ORDER BY timestamp ASC', [sender_email]);
      return JSON.stringify(result.rows.slice(-10));
    },
    get_contact_profile: async ({ email: emailAddr }) => {
      const result = await query('SELECT * FROM contacts WHERE email = $1', [emailAddr]);
      return JSON.stringify(result.rows[0] || { email: emailAddr, status: 'Unknown', account_value: 0 });
    },
    escalate_to_human: async ({ email_id, reason, priority }) => {
      if (!dryRun) {
        await query('INSERT INTO actions (email_id, action_type, proposed_content, agent_reasoning_log) VALUES ($1, $2, $3, $4)', [email_id, 'Escalate', reason, JSON.stringify(reasoningLog)]);
        await query('UPDATE emails SET status = $1, requires_human = true WHERE id = $2', ['Escalated', email_id]);
      }
      return `Escalated to human: ${reason} (Priority: ${priority})`;
    },
    flag_for_legal: async ({ email_id, issue_type }) => {
      if (!dryRun) {
        await query('INSERT INTO actions (email_id, action_type, proposed_content) VALUES ($1, $2, $3)', [email_id, 'Legal-Flag', issue_type]);
        await query('UPDATE emails SET status = $1 WHERE id = $2', ['Escalated', email_id]);
      }
      return `Legal flag created for: ${issue_type}`;
    },
    create_internal_ticket: async ({ title, body, assignee, priority }) => {
      if (!dryRun) {
        await query('INSERT INTO internal_tickets (email_id, title, body, assignee, priority) VALUES ($1, $2, $3, $4, $5)', [email.id, title, body, assignee, priority || 'High']);
      }
      return `Internal ticket created: ${title} → assigned to ${assignee}`;
    },
    send_auto_reply: async ({ email_id, content }) => {
      if (!dryRun) {
        await query('INSERT INTO actions (email_id, action_type, proposed_content, is_approved, agent_reasoning_log) VALUES ($1, $2, $3, $4, $5)', [email_id, 'Auto-Reply', content, false, JSON.stringify(reasoningLog)]);
        await query('UPDATE emails SET status = $1, suggested_reply = $2 WHERE id = $3', ['Replied', content, email_id]);
      }
      return `Auto-reply drafted and pending approval.`;
    }
  };

  const isSecurityThreat = classificationResult.category === 'Security' || (classificationResult.escalation_reason || '').toLowerCase().includes('ransomware');
  const isGDPR = classificationResult.category === 'Compliance' && (email.body || '').toLowerCase().includes('portab');

  if (isSecurityThreat) {
    const obs = await tools.escalate_to_human({ email_id: email.id, reason: 'SECURITY THREAT — ransomware or extortion. Never auto-reply.', priority: 'Critical' });
    reasoningLog.push({ thought: 'Security threat detected. Hard rule: escalate immediately, never auto-reply.', action: 'escalate_to_human', observation: obs });
    return { reasoningLog, finalAction: 'Escalated', dryRun };
  }

  if (isGDPR) {
    const flagObs = await tools.flag_for_legal({ email_id: email.id, issue_type: 'GDPR Article 20 Data Portability Request — statutory 30-day obligation' });
    const ticketObs = await tools.create_internal_ticket({ title: `GDPR Data Portability Request - ${email.sender}`, body: email.body || '', assignee: 'privacy@company.com', priority: 'Critical' });
    const replyContent = classificationResult.suggested_reply || 'We have received your GDPR Article 20 data portability request and will respond within the statutory 30-day window. Our DPO will be in contact shortly.';
    const replyObs = await tools.send_auto_reply({ email_id: email.id, content: replyContent });
    reasoningLog.push({ thought: 'GDPR Article 20 request. Hard rule: flag legal, create compliance ticket, send statutory acknowledgement.', action: 'flag_for_legal + create_internal_ticket + send_auto_reply', observation: `${flagObs} | ${ticketObs} | ${replyObs}` });
    return { reasoningLog, finalAction: 'GDPR-Compliance', dryRun };
  }

  const systemPrompt = `You are an autonomous CRM agent deciding what to do with a classified email. You have these tools: search_knowledge_base, get_thread_history, get_contact_profile, escalate_to_human, flag_for_legal, create_internal_ticket, send_auto_reply. Respond ONLY with JSON: {"thought": "...", "action": "tool_name", "action_input": {...}} or {"thought": "...", "action": "FINISH", "final_answer": "..."}. Max ${MAX_STEPS} steps.`;

  const conversationHistory: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Email from: ${email.sender}\nSubject: ${email.subject}\nBody: ${(email.body || '').slice(0, 1000)}\nClassification: ${JSON.stringify(classificationResult)}\nEmail DB ID: ${email.id}\nDecide what actions to take. RULE: If urgency is Critical, you MUST escalate to human.` }
  ];

  while (stepCount < MAX_STEPS) {
    stepCount++;
    try {
      const respData = await groqRequest(conversationHistory);
      let raw = respData.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
      const step = JSON.parse(raw);

      if (step.action === 'FINISH') {
        reasoningLog.push({ thought: step.thought, action: 'FINISH', observation: step.final_answer });
        break;
      }

      const toolFn = tools[step.action as string];
      let observation = 'Tool not found.';
      if (toolFn) {
        observation = await toolFn(step.action_input || {});
      }

      reasoningLog.push({ thought: step.thought, action: step.action, action_input: step.action_input, observation });
      conversationHistory.push({ role: 'assistant', content: raw });
      conversationHistory.push({ role: 'user', content: `Observation: ${observation}\nContinue or FINISH.` });
    } catch (err: unknown) {
      const error = err as Error;
      reasoningLog.push({ thought: 'Agent step failed', action: 'ERROR', observation: error.message });
      break;
    }
  }

  if (stepCount >= MAX_STEPS) {
    await tools.escalate_to_human({ email_id: email.id, reason: 'Agent reached max steps without resolution.', priority: classificationResult.urgency });
    reasoningLog.push({ thought: 'Max steps reached.', action: 'escalate_to_human', observation: 'Escalated due to max steps.' });
  }

  if (!dryRun && reasoningLog.length > 0) {
    await query(
      'UPDATE actions SET agent_reasoning_log = $1 WHERE email_id = $2 AND created_at = (SELECT MAX(created_at) FROM actions WHERE email_id = $2)',
      [JSON.stringify(reasoningLog), email.id]
    );
  }

  return { reasoningLog, finalAction: reasoningLog[reasoningLog.length - 1]?.action || 'Unknown', dryRun };
}
