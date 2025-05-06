const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const User = require('../../models/userModel'); 
const axios = require("axios");
const { registerUser, loginUser, verifyEmail } = require("../../services/client/auth.service");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET;
class AuthController {
  static async register(req, res) {
    try {
      await registerUser(req.body);
      res.status(201).json({ message: "Vui lòng kiểm tra email để xác thực!" });
    } catch (err) {
      res.status(400).json({ message: err.message || "Lỗi server!" });
    }
  }

  static async login(req, res) {
    try {
      const user = await loginUser(req.body);
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roleId: user.roleId
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.status(200).json({ message: "Đăng nhập thành công!", token, user });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }

  static async verifyEmail(req, res) {
    try {
      const { token } = req.query;
      await verifyEmail(token);
      res.json({ message: "Xác thực email thành công!" });
    } catch (err) {
      res.status(400).json({ message: "Link không hợp lệ hoặc đã hết hạn!" });
    }
  }
  static async googleLogin(req, res) {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "Thiếu token!" });
  
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
  
      const payload = ticket.getPayload();
      
console.log("🔎 Google Token Payload:", payload);
console.log("✅ Backend expects client ID:", process.env.GOOGLE_CLIENT_ID);

      const providerId = payload.sub; // Google ID
      const email = payload.email;
      const name = payload.name || email.split("@")[0];
      const avatar = payload.picture;
  
      // 1. Tìm user theo providerId + provider
      let user = await User.findOne({
        where: {
          provider: "google",
          providerId,
        },
      });
  
      if (!user) {
        // 2. Nếu chưa có thì kiểm tra theo email
        user = await User.findOne({ where: { email } });
  
        if (user) {
          // Nếu email đã có (do đăng ký local trước) thì update provider info
          await user.update({
            provider: "google",
            providerId,
          });
        } else {
          // 3. Nếu chưa có user nào thì tạo mới
          user = await User.create({
            fullName: name,
            email,
            provider: "google",
            providerId,
            password: null,
            roleId: 2, // hoặc 1 tùy quyền mặc định của bạn
            status: 1,
            isVerified: 1,
          });
        }
      }
  
      const accessToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          roleId: user.roleId,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      
      // ✅ Thêm dòng này để lưu cookie
      res.cookie("token", accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      
      return res.status(200).json({
        message: "Đăng nhập Google thành công!",
        token: accessToken,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          roleId: user.roleId,
          status: user.status,
        },
      });
      
    } catch (err) {
      console.error("❌ Lỗi Google Login:", err);
      return res.status(401).json({ message: "Token không hợp lệ" });
    }
  }
  

  static async facebookLogin(req, res) {
    try {
      const { accessToken, userID } = req.body;
      if (!accessToken || !userID)
        return res.status(400).json({ message: "Thiếu accessToken hoặc userID" });
  
      // Gọi Graph API để lấy thông tin user
      const fbRes = await axios.get(
        `https://graph.facebook.com/v18.0/${userID}?fields=id,name,email,picture&access_token=${accessToken}`
      );
  
      const { id: providerId, name, email, picture } = fbRes.data;
      if (!email) return res.status(400).json({ message: "Không lấy được email từ Facebook" });
  
      let user = await User.findOne({ where: { provider: "facebook", providerId } });
  
      if (!user) {
        // Nếu email đã tồn tại (từng đăng ký local hoặc google)
        user = await User.findOne({ where: { email } });
        if (user) {
          await user.update({ provider: "facebook", providerId });
        } else {
          user = await User.create({
            fullName: name,
            email,
            provider: "facebook",
            providerId,
            password: null,
            roleId: 2,
            status: 1,
            isVerified: 1,
          });
        }
      }
  
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          roleId: user.roleId,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
  
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
  
      return res.status(200).json({
        message: "Đăng nhập Facebook thành công!",
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
      console.error("❌ Facebook Login Error:", err);
      return res.status(401).json({ message: "Đăng nhập Facebook thất bại!" });
    }
  }
  
}

module.exports = AuthController;
