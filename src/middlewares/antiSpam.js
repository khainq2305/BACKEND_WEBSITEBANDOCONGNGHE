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

  if (last && now - last < 30 * 1000) {
    return res.status(429).json({
      message: 'Bạn đang gửi quá nhanh. Vui lòng thử lại sau 30 giây.'
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

  if (last && now - last < 5 * 1000) {
    return res.status(429).json({
      message: 'Bạn đang trả lời quá nhanh. Thử lại sau vài giây.'
    });
  }

  adminReplyTimestamps.set(key, now);
  next();
};

module.exports = {
  clientSpamGuard,
  adminReplySpamGuard
};
