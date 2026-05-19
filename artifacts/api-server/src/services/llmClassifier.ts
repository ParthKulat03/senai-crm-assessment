import axios from 'axios';

interface EmailInput {
  message_id: string;
  sender: string;
  subject?: string;
  body?: string;
}

interface ClassificationResult {
  category: string;
  sentiment: string;
  sentiment_score: number;
  urgency: string;
  requires_human: boolean;
  escalation_reason: string | null;
  suggested_reply: string | null;
  confidence: number;
  detected_entities: Record<string, unknown>;
  policy_citations: string[];
}

async function groqRequest(messages: { role: string; content: string }[], maxTokens = 1000) {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama3-70b-8192',
          max_tokens: maxTokens,
          temperature: 0.1,
          messages
        },
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
      );
      return response.data;
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

export async function classifyEmail(
  email: EmailInput,
  threadHistory: unknown[] = [],
  ragChunks: { source_doc: string; chunk_text: string }[] = []
): Promise<ClassificationResult> {
  const contextChunks = ragChunks.map(c => `[${c.source_doc}]: ${c.chunk_text}`).join('\n\n');
  const threadContext = threadHistory.length > 0
    ? (threadHistory as { timestamp: string; sender: string; subject?: string; body?: string }[])
        .map(e => `[${e.timestamp}] FROM: ${e.sender}\nSUBJECT: ${e.subject}\n${e.body?.slice(0, 300)}`)
        .join('\n---\n')
    : 'No prior thread history.';

  const systemPrompt = `You are a precise AI triage agent for a B2B SaaS customer support team. Classify incoming emails accurately. CRITICAL RULES:
1. Ransomware/security threats: category=Legal OR Security, urgency=Critical, requires_human=true, suggested_reply=null — NEVER suggest a reply
2. GDPR requests: category=Compliance, urgency=Critical, requires_human=true
3. If confidence < 0.70: requires_human=true
4. Respond ONLY with valid JSON — no markdown, no explanation, no backticks.`;

  const userPrompt = `KNOWLEDGE BASE CONTEXT:
${contextChunks || 'No relevant KB context found.'}

THREAD HISTORY:
${threadContext}

CURRENT EMAIL TO CLASSIFY:
Message ID: ${email.message_id}
From: ${email.sender}
Subject: ${email.subject}
Body: ${email.body?.slice(0, 2000)}

Respond with this exact JSON structure:
{
  "category": "Complaint|Inquiry|Bug Report|Feature Request|Compliance|Legal|Billing|Spam|Internal|Security|Other",
  "sentiment": "Positive|Neutral|Negative|Mixed",
  "sentiment_score": <number -1.0 to 1.0>,
  "urgency": "Critical|High|Medium|Low",
  "requires_human": <true|false>,
  "escalation_reason": "<string or null>",
  "suggested_reply": "<string or null — null if requires_human is true or security/GDPR>",
  "confidence": <number 0.0 to 1.0>,
  "detected_entities": {
    "order_ids": [],
    "ticket_ids": [],
    "monetary_amounts": [],
    "deadlines": [],
    "company_names": []
  },
  "policy_citations": ["<list of kb doc filenames that informed this>"]
}`;

  try {
    const data = await groqRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    let raw = data.choices[0].message.content.trim();
    raw = raw.replace(/```json|```/g, '').trim();
    const parsed: ClassificationResult = JSON.parse(raw);

    const bodyLower = (email.body || '').toLowerCase();
    const subjectLower = (email.subject || '').toLowerCase();
    const fullText = bodyLower + ' ' + subjectLower;

    if (fullText.includes('btc') || fullText.includes('ransomware') || fullText.includes('your files are encrypted') || fullText.includes('send 2 btc')) {
      parsed.category = 'Security';
      parsed.urgency = 'Critical';
      parsed.requires_human = true;
      parsed.suggested_reply = null;
      parsed.escalation_reason = 'SECURITY THREAT: Ransomware or extortion detected. Never auto-reply.';
    }

    if (fullText.includes('article 20') || fullText.includes('data portability') || (fullText.includes('gdpr') && fullText.includes('portability'))) {
      parsed.category = 'Compliance';
      parsed.urgency = 'Critical';
      parsed.requires_human = true;
      parsed.escalation_reason = 'GDPR Article 20 data portability request — legal obligation, route to privacy@company.com';
      parsed.suggested_reply = 'We have received your GDPR Article 20 data portability request. Under our legal obligations, we will provide a complete export of your personal data within the statutory 30-day window. Our Data Protection Officer will be in contact shortly. Reference: privacy@company.com';
    }

    if (parsed.confidence < 0.70) {
      parsed.requires_human = true;
      parsed.escalation_reason = (parsed.escalation_reason || '') + ' Low confidence classification — flagged for human review.';
    }

    return parsed;
  } catch (err: unknown) {
    const error = err as Error;
    console.error('LLM classification error:', error.message);
    return {
      category: 'Other', sentiment: 'Neutral', sentiment_score: 0,
      urgency: 'Medium', requires_human: true, confidence: 0,
      escalation_reason: 'Classification failed — defaulting to human review.',
      suggested_reply: null, detected_entities: {}, policy_citations: []
    };
  }
}
