// src/controllers/client/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const User = require("../../models/userModel");
const sendEmail = require("../../utils/sendEmail");
const UserToken = require("../../models/userTokenModel");
const JWT_SECRET = process.env.JWT_SECRET || "your_secret";
const BASE_URL = process.env.BASE_URL || "http://localhost:9999";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { Op } = require("sequelize");
const cloudinary = require("../../config/cloudinary");
const { uploadImage } = require("../../services/common/upload.service");
const Sequelize = require("sequelize");

const fs = require("fs");
class AuthController {
  static async register(req, res) {
    try {
      const { fullName, email, password } = req.body;
      const ipAddress =
        req.ip ||
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress ||
        "0.0.0.0";

      if (!fullName || !email || !password) {
        return res.status(400).json({ message: "Thiếu thông tin đăng ký!" });
      }

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: "Email đã tồn tại!" });
      }

      const now = new Date();
      const tokenExpiry = 30 * 60 * 1000;

      const existingToken = await UserToken.findOne({
        where: { email, type: "emailVerification" },
        order: [["createdAt", "DESC"]],
      });

      if (existingToken) {
        if (existingToken.expiresAt > now && !existingToken.usedAt) {
          return res.status(200).json({
            message:
              "Đã có link xác thực đang hoạt động. Vui lòng kiểm tra email của bạn.",
            link: `${BASE_URL}/verify-email?token=${existingToken.token}`,
          });
        } else {
          await existingToken.destroy();
        }
      }

      const token = jwt.sign(
        { fullName: fullName.trim(), email, password, roleId: 2 },
        JWT_SECRET,
        { expiresIn: "30m" }
      );

      await UserToken.create({
        email,
        token,
        type: "emailVerification",
        sendCount: 1,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + tokenExpiry),
        ipAddress,
        lockedUntil: null,
        usedAt: null,
      });

      const verificationLink = `${BASE_URL}/verify-email?token=${token}`;
      const emailHtmlContent = `
        <div style="margin: 0; padding: 0; background-color: #f4f7f6; font-family: Arial, sans-serif;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f7f6;">
            <tr>
              <td align="center" style="padding: 20px;">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                  <tr>
                    <td align="center" style="background-color: #0073e6; padding: 30px 20px; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                      <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: bold;">Xác Thực Địa Chỉ Email</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 35px 30px;">
                      <p style="font-size: 17px; color: #333333; line-height: 1.6em; margin: 0 0 20px;">Chào ${fullName.trim()},</p>
                      <p style="font-size: 17px; color: #333333; line-height: 1.6em; margin: 0 0 25px;">Cảm ơn bạn đã đăng ký tài khoản! Để hoàn tất quá trình, vui lòng nhấp vào nút bên dưới để xác thực địa chỉ email của bạn.</p>
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationLink}" target="_blank" style="background-color: #0073e6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 17px; font-weight: bold; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Kích Hoạt Tài Khoản</a>
                      </div>
                      <p style="font-size: 16px; color: #555555; line-height: 1.6em; margin: 0 0 15px;">Liên kết này sẽ hết hạn sau <strong>30 phút</strong>.</p>
                      <p style="font-size: 15px; color: #777777; line-height: 1.6em; margin: 0;">Nếu bạn không yêu cầu tạo tài khoản này, bạn có thể bỏ qua email này một cách an toàn.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 25px 30px; background-color: #f8f9fa; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; text-align: center;">
                      <p style="font-size: 13px; color: #888888; margin: 0;">&copy; ${new Date().getFullYear()} [Tên công ty/website của bạn]. Bảo lưu mọi quyền.</p>
                      <p style="font-size: 13px; color: #888888; margin: 5px 0 0;">Nếu bạn có bất kỳ câu hỏi nào, đừng ngần ngại <a href="mailto:support@example.com" style="color: #0073e6; text-decoration: none;">liên hệ với chúng tôi</a>.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
        `;

      await sendEmail(email, "Xác thực tài khoản của bạn", emailHtmlContent);

      res.status(200).json({ message: "Đã gửi link xác thực qua email!" });
    } catch (err) {
      console.error("Lỗi đăng ký:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async resendVerificationLink(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Thiếu email." });
      }

      const cooldownDuration = 10 * 1000;
      const lock1Minute = 1 * 60 * 1000;
      const lock2Minutes = 2 * 60 * 1000;
      const now = new Date();

      let userToken = await UserToken.findOne({
        where: { email, type: "emailVerification" },
        order: [["createdAt", "DESC"]],
      });

      if (
        userToken &&
        userToken.lockedUntil &&
        now < new Date(userToken.lockedUntil)
      ) {
        const remainingLock = Math.ceil(
          (new Date(userToken.lockedUntil) - now) / 1000
        );
        return res.status(429).json({
          message: `Đã bị khóa. Vui lòng thử lại sau ${remainingLock} giây.`,
        });
      }

      let fullName,
        password,
        roleId = 2;

      if (userToken) {
        const timeSinceLastSend =
          now - new Date(userToken.lastSentAt || userToken.createdAt);
        if (timeSinceLastSend < cooldownDuration) {
          return res.status(429).json({
            message: `Vui lòng chờ ${Math.ceil(
              (cooldownDuration - timeSinceLastSend) / 1000
            )} giây để gửi lại.`,
          });
        }

        userToken.sendCount += 1;
        userToken.lastSentAt = now;

        if (userToken.sendCount >= 5 && userToken.sendCount < 8) {
          userToken.lockedUntil = new Date(now.getTime() + lock1Minute);
        } else if (userToken.sendCount >= 8) {
          userToken.lockedUntil = new Date(now.getTime() + lock2Minutes);
        }

        if (userToken.token && userToken.token !== "dummyToken") {
          try {
            const decoded = jwt.verify(userToken.token, JWT_SECRET, {
              ignoreExpiration: true,
            });
            fullName = decoded.fullName;
            password = decoded.password;
            roleId = decoded.roleId || 2;
          } catch (e) {
            console.warn("Không thể giải mã token cũ:", e.message);
          }
        }

        await userToken.save();
      }

      if (!fullName || !password) {
        const userTokenData = await UserToken.findOne({
          where: { email, type: "emailVerification" },
          order: [["createdAt", "ASC"]],
        });

        if (userTokenData) {
          fullName = userTokenData.fullName;
          password = userTokenData.password;
          roleId = userTokenData.roleId || 2;
        }
      }

      if (!fullName || !password) {
        return res.status(400).json({
          message:
            "Không thể gửi lại link xác thực. Thiếu thông tin người dùng.",
        });
      }

      const newToken = jwt.sign(
        { fullName, email, password, roleId },
        JWT_SECRET,
        { expiresIn: "30m" }
      );

      if (userToken) {
        await userToken.update({
          token: newToken,
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        });
      } else {
        await UserToken.create({
          email,
          token: newToken,
          type: "emailVerification",
          sendCount: 1,
          lastSentAt: now,
          createdAt: now,
          lockedUntil: null,
          usedAt: null,
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        });
      }

      const verificationLink = `${BASE_URL}/verify-email?token=${newToken}`;
      await sendEmail(
        email,
        "Xác thực tài khoản",
        `
      <div>
        <h2>Xác thực tài khoản</h2>
        <p>Chào ${fullName},</p>
        <p>Vui lòng nhấp vào link dưới đây để xác thực tài khoản của bạn:</p>
        <a href="${verificationLink}">Xác thực tài khoản</a>
        <p>Link này sẽ hết hạn sau 30 phút.</p>
      </div>
    `
      );

      res.status(200).json({
        message: "Đã gửi lại link xác thực qua email!",
        lockTime: userToken?.lockedUntil
          ? userToken.lockedUntil.getTime()
          : null,
      });
    } catch (err) {
      console.error("Lỗi gửi lại link xác thực:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async getVerificationCooldown(req, res) {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ message: "Thiếu email." });
      }

      const cooldownDuration = 10 * 1000;
      const now = new Date();

      const userToken = await UserToken.findOne({
        where: { email, type: "emailVerification" },
        order: [["createdAt", "DESC"]],
      });

      if (!userToken) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy thông tin xác thực." });
      }

      const timeSinceLastSend =
        now - new Date(userToken.lastSentAt || userToken.createdAt);
      const cooldownRemaining =
        timeSinceLastSend < cooldownDuration
          ? cooldownDuration - timeSinceLastSend
          : 0;

      const lockRemaining =
        userToken.lockedUntil && now < new Date(userToken.lockedUntil)
          ? new Date(userToken.lockedUntil).getTime() - now.getTime()
          : 0;

      res.status(200).json({
        cooldown: cooldownRemaining > 0 ? cooldownRemaining : 0,
        lockTime: lockRemaining > 0 ? lockRemaining : 0,
      });
    } catch (err) {
      console.error("Lỗi kiểm tra trạng thái xác thực:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async verifyEmail(req, res) {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ message: "Thiếu token xác thực!" });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        return res
          .status(400)
          .json({ message: "Link xác thực không hợp lệ hoặc đã hết hạn." });
      }

      const { fullName, password, roleId } = decoded;

      const userToken = await UserToken.findOne({
        where: { token, type: "emailVerification" },
      });

      if (!userToken) {
        return res
          .status(400)
          .json({ message: "Link xác thực không hợp lệ hoặc đã hết hạn." });
      }

      if (userToken.usedAt) {
        return res
          .status(400)
          .json({ message: "Link xác thực đã được sử dụng." });
      }

      const email = userToken.email;

      await userToken.update({
        usedAt: new Date(),
        lockedUntil: null,
      });

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        await existingUser.update({ isEmailVerified: true });
      } else {
        await User.create({
          fullName: fullName.trim(),
          email,
          password,
          roleId: roleId || 2,
          isEmailVerified: true,
        });
      }

      await sendEmail(
        email,
        "Đăng ký tài khoản thành công!",
        `<div>Chúc mừng ${fullName}, bạn đã xác thực tài khoản thành công.</div>`
      );

      return res
        .status(200)
        .json({ message: "Xác thực thành công! Vui lòng đăng nhập." });
    } catch (err) {
      console.error("Lỗi verifyEmail:", err);
      return res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async checkVerificationStatus(req, res) {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ message: "Thiếu email." });
      }

      const user = await User.findOne({ where: { email } });

      if (!user) {
        return res.status(200).json({
          verified: false,
          lockTime: 0,
          resendCooldown: 0,
          message: "Tài khoản chưa được xác thực (chưa tạo user).",
        });
      }

      if (user.isEmailVerified) {
        return res
          .status(200)
          .json({ verified: true, message: "Tài khoản đã được xác thực." });
      }

      const now = new Date();
      const cooldownDuration = 10 * 1000;

      const userToken = await UserToken.findOne({
        where: { email, type: "emailVerification" },
        order: [["createdAt", "DESC"]],
      });

      let lockTime = 0;
      let resendCooldown = 0;

      if (userToken) {
        if (userToken.lockedUntil && userToken.lockedUntil > now) {
          lockTime = userToken.lockedUntil - now;
        }

        const timeSinceLastSend =
          now - new Date(userToken.lastSentAt || userToken.createdAt);
        resendCooldown =
          timeSinceLastSend < cooldownDuration
            ? cooldownDuration - timeSinceLastSend
            : 0;
      }

      return res.status(200).json({
        verified: false,
        lockTime,
        resendCooldown,
        message: "Tài khoản chưa được xác thực.",
      });
    } catch (err) {
      console.error("Lỗi checkVerificationStatus:", err);
      return res.status(500).json({ message: "Lỗi server!" });
    }
  }

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
        maxAge: 7 * 24 * 60 * 60 * 1000,
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

  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Thiếu email." });
      }

      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res
          .status(404)
          .json({ message: "Email không tồn tại trong hệ thống." });
      }

      const nowUtc = new Date();
      const tokenExpiry = 30 * 60 * 1000; // 30 phút
      const cooldownDuration = 10 * 1000; // 10 giây
      const lock1Minute = 1 * 60 * 1000; // 1 phút
      const lock2Minutes = 2 * 60 * 1000; // 2 phút
      const ipAddress =
        req.ip ||
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress ||
        "0.0.0.0";

      // ✅ Lấy token hiện tại nếu có
      let existingToken = await UserToken.findOne({
        where: { email, type: "passwordReset" },
        order: [["createdAt", "DESC"]],
      });

      // ✅ Nếu token đang bị khóa, không cho gửi lại
      if (
        existingToken &&
        existingToken.lockedUntil &&
        existingToken.lockedUntil > nowUtc
      ) {
        const remainingLock = Math.ceil(
          (existingToken.lockedUntil - nowUtc) / 1000
        );
        return res.status(429).json({
          message: `Tài khoản đang bị khóa. Vui lòng thử lại sau ${remainingLock} giây.`,
        });
      }

      // ✅ Kiểm tra cooldown
      if (existingToken && existingToken.lastSentAt) {
        const timeSinceLastSend = nowUtc - new Date(existingToken.lastSentAt);
        if (timeSinceLastSend < cooldownDuration) {
          return res.status(429).json({
            message: `Vui lòng chờ ${Math.ceil(
              (cooldownDuration - timeSinceLastSend) / 1000
            )} giây để gửi lại.`,
            resendCooldown: cooldownDuration - timeSinceLastSend,
          });
        }
      }

      // ✅ Nếu token đã được sử dụng, tạo lại token mới
      if (existingToken && existingToken.usedAt) {
        await existingToken.destroy();
      }

      // ✅ Xóa tất cả token cũ
      await UserToken.destroy({
        where: { email, type: "passwordReset" },
      });

      // ✅ Tạo token mới
      const token = jwt.sign({ id: user.id, email }, JWT_SECRET, {
        expiresIn: "30m",
      });

      // ✅ Tính số lần gửi và xác định khóa
      let sendCount = existingToken ? existingToken.sendCount + 1 : 1;
      let lockedUntil = null;

      // ✅ Quy tắc khóa tự động
      if (sendCount >= 5 && sendCount < 7) {
        lockedUntil = new Date(nowUtc.getTime() + lock1Minute); // Khóa 1 phút
      } else if (sendCount >= 7) {
        lockedUntil = new Date(nowUtc.getTime() + lock2Minutes); // Khóa 2 phút
      }

      // ✅ Lưu token mới vào database
      await UserToken.create({
        userId: user.id,
        email,
        token,
        type: "passwordReset",
        sendCount: sendCount,
        lastSentAt: nowUtc, // ✅ Lưu lại thời gian gửi cuối
        expiresAt: new Date(nowUtc.getTime() + tokenExpiry),
        ipAddress,
        lockedUntil,
        usedAt: null,
      });

      const resetLink = `${BASE_URL}/dat-lai-mat-khau?token=${token}`;
      await sendEmail(
        email,
        "Đặt lại mật khẩu",
        `
            <div>
                <h2>Đặt lại mật khẩu</h2>
                <p>Nhấn vào link dưới đây để đặt lại mật khẩu của bạn:</p>
                <a href="${resetLink}">Đặt lại mật khẩu</a>
                <p>Link này sẽ hết hạn sau 30 phút.</p>
            </div>
            `
      );

      res.status(200).json({
        message: "Đã gửi liên kết đặt lại mật khẩu qua email!",
        resendCooldown: cooldownDuration,
      });
    } catch (err) {
      console.error("Lỗi đặt lại mật khẩu:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async getResetCooldown(req, res) {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ message: "Thiếu email." });
      }

      const now = new Date();
      const cooldownDuration = 10 * 1000; // 10 giây cooldown

      const userToken = await UserToken.findOne({
        where: { email, type: "passwordReset" },
        order: [["createdAt", "DESC"]],
      });

      if (!userToken) {
        return res.status(200).json({ lockTime: 0, resendCooldown: 0 });
      }

      // ✅ Kiểm tra lockedUntil (nếu tồn tại)
      const lockTime =
        userToken.lockedUntil && userToken.lockedUntil > now
          ? userToken.lockedUntil - now
          : 0;

      // ✅ Kiểm tra cooldown dựa trên lastSentAt
      const timeSinceLastSend =
        now - new Date(userToken.lastSentAt || userToken.createdAt);
      const resendCooldown =
        timeSinceLastSend < cooldownDuration
          ? cooldownDuration - timeSinceLastSend
          : 0;

      res.status(200).json({
        lockTime,
        resendCooldown,
      });
    } catch (err) {
      console.error("Lỗi lấy trạng thái cooldown:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async checkResetStatus(req, res) {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ message: "Thiếu email." });
      }

      const now = new Date();
      const userToken = await UserToken.findOne({
        where: { email, type: "passwordReset" },
        order: [["createdAt", "DESC"]],
      });

      // ✅ Không có yêu cầu đặt lại mật khẩu nào
      if (!userToken) {
        return res.status(200).json({
          verified: false,
          lockTime: 0,
          resendCooldown: 0,
          message: "Không có yêu cầu đặt lại mật khẩu đang chờ xử lý.",
        });
      }

      // ✅ Nếu token đã được sử dụng (đã đặt lại mật khẩu)
      if (userToken.usedAt) {
        return res.status(200).json({
          verified: true,
          lockTime: 0,
          resendCooldown: 0,
          message: "Mật khẩu đã được đặt lại. Vui lòng đăng nhập.",
        });
      }

      // ✅ Tính thời gian khóa và cooldown
      const lockTime =
        userToken.lockedUntil && userToken.lockedUntil > now
          ? userToken.lockedUntil - now
          : 0;

      const cooldownDuration = 10 * 1000; // 10 giây cooldown
      const timeSinceLastSend =
        now - new Date(userToken.lastSentAt || userToken.createdAt);
      const resendCooldown =
        timeSinceLastSend < cooldownDuration
          ? cooldownDuration - timeSinceLastSend
          : 0;

      res.status(200).json({
        verified: false,
        lockTime,
        resendCooldown,
        message: "Yêu cầu đặt lại mật khẩu đang chờ xử lý.",
      });
    } catch (err) {
      console.error("❌ Lỗi kiểm tra trạng thái:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async verifyResetToken(req, res) {
    try {
      const { token } = req.query;

      if (!token) {
        return res
          .status(400)
          .json({ verified: false, message: "Thiếu token!" });
      }

      const userToken = await UserToken.findOne({
        where: { token, type: "passwordReset" },
      });

      if (!userToken) {
        return res.status(400).json({
          verified: false,
          message: "Liên kết không tồn tại hoặc đã hết hạn.",
        });
      }

      const now = new Date();

      // ✅ Nếu token đã được sử dụng
      if (userToken.usedAt) {
        return res.status(400).json({
          verified: false,
          message: "Liên kết đã được sử dụng. Vui lòng yêu cầu lại.",
        });
      }

      // ✅ Nếu token đã hết hạn
      if (userToken.expiresAt && userToken.expiresAt < now) {
        await userToken.destroy();
        return res.status(400).json({
          verified: false,
          message: "Liên kết đã hết hạn. Vui lòng yêu cầu lại.",
        });
      }

      // ✅ Giải mã token
      let decoded;
      try {
        decoded = jwt.verify(token.trim(), JWT_SECRET);
      } catch (err) {
        return res.status(400).json({
          verified: false,
          message: "Liên kết không hợp lệ hoặc đã bị thay đổi.",
        });
      }

      // ✅ Không đánh dấu `usedAt` tại đây, chỉ kiểm tra token hợp lệ
      res.status(200).json({
        verified: true,
        message: "Liên kết hợp lệ. Bạn có thể đặt lại mật khẩu.",
      });
    } catch (err) {
      console.error("❌ Lỗi xác thực token:", err);
      res.status(500).json({ verified: false, message: "Lỗi server!" });
    }
  }

  static async resendForgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Thiếu email." });
      }

      const now = new Date();
      const cooldownDuration = 10 * 1000; // 10 giây
      const tokenExpiry = 30 * 60 * 1000; // 30 phút
      const lock1Minute = 1 * 60 * 1000;
      const lock2Minutes = 2 * 60 * 1000;

      let userToken = await UserToken.findOne({
        where: { email, type: "passwordReset" },
        order: [["createdAt", "DESC"]],
      });

      // ✅ Nếu token đã được sử dụng (người dùng đã đặt lại mật khẩu)
      if (userToken && userToken.usedAt) {
        return res.status(400).json({
          message: "Mật khẩu đã được đặt lại. Vui lòng đăng nhập.",
        });
      }

      // ✅ Nếu không có token hoặc token đã hết hạn
      if (!userToken || (userToken.expiresAt && userToken.expiresAt < now)) {
        const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "30m" });
        await UserToken.create({
          email,
          token,
          type: "passwordReset",
          sendCount: 1,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + tokenExpiry),
          usedAt: null,
          lockedUntil: null,
        });

        return res.status(200).json({
          message: "Đã gửi lại liên kết đặt lại mật khẩu qua email!",
        });
      }

      // ✅ Kiểm tra trạng thái khóa
      if (userToken.lockedUntil && now < new Date(userToken.lockedUntil)) {
        const remainingLock = Math.ceil(
          (new Date(userToken.lockedUntil) - now) / 1000
        );
        return res.status(429).json({
          message: `Tài khoản đang bị khóa. Vui lòng thử lại sau ${remainingLock} giây.`,
        });
      }

      // ✅ Đếm số lần gửi lại
      const timeSinceLastSend =
        now - new Date(userToken.lastSentAt || userToken.createdAt);
      if (timeSinceLastSend < cooldownDuration) {
        return res.status(429).json({
          message: `❌ Vui lòng chờ ${Math.ceil(
            (cooldownDuration - timeSinceLastSend) / 1000
          )} giây để gửi lại.`,
          resendCooldown: cooldownDuration - timeSinceLastSend,
        });
      }

      // ✅ Tăng sendCount và cập nhật lastSentAt
      userToken.sendCount += 1;
      userToken.lastSentAt = now;

      // ✅ Quy tắc khóa tự động dựa trên sendCount
      if (userToken.sendCount >= 5 && userToken.sendCount < 7) {
        userToken.lockedUntil = new Date(now.getTime() + lock1Minute);
      } else if (userToken.sendCount >= 7) {
        userToken.lockedUntil = new Date(now.getTime() + lock2Minutes);
      }

      await userToken.save();

      // ✅ Gửi lại liên kết đặt lại mật khẩu
      const resetLink = `${BASE_URL}/dat-lai-mat-khau?token=${userToken.token}`;
      await sendEmail(
        email,
        "Đặt lại mật khẩu",
        `
            <div>
                <h2>Đặt lại mật khẩu</h2>
                <p>Nhấn vào link dưới đây để đặt lại mật khẩu của bạn:</p>
                <a href="${resetLink}">Đặt lại mật khẩu</a>
                <p>Link này sẽ hết hạn sau 30 phút.</p>
            </div>
        `
      );

      res.status(200).json({
        message: "Đã gửi lại liên kết đặt lại mật khẩu qua email!",
      });
    } catch (err) {
      console.error("Lỗi gửi lại link đặt lại mật khẩu:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res
          .status(400)
          .json({ message: "Thiếu token hoặc mật khẩu mới!" });
      }

      // ✅ Tìm token chưa sử dụng
      const userToken = await UserToken.findOne({
        where: { token: token.trim(), type: "passwordReset", usedAt: null }, // ✅ Chỉ lấy token chưa sử dụng
      });

      if (!userToken) {
        return res.status(400).json({
          message: "Token không tồn tại, đã hết hạn hoặc đã được sử dụng.",
        });
      }

      const now = new Date();

      // ✅ Kiểm tra thời gian hết hạn
      if (userToken.expiresAt && userToken.expiresAt < now) {
        await userToken.destroy();
        return res.status(400).json({ message: "Token đã hết hạn." });
      }

      // ✅ Giải mã token
      let decoded;
      try {
        decoded = jwt.verify(token.trim(), JWT_SECRET);
      } catch (err) {
        await userToken.destroy();
        return res
          .status(400)
          .json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
      }

      // ✅ Tìm user theo ID
      const user = await User.findByPk(decoded.id);
      if (!user) {
        return res.status(404).json({ message: "Người dùng không tồn tại!" });
      }

      // ✅ Cập nhật mật khẩu (Không hash lại nếu đã hash trong Model)
      user.password = newPassword; // 🚀 Đặt trực tiếp, Model sẽ tự hash
      await user.save();

      // ✅ Đánh dấu token đã sử dụng
      await userToken.update({
        usedAt: now,
      });

      // ✅ Xóa tất cả token cũ khác để tránh sử dụng lại
      await UserToken.destroy({
        where: {
          userId: user.id,
          type: "passwordReset",
          usedAt: null, // ✅ Xóa các token chưa được sử dụng
        },
      });

      res
        .status(200)
        .json({ message: "Đặt lại mật khẩu thành công! Vui lòng đăng nhập." });
    } catch (err) {
      console.error("❌ Lỗi đặt lại mật khẩu:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async getUserInfo(req, res) {
    try {
      const token = req.headers.authorization?.split(" ")[1];

      if (!token) {
        return res.status(401).json({ message: "Không có token xác thực!" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findByPk(decoded.id, {
        attributes: [
          "id",
          "fullName",
          "email",
          "roleId",
          "phone",
          "gender",
          "dateOfBirth",
          "avatarUrl",
        ],
      });

      if (!user) {
        return res.status(404).json({ message: "Người dùng không tồn tại!" });
      }

      const userResponse = user.toJSON();

      if (userResponse.dateOfBirth) {
        const [year, month, day] = userResponse.dateOfBirth.split("-");
        userResponse.birthDate = {
          day: day || "",
          month: month || "",
          year: year || "",
        };
      } else {
        userResponse.birthDate = { day: "", month: "", year: "" };
      }

      delete userResponse.dateOfBirth;

      res.status(200).json({ user: userResponse });
    } catch (err) {
      console.error("Lỗi khi lấy thông tin người dùng:", err.name, err.message);
      if (
        err.name === "JsonWebTokenError" ||
        err.name === "TokenExpiredError"
      ) {
        return res
          .status(401)
          .json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
      }

      res.status(500).json({
        message: "Đã xảy ra lỗi máy chủ khi cố gắng lấy thông tin người dùng.",
      });
    }
  }

  static async updateProfile(req, res) {

    let tempAvatarPath = null;

    try {
      const userId = req.user ? req.user.id : null;
      if (!userId) {
        console.error("Lỗi: Không tìm thấy userId trong req.user");
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (e) {
            console.error("Lỗi xóa file tạm (no user):", e);
          }
        }
        return res
          .status(401)
          .json({ message: "Xác thực thất bại, không tìm thấy người dùng." });
      }


      const { fullName, phone, gender, birthDate: birthDateString } = req.body;

      const user = await User.findByPk(userId);
      if (!user) {
      
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (e) {
            console.error("Lỗi xóa file tạm (user not found):", e);
          }
        }
        return res.status(404).json({ message: "Người dùng không tồn tại!" });
      }
     

      let newAvatarUrl = null;
      let oldAvatarPublicId = user.avatarPublicId || null;

      if (req.file) {
      
        tempAvatarPath = req.file.path;
       

        try {
        
          const uploadResult = await uploadImage(
            tempAvatarPath,
            "user_avatars"
          ); 
       

          if (uploadResult && uploadResult.url) {
            newAvatarUrl = uploadResult.url;
            tempAvatarPath = null;
          } else {
            console.error(
              "Lỗi: uploadImage không trả về URL. Kết quả:",
              uploadResult
            );

            if (tempAvatarPath && fs.existsSync(tempAvatarPath)) {
              try {
                fs.unlinkSync(tempAvatarPath);
              } catch (e) {
                console.error("Lỗi xóa file tạm (no URL from Cloudinary):", e);
              }
            }
            return res.status(500).json({
              message: "Lỗi khi tải ảnh lên Cloudinary: Không nhận được URL.",
            });
          }
        } catch (uploadError) {
          console.error(
            "LỖI TRỰC TIẾP TỪ uploadImage:",
            uploadError.message,
            uploadError.stack
          );
          if (tempAvatarPath && fs.existsSync(tempAvatarPath)) {
            try {
              fs.unlinkSync(tempAvatarPath);
            } catch (e) {
              console.error("Lỗi xóa file tạm (uploadError catch):", e);
            }
          }
          return res.status(500).json({
            message:
              "Lỗi khi tải ảnh đại diện lên Cloudinary: " + uploadError.message,
          });
        }
      } else {
        console.log(
          "---- Không có req.file (không có ảnh mới được upload) ----"
        );
      }

      if (fullName !== undefined) user.fullName = fullName;
      if (phone !== undefined) user.phone = phone === "" ? null : phone;
      if (gender !== undefined) user.gender = gender;

      if (birthDateString !== undefined) {
        try {
          const parsed =
            typeof birthDateString === "string"
              ? JSON.parse(birthDateString)
              : birthDateString;

          if (parsed.year && parsed.month && parsed.day) {
            const monthPadded = String(parsed.month).padStart(2, "0");
            const dayPadded = String(parsed.day).padStart(2, "0");
            user.dateOfBirth = `${parsed.year}-${monthPadded}-${dayPadded}`;
          } else {
            user.dateOfBirth = null;
          }
        } catch (e) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(birthDateString)) {
            user.dateOfBirth = birthDateString;
          } else {
            console.warn("Ngày sinh không hợp lệ, không được cập nhật.");
          }
        }
      }

      if (newAvatarUrl) {
        user.avatarUrl = newAvatarUrl;
      }

      await user.save();

      const userResponseData = {};

      if (user.dateOfBirth) {
        const [year, month, day] = user.dateOfBirth.split("-");
        userResponseData.birthDate = {
          day: day || "",
          month: month || "",
          year: year || "",
        };
      } else {
        userResponseData.birthDate = { day: "", month: "", year: "" };
      }
      userResponseData.id = user.id;
      userResponseData.fullName = user.fullName;
      userResponseData.email = user.email;
      userResponseData.roleId = user.roleId;
      userResponseData.phone = user.phone;
      userResponseData.gender = user.gender;
      userResponseData.avatarUrl = user.avatarUrl;

      res.status(200).json({
        message: "Cập nhật hồ sơ thành công!",
        user: userResponseData,
      });
    } catch (error) {
   
      if (tempAvatarPath && fs.existsSync(tempAvatarPath)) {
        try {
          fs.unlinkSync(tempAvatarPath);
          console.log("Đã xóa file tạm (trong catch chung):", tempAvatarPath);
        } catch (unlinkErr) {
          console.error("Lỗi xóa file tạm (trong catch chung):", unlinkErr);
        }
      }
      res.status(500).json({
        message: "Đã xảy ra lỗi máy chủ khi cập nhật hồ sơ. " + error.message,
      });
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
      const providerId = payload.sub;
      const email = payload.email;
      const name = payload.name || email.split("@")[0];
      const avatar = payload.picture;

      let user = await User.findOne({
        where: {
          provider: "google",
          providerId,
        },
      });

      if (!user) {
        user = await User.findOne({ where: { email } });

        if (user) {
          await user.update({
            provider: "google",
            providerId,
          });
        } else {
          user = await User.create({
            fullName: name,
            email,
            provider: "google",
            providerId,
            password: null,
            roleId: 2,
            status: 1,
            isVerified: 1,
          });
        }
      }

      const accessToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          roleId: user.roleId,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.cookie("token", accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000,
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
      console.error("Lỗi Google Login:", err);
      return res.status(401).json({ message: "Token không hợp lệ" });
    }
  }

  static async facebookLogin(req, res) {
    try {
      const { accessToken, userID } = req.body;
      if (!accessToken || !userID)
        return res
          .status(400)
          .json({ message: "Thiếu accessToken hoặc userID" });

      const fbRes = await axios.get(
        `https://graph.facebook.com/v18.0/${userID}?fields=id,name,email,picture&access_token=${accessToken}`
      );

      const { id: providerId, name, email, picture } = fbRes.data;
      if (!email)
        return res
          .status(400)
          .json({ message: "Không lấy được email từ Facebook" });

      let user = await User.findOne({
        where: { provider: "facebook", providerId },
      });

      if (!user) {
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
      console.error("Facebook Login Error:", err);
      return res.status(401).json({ message: "Đăng nhập Facebook thất bại!" });
    }
  }

  static async logout(req, res) {
    try {
      res.clearCookie("token", {
        httpOnly: true,
        secure: true,
        sameSite: "None",
      });
      res.status(200).json({ message: "Đăng xuất thành công!" });
    } catch (err) {
      console.error("Lỗi đăng xuất:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }
}

module.exports = AuthController;
