const SPAM_KEYWORDS = ['seo', 'front page of google', 'boost your seo', 'limited offer', 'click here to claim', 'make money', 'free!!!', '300%', 'just $99'];
const SPAM_DOMAINS = ['marketing-guru.io', 'spam-domain.com', 'promo-blast.net'];
const SECURITY_KEYWORDS = ['ransomware', 'send 2 btc', 'bitcoin', 'suspicious login', 'data breach', 'malware', 'hack', 'pyongyang', 'north korea', 'compromised credentials', 'your files are encrypted'];
const LEGAL_KEYWORDS = ['gdpr', 'article 20', 'data portability', 'cease and desist', 'lawsuit', 'attorney', 'legal action', 'formal request', 'statutory', 'right to erasure'];
const URGENCY_KEYWORDS = ['urgent', 'p0', 'production down', 'outage', 'critical', 'losing $', 'immediately', 'legal', 'lawyer', 'legal team'];
const INTERNAL_DOMAINS = ['internal.com', 'mycompany.com'];

export interface HeuristicResult {
  isSpam: boolean;
  isInternal: boolean;
  isSecurity: boolean;
  isLegal: boolean;
  urgencyScore: number;
  flags: string[];
  initialPriority: string;
}

export function runHeuristicFilter(email: { subject?: string; body?: string; sender?: string }): HeuristicResult {
  const text = `${email.subject || ''} ${email.body || ''}`.toLowerCase();
  const senderDomain = (email.sender || '').split('@')[1]?.toLowerCase() || '';

  const result: HeuristicResult = { isSpam: false, isInternal: false, isSecurity: false, isLegal: false, urgencyScore: 0, flags: [], initialPriority: 'Low' };

  if (INTERNAL_DOMAINS.some(d => senderDomain.includes(d))) {
    result.isInternal = true;
    result.flags.push('INTERNAL');
    return result;
  }

  const spamHits = SPAM_KEYWORDS.filter(k => text.includes(k)).length;
  if (spamHits >= 2 || SPAM_DOMAINS.some(d => senderDomain.includes(d))) {
    result.isSpam = true;
    result.flags.push('SPAM');
    return result;
  }

  if (SECURITY_KEYWORDS.some(k => text.includes(k))) {
    result.isSecurity = true;
    result.urgencyScore = 100;
    result.initialPriority = 'Critical';
    result.flags.push('SECURITY_THREAT');
  }

  if (LEGAL_KEYWORDS.some(k => text.includes(k))) {
    result.isLegal = true;
    result.initialPriority = 'Critical';
    result.flags.push('LEGAL_FLAG');
  }

  const urgencyHits = URGENCY_KEYWORDS.filter(k => text.includes(k)).length;
  if (!result.isSecurity) {
    result.urgencyScore = Math.min(100, urgencyHits * 25);
  }

  if (!result.isSecurity && !result.isLegal) {
    if (result.urgencyScore >= 75) result.initialPriority = 'Critical';
    else if (result.urgencyScore >= 50) result.initialPriority = 'High';
    else if (result.urgencyScore >= 25) result.initialPriority = 'Medium';
    else result.initialPriority = 'Low';
  }

  return result;
}
