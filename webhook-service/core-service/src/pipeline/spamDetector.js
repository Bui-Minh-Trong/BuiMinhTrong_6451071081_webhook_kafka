const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(ly|me|vn|com|net|org|io|co|link|click|tk|ml|ga|cf|gq)\/[^\s]+/gi;

//  nhận string trực tiếp thay vì object
function detectSpam(text) {
  // guard clause tránh crash nếu text undefined/null
  const safeText = (text ?? '').trim();

  const result = {
    isSpam: false,
    spamLevel: 'none',
    reasons: [],
  };

  if (!safeText) return result;

  // Kiểm tra link
  const links = safeText.match(URL_REGEX) || [];
  if (links.length > 0) {
    result.reasons.push('contains_link');
    result.isSpam = true;
    result.spamLevel = 'light';

    const scamPatterns = /bit\.ly|tinyurl|t\.me|zalo\.me/i;
    if (scamPatterns.test(safeText)) {
      result.spamLevel = 'heavy';
      result.reasons.push('suspicious_link');
    }
  }

  // Kiểm tra lặp nội dung
  const words = safeText.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length > 5) {
    const wordCount = {};
    words.forEach(w => { wordCount[w] = (wordCount[w] || 0) + 1; });
    const maxRepeat = Math.max(...Object.values(wordCount));
    if (maxRepeat >= 4) {
      result.reasons.push('repetitive_content');
      result.isSpam = true;
      if (result.spamLevel !== 'heavy') result.spamLevel = 'light';
    }
  }

  // Toàn bộ in hoa
  if (safeText.length > 10 && safeText === safeText.toUpperCase() && /[A-Z]/.test(safeText)) {
    result.reasons.push('all_caps');
    if (!result.isSpam) {
      result.isSpam = true;
      result.spamLevel = 'light';
    }
  }

  return result;
}

module.exports = { detectSpam };