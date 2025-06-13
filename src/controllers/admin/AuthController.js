// src/controllers/client/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../../models/userModel");
const JWT_SECRET = process.env.JWT_SECRET || "your_secret";
const { Role, Permission } = require("../../models");
const { getUserDetail } = require("../../services/admin/user.service");
class AuthController {
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res
          .status(400)
          .json({ message: "Email hoặc mật khẩu không đúng!" });
      }

      if (user.status === 0) {
        return res.status(403).json({ message: "Tài khoản bị khóa!" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res
          .status(400)
          .json({ message: "Email hoặc mật khẩu không đúng!" });
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roleId: user.roleId,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: false, // ❌ tránh dùng true ở local
        sameSite: "Lax", // ✅ dùng "Lax" ở local
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
      });

      res.status(200).json({
        message: "Đăng nhập thành công!",
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roleId: user.roleId,
          status: user.status,
        },
      });
    } catch (err) {
      console.error("Lỗi đăng nhập:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async getUserInfo(req, res) {
    try {
      const user = await getUserDetail(req.user.id);
      if (!user)
        return res.status(404).json({ message: "Người dùng không tồn tại" });

      res.status(200).json({ user });
    } catch (err) {
      console.error("Lỗi getUserInfo:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
  static async logout(req, res) {
    console.log("đã gọi đăng xuất");
    try {
      res.clearCookie("token", {
        httpOnly: true,
        secure: false, // ❌ đừng dùng true
        sameSite: "Lax", // ✅ khớp với lúc set
        path: "/", // ✅ rất quan trọng
      });

      res.status(200).json({ message: "Đăng xuất thành công!" });
    } catch (err) {
      console.error("Lỗi đăng xuất:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }
}
module.exports = AuthController;
