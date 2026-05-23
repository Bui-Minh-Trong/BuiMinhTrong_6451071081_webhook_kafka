const Anthropic = require('@anthropic-ai/sdk');

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// fallback khi chưa có API key hoặc Claude call lỗi
function analyzeCommentRuleBased(text) {
  const safeText = (text ?? '').trim();

  const rules = [
    { pattern: /giá|bao nhiêu|price|cost|tiền|mua/i,                       intent: 'price_inquiry', sentiment: 'neutral'  },
    { pattern: /chưa nhận|không nhận|thất lạc|hoàn tiền|khiếu nại|chậm/i, intent: 'complaint',     sentiment: 'negative' },
    { pattern: /hay quá|tuyệt|đẹp|tốt|thích|love|great|ủng hộ/i,          intent: 'compliment',    sentiment: 'positive' },
    { pattern: /lừa đảo|scam|fake|giả mạo/i,                               intent: 'complaint',     sentiment: 'negative' },
    { pattern: /\?|sao|như thế nào|khi nào|ở đâu|địa chỉ/i,               intent: 'question',      sentiment: 'neutral'  },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(safeText)) {
      return { intent: rule.intent, sentiment: rule.sentiment, confidence: 0.75, summary: rule.intent, source: 'rule_based' };
    }
  }

  return { intent: 'other', sentiment: 'neutral', confidence: 0.5, summary: 'no match', source: 'rule_based' };
}

async function analyzeComment(text) {
  const safeText = (text ?? '').trim();
  if (!safeText) return { intent: 'other', sentiment: 'neutral', confidence: 0.5, summary: 'empty', source: 'rule_based' };

  if (!client) {
    console.warn('[AI] ANTHROPIC_API_KEY chưa set, dùng rule-based');
    return analyzeCommentRuleBased(safeText);
  }

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-20240307', // haiku: nhanh + rẻ nhất
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Phân tích bình luận Facebook sau, trả về JSON với các field:
intent: "price_inquiry"|"complaint"|"compliment"|"question"|"other"
sentiment: "positive"|"negative"|"neutral"
confidence: 0.0-1.0
summary: mô tả ngắn tiếng Việt

Bình luận: "${safeText}"
Chỉ trả JSON, không text thêm.`,
      }],
    });

    const raw = msg.content[0]?.text?.trim() || '';
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error(`no JSON in response: ${raw}`);

    const parsed = JSON.parse(match[0]);

    // sanitize để tránh crash downstream nếu Claude trả sai schema
    const validIntents    = ['price_inquiry', 'complaint', 'compliment', 'question', 'other'];
    const validSentiments = ['positive', 'negative', 'neutral'];
    if (!validIntents.includes(parsed.intent))       parsed.intent     = 'other';
    if (!validSentiments.includes(parsed.sentiment)) parsed.sentiment  = 'neutral';
    if (typeof parsed.confidence !== 'number')       parsed.confidence = 0.8;

    return { ...parsed, source: 'claude' };

  } catch (err) {
    console.error('[AI] Claude failed, fallback rule-based:', err.message);
    return analyzeCommentRuleBased(safeText);
  }
}

module.exports = { analyzeComment };