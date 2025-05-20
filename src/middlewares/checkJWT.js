// src/middlewares/authMiddleware.js
const { verifyToken } = require('../utils/jwtUtils');

const checkJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Bạn chưa đăng nhập hoặc token không hợp lệ!" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // ✅ Đính kèm thông tin user vào request
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "❌ Token đã hết hạn, vui lòng đăng nhập lại!" });
    }
    return res.status(401).json({ message: "❌ Token không hợp lệ!" });
  }
};

// ✅ Middleware Kiểm Tra Quyền Admin
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ message: "❌ Bạn chưa đăng nhập!" });
  }

  if (req.user.roleId !== 1) {
    return res.status(403).json({ message: "❌ Bạn không có quyền truy cập (Admin Only)!" });
  }
  next();
};

module.exports = { checkJWT, isAdmin };
