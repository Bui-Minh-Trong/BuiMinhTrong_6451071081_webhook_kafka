function analyzeComment(text) {
  const safeText = (text ?? '').trim();

  const rules = [
    { pattern: /giá|bao nhiêu|price|cost|tiền|mua/i,          intent: 'price_inquiry', sentiment: 'neutral'  },
    { pattern: /chưa nhận|không nhận|thất lạc|hoàn tiền|khiếu nại|chậm/i, intent: 'complaint', sentiment: 'negative' },
    { pattern: /hay quá|tuyệt|đẹp|tốt|thích|love|great|ủng hộ/i, intent: 'compliment', sentiment: 'positive' },
    { pattern: /lừa đảo|scam|fake|giả mạo/i,                  intent: 'complaint',     sentiment: 'negative' },
    { pattern: /\?|sao|như thế nào|khi nào|ở đâu|địa chỉ/i,  intent: 'question',      sentiment: 'neutral'  },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(safeText)) {
      return {
        intent: rule.intent,
        sentiment: rule.sentiment,
        confidence: 0.85,
        summary: `Detected: ${rule.intent}`,
      };
    }
  }

  return { intent: 'other', sentiment: 'neutral', confidence: 0.5, summary: 'No pattern matched' };
}

module.exports = { analyzeComment };