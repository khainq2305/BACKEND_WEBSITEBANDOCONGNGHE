// utils/geminiClient.js (CommonJS)
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ===== ENV PARSE =====
const KEYS = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(',').map(s => s.trim()).filter(Boolean)
  : (process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY.trim()] : []);

const PRIMARY_MODEL = (process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-1.5-flash-8b')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!KEYS.length) {
  // Không có key → tắt hẳn client
  console.warn('[Gemini] No API key found in env (GEMINI_API_KEYS or GEMINI_API_KEY).');
}

const perKeyCooldownUntil = new Map(); // key -> timestamp ms

function getRetryMsFromError(err) {
  // default 60s
  let retryMs = 60_000;
  try {
    const details = err?.errorDetails || [];
    const retryInfo = details.find(d => String(d['@type'] || '').includes('RetryInfo'));
    const s = String(retryInfo?.retryDelay || '');
    const m = s.match(/([\d.]+)s/);
    if (m) retryMs = Math.ceil(parseFloat(m[1]) * 1000);
  } catch (_) {}
  return retryMs;
}

/**
 * Gọi Gemini với fallback: thử lần lượt các key còn “không cooldown”, và với mỗi key
 * thử lần lượt model: [PRIMARY_MODEL, ...FALLBACK_MODELS]
 */
async function generateWithGemini(prompt) {
  if (!KEYS.length) return null;

  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS];

  for (const key of KEYS) {
    // Bỏ qua key đang cooldown
    const until = perKeyCooldownUntil.get(key) || 0;
    if (Date.now() < until) continue;

    const genAI = new GoogleGenerativeAI(key);

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result?.response?.text?.();
        if (typeof text === 'string' && text.trim()) {
          return text.trim();
        }
        // Không có text → thử model tiếp theo
      } catch (err) {
        // quota/429: đặt cooldown cho key này, rồi thử sang key khác
        if (err?.status === 429) {
          const retryMs = getRetryMsFromError(err);
          perKeyCooldownUntil.set(key, Date.now() + retryMs);
          console.error(`[Gemini] 429 on key ****${key.slice(-6)} model=${modelName}, cooldown ${retryMs}ms`);
          break; // sang key khác luôn
        }
        // 403/401/404/5xx/network: log rồi thử model tiếp theo (hoặc key khác)
        console.error(`[Gemini] error key ****${key.slice(-6)} model=${modelName}:`, err?.status || '', err?.statusText || '', err?.message || err);
        // Với 404 (model không tồn tại trên v1beta) → skip model, thử model kế tiếp
        if (err?.status === 404) continue;
        // Lỗi khác: thử model tiếp theo; hết model → thử key kế tiếp
      }
    }
  }

  // Hết đường fallback
  return null;
}

module.exports = { generateWithGemini };
