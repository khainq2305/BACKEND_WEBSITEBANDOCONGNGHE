// src/controllers/client/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const sendEmail = require("../../utils/sendEmail");
const {
  User,
  Role,
  UserRole,
  UserToken,
  RolePermission,
  Action,
  Subject,
} = require("../../models");

const JWT_SECRET = process.env.JWT_SECRET || "your_secret";
const BASE_URL = process.env.BASE_URL || "http://localhost:9999";

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
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 20px auto; background-color: #fff; border-radius: 10px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); overflow: hidden;">
          <!-- Header của Email -->
          <div style="background-color: #E6F0F6; padding: 30px 20px; text-align: center; border-bottom: 1px solid #D6E0E6;">
            <!-- Bạn có thể đặt logo của công ty ở đây. Ví dụ: -->
        
            <h1 style="margin: 0; font-size: 26px; font-weight: 600; color: #4A90E2;">Xác Thực Địa Chỉ Email</h1>
          </div>

          <!-- Nội dung chính của Email -->
          <div style="padding: 30px; text-align: left;">
            <p style="font-size: 17px; margin-bottom: 20px;">Chào <strong>${fullName.trim()}</strong>,</p>
            <p style="font-size: 17px; margin-bottom: 25px;">Cảm ơn bạn đã đăng ký tài khoản! Để hoàn tất quá trình và bắt đầu sử dụng dịch vụ của chúng tôi, vui lòng nhấp vào nút bên dưới để xác thực địa chỉ email của bạn:</p>

            <!-- Nút Call to Action (Xác Thực) -->
            <div style="text-align: center; margin: 35px 0;">
              <a href="${verificationLink}" target="_blank" style="background-color: #007BFF; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                Xác Thực Tài Khoản Ngay
              </a>
            </div>

            <p style="font-size: 16px; color: #666; margin-top: 25px;">Liên kết này sẽ hết hạn sau <strong>30 phút</strong>.</p>
            <p style="font-size: 15px; color: #888; margin-top: 20px;">Nếu bạn không yêu cầu tạo tài khoản này, vui lòng bỏ qua email này một cách an toàn.</p>
          </div>

          <!-- Footer của Email -->
          <div style="background-color: #F8F8F8; padding: 25px 30px; text-align: center; border-top: 1px solid #EEE;">
            <p style="font-size: 14px; color: #777; margin: 0;">&copy; ${new Date().getFullYear()} Homepowear. Mọi quyền được bảo lưu.</p>
            <p style="font-size: 14px; color: #777; margin: 8px 0 0;">Cần hỗ trợ? <a href="mailto:support@example.com" style="color: #007BFF; text-decoration: none;">Liên hệ với chúng tôi</a>.</p>
          </div>
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
      const lock1Minute = 10 * 60 * 1000;
      const lock2Minutes = 30 * 60 * 1000;

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
      const emailHtmlContent = `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:20px auto;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.05);overflow:hidden">
        <div style="background:#E6F0F6;padding:30px 20px;text-align:center;border-bottom:1px solid #D6E0E6">
          <!-- <img src="https://cdn.homepowear.vn/logo.svg" alt="Homepowear" style="max-width:150px;margin:0 auto 15px;display:block"> -->
          <h1 style="margin:0;font-size:26px;font-weight:600;color:#4A90E2">Xác Thực Địa Chỉ Email</h1>
        </div>

        <div style="padding:30px;text-align:left">
          <p style="font-size:17px;margin-bottom:20px">Chào <strong>${fullName.trim()}</strong>,</p>
          <p style="font-size:17px;margin-bottom:25px">Bạn vừa yêu cầu gửi lại link xác thực. Vui lòng nhấp nút bên dưới để hoàn tất:</p>
          <div style="text-align:center;margin:35px 0">
            <a href="${verificationLink}" target="_blank" style="background:#007BFF;color:#fff;padding:15px 30px;text-decoration:none;border-radius:8px;font-size:18px;font-weight:bold;display:inline-block;box-shadow:0 4px 10px rgba(0,0,0,.1)">Xác Thực Tài Khoản Ngay</a>
          </div>
          <p style="font-size:16px;color:#666;margin-top:25px">Liên kết này sẽ hết hạn sau <strong>30&nbsp;phút</strong>.</p>
          <p style="font-size:15px;color:#888;margin-top:20px">Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email.</p>
        </div>

        <div style="background:#F8F8F8;padding:25px 30px;text-align:center;border-top:1px solid #EEE">
          <p style="font-size:14px;color:#777;margin:0">&copy; ${new Date().getFullYear()} Homepowear. Mọi quyền được bảo lưu.</p>
          <p style="font-size:14px;color:#777;margin:8px 0 0">Cần hỗ trợ? <a href="mailto:support@example.com" style="color:#007BFF;text-decoration:none">Liên hệ với chúng tôi</a>.</p>
        </div>
      </div>
    `;

      await sendEmail(email, "Xác thực tài khoản của bạn", emailHtmlContent);

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
          roleId: 2,
        });
      }

      await sendEmail(
        email,
        "Chào mừng đến với Homepower! Tài khoản của bạn đã sẵn sàng.",
        `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chào mừng bạn đến với Homepower!</title>
    <style>
      /* Reset CSS để tương thích tốt hơn */
      body, div, p, a, li, td {
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        margin: 0;
        padding: 0;
      }
      table, td {
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
        border-collapse: collapse;
      }
      img {
        -ms-interpolation-mode: bicubic;
        border: 0;
        outline: none;
        text-decoration: none;
      }
      a[x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: none !important;
        font-size: inherit !important;
        font-family: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
      }
      /* Các kiểu dáng cơ bản */
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        line-height: 1.6;
        color: #333333;
        background-color: #f4f7fa;
        margin: 0;
        padding: 0;
      }
      .wrapper {
        background-color: #f4f7fa;
        padding: 20px 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        border-radius: 10px; /* Bo tròn góc hơn */
        overflow: hidden;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08); /* Đổ bóng sâu hơn */
      }
      .header {
        background-color: #007bff; /* Màu chủ đạo của bạn */
        color: #ffffff;
        padding: 35px 30px 25px; /* Điều chỉnh padding */
        text-align: center;
        border-top-left-radius: 10px;
        border-top-right-radius: 10px;
        position: relative;
        overflow: hidden; /* Để xử lý gradient hoặc pattern nếu có */
      }
      .header h1 {
        margin: 0;
        font-size: 30px; /* Lớn hơn một chút */
        font-weight: 700;
        line-height: 1.2;
      }
      .header p {
        font-size: 16px;
        margin-top: 10px;
        opacity: 0.9;
      }
      .content {
        padding: 30px;
      }
      .content p {
        margin-bottom: 18px; /* Khoảng cách giữa các đoạn văn */
        font-size: 16px;
        line-height: 1.7;
        color: #444444; /* Màu chữ dịu hơn */
      }
      .button-container {
        text-align: center;
        margin-top: 30px;
        margin-bottom: 30px;
      }
      .button {
        display: inline-block;
        background-color: #28a745; /* Màu nút gọi hành động */
        color: #ffffff;
        padding: 14px 30px; /* Nút lớn hơn */
        border-radius: 30px; /* Bo tròn hoàn toàn */
        text-decoration: none;
        font-weight: bold;
        font-size: 18px;
        transition: background-color 0.3s ease;
        box-shadow: 0 4px 10px rgba(40, 167, 69, 0.3); /* Bóng cho nút */
      }
      .button:hover {
        background-color: #218838;
      }
      .section-title {
        font-size: 20px;
        font-weight: 600;
        color: #007bff;
        margin-bottom: 20px;
        text-align: center;
        border-bottom: 1px solid #eee;
        padding-bottom: 10px;
      }
      .feature-list {
        list-style: none;
        padding: 0;
        margin: 0 0 20px 0;
      }
      .feature-list li {
        margin-bottom: 10px;
        font-size: 15px;
        color: #555555;
      }
      .feature-list li span {
        color: #007bff;
        font-weight: bold;
        margin-right: 8px;
      }
      .footer {
        background-color: #f0f0f0;
        padding: 25px 30px;
        text-align: center;
        font-size: 13px;
        color: #777777;
        border-bottom-left-radius: 10px;
        border-bottom-right-radius: 10px;
      }
      .footer a {
        color: #007bff;
        text-decoration: none;
      }
      .footer a:hover {
        text-decoration: underline;
      }
      .highlight {
        color: #007bff;
        font-weight: 600;
      }
      .greeting {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 20px;
        color: #222222;
      }
      .small-text {
        font-size: 14px;
        color: #555555;
      }
      .logo-placeholder {
        margin-bottom: 20px;
      }
      .social-icon {
        width: 28px;
        height: 28px;
        margin: 0 8px;
      }
      .signature-block {
        margin-top: 30px;
        text-align: left;
        border-top: 1px solid #eee;
        padding-top: 20px;
      }
      @media only screen and (max-width: 600px) {
        .container {
          width: 100% !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .wrapper {
          padding: 0 !important;
        }
        .header, .content, .footer {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }
        .header {
            border-radius: 0 !important;
        }
        .footer {
            border-radius: 0 !important;
        }
        .button {
          padding: 12px 20px !important;
          font-size: 16px !important;
        }
        .header h1 {
            font-size: 26px !important;
        }
        .content p, .feature-list li {
            font-size: 15px !important;
        }
        .greeting {
            font-size: 17px !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <div class="header">
          <img src="[URL_TO_YOUR_LOGO]" alt="Homepower Logo" style="max-width: 160px; margin-bottom: 18px; display: block; margin-left: auto; margin-right: auto;">
          <h1>Chào mừng ${fullName} đã gia nhập!</h1>
          <p>Tài khoản của bạn đã được kích hoạt thành công.</p>
        </div>
        <div class="content">
          <p class="greeting">Xin chào ${fullName},</p>
          <p>Chúng tôi vô cùng háo hức được chào đón bạn đến với <span class="highlight">Homepower</span>. Hành trình của bạn với chúng tôi đã chính thức bắt đầu!</p>

         

          <p>Với tài khoản mới, bạn đã sẵn sàng để khám phá những điều tuyệt vời:</p>
          <ul class="feature-list">
            <li><span>&#10003;</span> Duyệt qua hàng ngàn sản phẩm/dịch vụ độc đáo.</li>
            <li><span>&#10003;</span> Nhận các ưu đãi và khuyến mãi đặc biệt dành riêng cho thành viên.</li>
            <li><span>&#10003;</span> Quản lý đơn hàng, thông tin cá nhân dễ dàng.</li>
            <li><span>&#10003;</span> Truy cập vào cộng đồng hỗ trợ của chúng tôi (nếu có).</li>
          </ul>

          <p style="text-align: center; font-style: italic; color: #666;">Đừng bỏ lỡ những điều thú vị đang chờ đợi!</p>

          <div class="button-container">
            <a href="[URL_TO_YOUR_WEBSITE_LOGIN_PAGE]" class="button">Bắt đầu khám phá ngay!</a>
          </div>

          <p>Bạn có thể cập nhật hồ sơ của mình để có trải nghiệm cá nhân hóa tốt nhất. Hãy thêm ảnh đại diện và thông tin sở thích để chúng tôi có thể phục vụ bạn tốt hơn!</p>
          <p style="text-align: center; margin-top: 25px;"><a href="[URL_TO_YOUR_PROFILE_PAGE]" style="color: #007bff; text-decoration: none; font-weight: 600;">Cập nhật hồ sơ của bạn</a></p>

          <div class="signature-block">
            <p>Trân trọng,</p>
            <p style="font-weight: 600; color: #007bff;">Đội ngũ Homepower</p>
          </div>
        </div>
        <div class="footer">
          <p>Bạn có câu hỏi? Chúng tôi luôn sẵn lòng trợ giúp!</p>
          <p>Liên hệ hỗ trợ: <a href="mailto:[EMAIL_SUPPORT]" target="_blank">[EMAIL_SUPPORT]</a> | Hotline: <a href="tel:[YOUR_PHONE_NUMBER]" style="color: #007bff; text-decoration: none;">[YOUR_PHONE_NUMBER]</a></p>
          
          <div style="margin-top: 15px;">
            <a href="[URL_TO_FACEBOOK_PAGE]" target="_blank"><img src="[URL_TO_FACEBOOK_ICON]" alt="Facebook" class="social-icon"></a>
            <a href="[URL_TO_TWITTER_PAGE]" target="_blank"><img src="[URL_TO_TWITTER_ICON]" alt="Twitter" class="social-icon"></a>
            <a href="[URL_TO_INSTAGRAM_PAGE]" target="_blank"><img src="[URL_TO_INSTAGRAM_ICON]" alt="Instagram" class="social-icon"></a>
            </div>

          <p style="margin-top: 15px;">&copy; ${new Date().getFullYear()} Homepower. Mọi quyền được bảo lưu.</p>
          <p><a href="[URL_TO_YOUR_WEBSITE]" target="_blank">Website của chúng tôi</a> | <a href="[URL_TO_YOUR_PRIVACY_POLICY]" target="_blank">Chính sách bảo mật</a></p>
        </div>
      </div>
    </div>
  </body>
  </html>
  `
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

      const cooldownDuration = 60 * 1000;

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
      const { email, password, remember } = req.body;

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
        { expiresIn: remember ? "7d" : "1d" }
      );

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

      const lock1Minute = 10 * 60 * 1000;
      const lock2Minutes = 30 * 60 * 1000;
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
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border-radius: 10px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    <h2 style="color: #007bff; text-align: center;">Yêu cầu đặt lại mật khẩu</h2>
    <p style="font-size: 15px; color: #333; text-align: center;">
      Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản của mình.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" target="_blank" style="background-color: #007bff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; display: inline-block;">
        Đặt lại mật khẩu
      </a>
    </div>
    <p style="font-size: 14px; color: #555; text-align: center;">
      Liên kết có hiệu lực trong <strong>30 phút</strong>. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.
    </p>
    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
    <p style="font-size: 13px; color: #999; text-align: center;">
      &copy; ${new Date().getFullYear()} Homepower. Mọi quyền được bảo lưu.
    </p>
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

      let resendCooldown = 0;
      if (lockTime === 0) {
        const COOLDOWN_MS = 60 * 1000;
        const elapsed =
          now - new Date(userToken.lastSentAt || userToken.createdAt);
        resendCooldown = elapsed < COOLDOWN_MS ? COOLDOWN_MS - elapsed : 0;
      }

      return res.status(200).json({
        verified: false,
        lockTime,
        resendCooldown,
        message: "Yêu cầu đặt lại mật khẩu đang chờ xử lý.",
      });
    } catch (err) {
      console.error("Lỗi kiểm tra trạng thái:", err);
      return res.status(500).json({ message: "Lỗi server!" });
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
      const lock1Minute = 10 * 60 * 1000;
      const lock2Minutes = 30 * 60 * 1000;

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
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border-radius: 10px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
    <h2 style="color: #007bff; text-align: center;">Yêu cầu đặt lại mật khẩu</h2>
    <p style="font-size: 15px; color: #333; text-align: center;">
      Bạn vừa yêu cầu gửi lại liên kết đặt lại mật khẩu cho tài khoản của mình.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" target="_blank" style="background-color: #007bff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; display: inline-block;">
        Đặt lại mật khẩu
      </a>
    </div>
    <p style="font-size: 14px; color: #555; text-align: center;">
      Liên kết có hiệu lực trong <strong>30 phút</strong>. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.
    </p>
    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
    <p style="font-size: 13px; color: #999; text-align: center;">
      &copy; ${new Date().getFullYear()} Homepower. Mọi quyền được bảo lưu.
    </p>
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
        return res.status(401).json({ message: "Không có token!" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const user = await User.findByPk(userId, {
        attributes: [
          "id",
          "password",
          "fullName",
          "email",
          "phone",
          "gender",
          "dateOfBirth",
          "avatarUrl",
          "provider",
          "status",
          "lastLoginAt",
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
          {
            model: Role,
            as: "roles",
            attributes: ["id", "name", "description", "canAccess"],
            through: { attributes: [] },
            include: [
              {
                model: RolePermission,
                as: "rolePermissions",
                attributes: ["id", "roleId", "actionId", "subjectId"],
                include: [
                  { model: Action, as: "action", attributes: ["key"] },
                  { model: Subject, as: "subject", attributes: ["key"] },
                ],
              },
            ],
          },
        ],
      });

      if (!user) {
        return res.status(404).json({ message: "Người dùng không tồn tại!" });
      }

      const userJson = user.toJSON();

      if (userJson.dateOfBirth) {
        const [year, month, day] = userJson.dateOfBirth.split("-");
        userJson.birthDate = {
          day: day || "",
          month: month || "",
          year: year || "",
        };
      } else {
        userJson.birthDate = { day: "", month: "", year: "" };
      }
      delete userJson.dateOfBirth;

      userJson.hasPassword = !!userJson.password;
      delete userJson.password;

      userJson.lockedUntil = userJson.UserTokens?.[0]?.lockedUntil || null;
      delete userJson.UserTokens;

      const roles = (userJson.roles || []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        canAccess: r.canAccess,
      }));

      const isAdmin = roles.some((r) => r.id === 1);

      let permissions = [];
      if (isAdmin) {
        permissions = [{ action: "manage", subject: "all" }];
      } else {
        (userJson.roles || []).forEach((role) => {
          (role.rolePermissions || []).forEach((rp) => {
            if (rp.action && rp.subject) {
              permissions.push({
                action: rp.action.key,
                subject: rp.subject.key,
              });
            }
          });
        });
      }

      const userResponse = {
        id: userJson.id,
        email: userJson.email,
        fullName: userJson.fullName,
        phone: userJson.phone,
        gender: userJson.gender,
        avatarUrl: userJson.avatarUrl,
        provider: userJson.provider,
        status: userJson.status,
        lastLoginAt: userJson.lastLoginAt,
        birthDate: userJson.birthDate,
        hasPassword: userJson.hasPassword,
        lockedUntil: userJson.lockedUntil,
        roles,
        permissions,
      };

      return res.status(200).json({ user: userResponse });
    } catch (err) {
      console.error("GetUserInfo error:", err.name, err.message);
      if (
        err.name === "JsonWebTokenError" ||
        err.name === "TokenExpiredError"
      ) {
        return res
          .status(401)
          .json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
      }
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy thông tin user." });
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

          if (parsed?.year && parsed?.month && parsed?.day) {
            const year = String(parsed.year);
            const month = String(parsed.month).padStart(2, "0");
            const day = String(parsed.day).padStart(2, "0");

            const finalDate = `${year}-${month}-${day}`;
            user.dateOfBirth = finalDate;
          } else {
            user.dateOfBirth = null;
          }
        } catch (e) {
          user.dateOfBirth = null;
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

      const { data } = await axios.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const providerId = data.sub;
      const email = data.email;
      const name = data.name || email.split("@")[0];
      const avatar = data.picture;

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

  static async logout(req, res) {
    try {
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
          return res.status(400).json({
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
