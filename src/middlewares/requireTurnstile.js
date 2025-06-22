import { verifyTurnstile } from '../utils/verifyTurnstile.js';

export async function requireTurnstile(req, res, next) {
  const { cfToken } = req.body;

  if (!cfToken) {
    return res.status(400).json({ message: 'Thiếu token Turnstile.' });
  }

  const passed = await verifyTurnstile(cfToken, req.ip);
  if (!passed) {
    return res.status(403).json({ message: 'Xác minh bảo mật thất bại!' });
  }

  next(); // ✅ Cho đi tiếp nếu pass
}
