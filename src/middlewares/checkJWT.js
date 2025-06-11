// src/middlewares/authMiddleware.js
const { verifyToken } = require('../utils/jwtUtils');
const sessions = new Map(); // Tốt hơn nên dùng Redis nếu triển khai thực tế
const checkJWT = (req, res, next) => {
  const token = req.cookies.token;
  console.log("token là: ", token);

  if (!token) {
    return res.status(401).json({ message: "Bạn chưa đăng nhập hoặc token không hợp lệ!" });
  }

  try {
    const decoded = verifyToken(token); // Giải mã JWT
    const userId = decoded.id;          // Giả sử payload có { id, email, ... }
    const now = Date.now();

    const session = sessions.get(userId);

    if (session) {
      const inactiveDuration = now - session.lastActivity;
      const MAX_INACTIVE_TIME = 10 * 60 * 1000; // 10 phút

      if (inactiveDuration > MAX_INACTIVE_TIME) {
        sessions.delete(userId);
        res.clearCookie('token');
        return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn do không hoạt động!' });
      }
    }

    // Cập nhật lại thời gian hoạt động
    sessions.set(userId, {
      lastActivity: now,
      userData: decoded
    });

    req.user = decoded;
    next();
  } catch (error) {
    res.clearCookie('token');
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token đã hết hạn, vui lòng đăng nhập lại!" });
    }
    return res.status(401).json({ message: "Token không hợp lệ!" });
  }
};




const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ message: "Bạn chưa đăng nhập!" });
  }

  if (req.user.roleId !== 1) {
    return res.status(403).json({ message: "Bạn không có quyền truy cập (Admin Only)!" });
  }
  next();
};

module.exports = { checkJWT, isAdmin };
