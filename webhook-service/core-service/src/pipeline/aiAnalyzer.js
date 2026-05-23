// AI Analyzer — Tích hợp Anthropic Claude để phân tích intent & sentiment
// Fallback về rule-based nếu API key chưa cấu hình hoặc call thất bại
const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

let client = null;
if (ANTHROPIC_API_KEY) {
  client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

// ─── Rule-based fallback (giữ nguyên logic cũ) ───
function analyzeCommentRuleBased(text) {
  const safeText = (text ?? '').trim();

  const rules = [
    { pattern: /giá|bao nhiêu|price|cost|tiền|mua/i,                          intent: 'price_inquiry', sentiment: 'neutral'  },
    { pattern: /chưa nhận|không nhận|thất lạc|hoàn tiền|khiếu nại|chậm/i,    intent: 'complaint',     sentiment: 'negative' },
    { pattern: /hay quá|tuyệt|đẹp|tốt|thích|love|great|ủng hộ/i,             intent: 'compliment',    sentiment: 'positive' },
    { pattern: /lừa đảo|scam|fake|giả mạo/i,                                  intent: 'complaint',     sentiment: 'negative' },
    { pattern: /\?|sao|như thế nào|khi nào|ở đâu|địa chỉ/i,                  intent: 'question',      sentiment: 'neutral'  },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(safeText)) {
      return {
        intent:     rule.intent,
        sentiment:  rule.sentiment,
        confidence: 0.75,
        summary:    `Rule-based: ${rule.intent}`,
        source:     'rule_based',
      };
    }
  }

  return {
    intent:     'other',
    sentiment:  'neutral',
    confidence: 0.5,
    summary:    'Không khớp quy tắc nào',
    source:     'rule_based',
  };
}

// ─── Phân tích bằng Claude AI ───
async function analyzeComment(text) {
  const safeText = (text ?? '').trim();

  if (!safeText) {
    return { intent: 'other', sentiment: 'neutral', confidence: 0.5, summary: 'Nội dung trống', source: 'rule_based' };
  }

  // Nếu chưa cấu hình API key → dùng rule-based
  if (!client) {
    console.warn('[AI] ANTHROPIC_API_KEY chưa được cấu hình → dùng rule-based fallback');
    return analyzeCommentRuleBased(safeText);
  }

  try {
    const prompt = `Bạn là AI phân tích bình luận mạng xã hội cho một Facebook Page thương mại điện tử.

Phân tích bình luận sau và trả về JSON hợp lệ với các field sau:
- intent: "price_inquiry" (hỏi giá) | "complaint" (khiếu nại) | "compliment" (khen) | "question" (hỏi thông tin) | "other"
- sentiment: "positive" | "negative" | "neutral"  
- confidence: số thực từ 0.0 đến 1.0
- summary: mô tả ngắn gọn bằng tiếng Việt (tối đa 20 từ)

Bình luận cần phân tích: "${safeText}"

Chỉ trả về JSON thuần túy, không có text giải thích thêm.`;

    const message = await client.messages.create({
      model:       'claude-haiku-20240307', // model nhanh và rẻ nhất
      max_tokens:  150,
      messages:    [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0]?.text?.trim() || '';

    // Trích xuất JSON từ response (phòng trường hợp có text thừa)
    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error(`Response không chứa JSON hợp lệ: ${responseText}`);

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate các field bắt buộc
    const validIntents   = ['price_inquiry', 'complaint', 'compliment', 'question', 'other'];
    const validSentiments = ['positive', 'negative', 'neutral'];

    if (!validIntents.includes(parsed.intent))     parsed.intent    = 'other';
    if (!validSentiments.includes(parsed.sentiment)) parsed.sentiment = 'neutral';
    if (typeof parsed.confidence !== 'number')     parsed.confidence = 0.8;

    return { ...parsed, source: 'claude' };

  } catch (err) {
    // Lỗi API → fallback về rule-based, không crash toàn bộ pipeline
    console.error('[AI] Claude API thất bại, dùng rule-based fallback:', err.message);
    return analyzeCommentRuleBased(safeText);
  }
}

module.exports = { analyzeComment };