// src/middlewares/authMiddleware.js
const { verifyToken } = require('../utils/jwtUtils');

const clearAndReply = (res, msg) => {
  return res.status(401).json({ message: msg });
};

const checkJWT = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return clearAndReply(res, 'Bạn chưa đăng nhập hoặc token không tồn tại!');
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return clearAndReply(res, 'Token đã hết hạn, vui lòng đăng nhập lại!');
    }
    return clearAndReply(res, 'Token không hợp lệ!');
  }
};

const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ message: 'Bạn chưa đăng nhập!'});
  }
  if (req.user.roleId !== 1) {
    return res.status(403).json({ message: 'Bạn không có quyền truy cập (Admin Only)!'});
  }
  next();
};

module.exports = { checkJWT, isAdmin };
