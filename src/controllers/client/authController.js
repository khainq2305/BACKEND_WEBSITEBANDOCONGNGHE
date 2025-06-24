// src/controllers/client/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");

const sendEmail = require("../../utils/sendEmail");
const { User, Role, UserRole, UserToken } = require("../../models");

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
        { fullName: fullName.trim(), email, password },
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

      const cooldownDuration = 60 * 1000;
      const lock1Minute = 3 * 60 * 1000;
      const lock2Minutes = 5 * 60 * 1000;

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

      const cooldownDuration = 60 * 1000;

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
        const newUser = await User.create({
          fullName: fullName.trim(),
          email,
          password,
          isEmailVerified: true,
        });

        await UserRole.create({
          userId: newUser.id,
          roleId: 2, // Gán quyền "user"
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
      // const cooldownDuration = 10 * 1000; 10s
      const cooldownDuration = 60 * 1000; //60s

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

      await user.update({ lastLoginAt: new Date() });

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
          lastLoginAt: user.lastLoginAt,
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
      const tokenExpiry = 30 * 60 * 1000;
      const cooldownDuration = 60 * 1000;

      const lock1Minute = 1 * 60 * 1000;
      const lock2Minutes = 2 * 60 * 1000;
      const ipAddress =
        req.ip ||
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress ||
        "0.0.0.0";

      let existingToken = await UserToken.findOne({
        where: { email, type: "passwordReset" },
        order: [["createdAt", "DESC"]],
      });

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

      if (existingToken && existingToken.usedAt) {
        await existingToken.destroy();
      }

      await UserToken.destroy({
        where: { email, type: "passwordReset" },
      });

      const token = jwt.sign({ id: user.id, email }, JWT_SECRET, {
        expiresIn: "30m",
      });

      let sendCount = existingToken ? existingToken.sendCount + 1 : 1;
      let lockedUntil = null;

      if (sendCount >= 5 && sendCount < 7) {
        lockedUntil = new Date(nowUtc.getTime() + lock1Minute);
      } else if (sendCount >= 7) {
        lockedUntil = new Date(nowUtc.getTime() + lock2Minutes);
      }

      await UserToken.create({
        userId: user.id,
        email,
        token,
        type: "passwordReset",
        sendCount: sendCount,
        lastSentAt: nowUtc,
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
      const cooldownDuration = 60 * 1000;

      const userToken = await UserToken.findOne({
        where: { email, type: "passwordReset" },
        order: [["createdAt", "DESC"]],
      });

      if (!userToken) {
        return res.status(200).json({ lockTime: 0, resendCooldown: 0 });
      }

      const lockTime =
        userToken.lockedUntil && userToken.lockedUntil > now
          ? userToken.lockedUntil - now
          : 0;

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

      if (!userToken) {
        return res.status(200).json({
          verified: false,
          lockTime: 0,
          resendCooldown: 0,
          message: "Không có yêu cầu đặt lại mật khẩu đang chờ xử lý.",
        });
      }

      if (userToken.usedAt) {
        return res.status(200).json({
          verified: true,
          lockTime: 0,
          resendCooldown: 0,
          message: "Mật khẩu đã được đặt lại. Vui lòng đăng nhập.",
        });
      }

      const lockTime =
        userToken.lockedUntil && userToken.lockedUntil > now
          ? userToken.lockedUntil - now
          : 0;

      const cooldownDuration = 60 * 1000;

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
      console.error("Lỗi kiểm tra trạng thái:", err);
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

      if (userToken.usedAt) {
        return res.status(400).json({
          verified: false,
          message: "Liên kết đã được sử dụng. Vui lòng yêu cầu lại.",
        });
      }

      if (userToken.expiresAt && userToken.expiresAt < now) {
        await userToken.destroy();
        return res.status(400).json({
          verified: false,
          message: "Liên kết đã hết hạn. Vui lòng yêu cầu lại.",
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(token.trim(), JWT_SECRET);
      } catch (err) {
        return res.status(400).json({
          verified: false,
          message: "Liên kết không hợp lệ hoặc đã bị thay đổi.",
        });
      }

      res.status(200).json({
        verified: true,
        message: "Liên kết hợp lệ. Bạn có thể đặt lại mật khẩu.",
      });
    } catch (err) {
      console.error("Lỗi xác thực token:", err);
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
      const cooldownDuration = 60 * 1000;

      const tokenExpiry = 30 * 60 * 1000;
      const lock1Minute = 1 * 60 * 1000;
      const lock2Minutes = 2 * 60 * 1000;

      let userToken = await UserToken.findOne({
        where: { email, type: "passwordReset" },
        order: [["createdAt", "DESC"]],
      });
      if (userToken && userToken.usedAt) {
        return res.status(400).json({
          message: "Mật khẩu đã được đặt lại. Vui lòng đăng nhập.",
        });
      }
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

      if (userToken.lockedUntil && now < new Date(userToken.lockedUntil)) {
        const remainingLock = Math.ceil(
          (new Date(userToken.lockedUntil) - now) / 1000
        );
        return res.status(429).json({
          message: `Tài khoản đang bị khóa. Vui lòng thử lại sau ${remainingLock} giây.`,
        });
      }

      const timeSinceLastSend =
        now - new Date(userToken.lastSentAt || userToken.createdAt);
      if (timeSinceLastSend < cooldownDuration) {
        return res.status(429).json({
          message: `Vui lòng chờ ${Math.ceil(
            (cooldownDuration - timeSinceLastSend) / 1000
          )} giây để gửi lại.`,
          resendCooldown: cooldownDuration - timeSinceLastSend,
        });
      }
      userToken.sendCount += 1;
      userToken.lastSentAt = now;
      if (userToken.sendCount >= 5 && userToken.sendCount < 7) {
        userToken.lockedUntil = new Date(now.getTime() + lock1Minute);
      } else if (userToken.sendCount >= 7) {
        userToken.lockedUntil = new Date(now.getTime() + lock2Minutes);
      }

      await userToken.save();
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
      const userToken = await UserToken.findOne({
        where: { token: token.trim(), type: "passwordReset", usedAt: null },
      });

      if (!userToken) {
        return res.status(400).json({
          message: "Token không tồn tại, đã hết hạn hoặc đã được sử dụng.",
        });
      }

      const now = new Date();

      if (userToken.expiresAt && userToken.expiresAt < now) {
        await userToken.destroy();
        return res.status(400).json({ message: "Token đã hết hạn." });
      }
      let decoded;
      try {
        decoded = jwt.verify(token.trim(), JWT_SECRET);
      } catch (err) {
        await userToken.destroy();
        return res
          .status(400)
          .json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
      }
      const user = await User.findByPk(decoded.id);
      if (!user) {
        return res.status(404).json({ message: "Người dùng không tồn tại!" });
      }
      user.password = newPassword;
      await user.save();
      await userToken.update({
        usedAt: now,
      });

      await UserToken.destroy({
        where: {
          userId: user.id,
          type: "passwordReset",
          usedAt: null,
        },
      });

      res
        .status(200)
        .json({ message: "Đặt lại mật khẩu thành công! Vui lòng đăng nhập." });
    } catch (err) {
      console.error("Lỗi đặt lại mật khẩu:", err);
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
          "phone",
          "gender",
          "dateOfBirth",
          "avatarUrl",
          "password",
          "provider",
        ],
        include: [
          {
            model: UserToken,
            as: "UserTokens",

            where: { type: "lock" },
            required: false,
            limit: 1,
            order: [["createdAt", "DESC"]],
            attributes: ["lockedUntil"],
          },
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
      userResponse.hasPassword = !!userResponse.password;
      delete userResponse.password;
      delete userResponse.dateOfBirth;
      userResponse.lockedUntil = userResponse.tokens?.[0]?.lockedUntil || null;
      delete userResponse.tokens;

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
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Xác thực thất bại!" });
      }

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: "Người dùng không tồn tại!" });
      }

      const { fullName, phone, gender, birthDate: birthDateString } = req.body;

      if (req.file && req.file.path) {
        user.avatarUrl = req.file.path;
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
          }
        }
      }

      await user.save();

      const [year, month, day] = (user.dateOfBirth || "").split("-");
      res.status(200).json({
        message: "Cập nhật hồ sơ thành công!",
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          roleId: user.roleId,
          phone: user.phone,
          gender: user.gender,
          avatarUrl: user.avatarUrl,
          birthDate: { year: year || "", month: month || "", day: day || "" },
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Lỗi máy chủ: " + error.message });
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
  static async changePassword(req, res) {
    try {
      const { id } = req.user;
      const { currentPassword, newPassword } = req.body;

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
      if (!newPassword || !passwordRegex.test(newPassword)) {
        return res.status(400).json({
          message:
            "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.",
        });
      }

      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).json({ message: "Người dùng không tồn tại" });
      }

      const attempt = await UserToken.findOne({
        where: { userId: id, type: "changePasswordAttempt" },
        order: [["createdAt", "DESC"]],
      });

      if (attempt?.lockedUntil && new Date() < new Date(attempt.lockedUntil)) {
        const remaining = Math.ceil(
          (new Date(attempt.lockedUntil) - new Date()) / 1000
        );
        return res.status(429).json({
          message: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${remaining} giây.`,
        });
      }

      if (user.password) {
        if (!currentPassword) {
          return res
            .status(400)
            .json({ message: "Vui lòng nhập mật khẩu hiện tại" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
          if (attempt) {
            attempt.sendCount += 1;
            if (attempt.sendCount >= 5) {
              attempt.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
            }
            await attempt.save();
          } else {
            await UserToken.create({
              userId: id,
              email: user.email,
              type: "changePasswordAttempt",
              sendCount: 1,
              lastSentAt: new Date(),
              expiresAt: new Date(Date.now() + 10 * 60 * 1000),
              ipAddress: req.ip || "unknown",
              lockedUntil: null,
              usedAt: null,
            });
          }
          return res
            .status(400)
            .json({ message: "Mật khẩu hiện tại không đúng" });
        }
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
          return res
            .status(400)
            .json({
              message: "Mật khẩu mới không được trùng với mật khẩu cũ.",
            });
        }
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      await user.save();
      await UserToken.destroy({
        where: { userId: id, type: "changePasswordAttempt" },
      });

      return res.json({
        message: user.password
          ? "Đổi mật khẩu thành công"
          : "Thiết lập mật khẩu thành công",
      });
    } catch (error) {
      console.error("Lỗi đổi mật khẩu:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server. Vui lòng thử lại sau." });
    }
  }
}

module.exports = AuthController;
