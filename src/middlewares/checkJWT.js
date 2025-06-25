// src/middlewares/authMiddleware.js
const { verifyToken } = require('../utils/jwtUtils');

const checkJWT = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "Bạn chưa đăng nhập hoặc token không tồn tại!" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
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
