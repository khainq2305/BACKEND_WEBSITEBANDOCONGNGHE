const adminReplyTimestamps = new Map();
const clientQuestionTimestamps = new Map();

const clientSpamGuard = (req, res, next) => {
  const key =
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'anonymous';

  const now = Date.now();
  const last = clientQuestionTimestamps.get(key);

  const { content } = req.body;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ message: 'Thiếu nội dung câu hỏi.' });
  }
  if (content.length > 500) {
    return res.status(400).json({
      message: 'Nội dung quá dài. Vui lòng không vượt quá 500 ký tự.'
    });
  }

  // ✅ Giới hạn gửi 5 giây 1 lần (client)
  if (last && now - last < 5 * 1000) {
    const remaining = Math.ceil((5 * 1000 - (now - last)) / 1000);
    return res.status(429).json({
      message: `Bạn đang gửi quá nhanh. Vui lòng thử lại sau ${remaining} giây.`
    });
  }

  clientQuestionTimestamps.set(key, now);
  next();
};

const adminReplySpamGuard = (req, res, next) => {
  const key =
    (req.user && req.user.id) ||
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'guest-admin';

  const now = Date.now();
  const last = adminReplyTimestamps.get(key);

  // ✅ Giới hạn gửi 5 giây 1 lần (admin)
  if (last && now - last < 5 * 1000) {
    const remaining = Math.ceil((5 * 1000 - (now - last)) / 1000);
    return res.status(429).json({
      message: `Bạn đang trả lời quá nhanh. Vui lòng thử lại sau ${remaining} giây.`
    });
  }

  adminReplyTimestamps.set(key, now);
  next();
};

module.exports = {
  clientSpamGuard,
  adminReplySpamGuard
};
