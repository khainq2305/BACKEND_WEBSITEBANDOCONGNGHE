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
const cloudinary = require('../../config/cloudinary'); 
const { uploadImage } = require('../../services/common/upload.service'); 
const Sequelize = require('sequelize');

const fs = require('fs'); 
class AuthController {
 
  static async register(req, res) {
    try {
        const { fullName, email, password } = req.body;
        const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress || "0.0.0.0";

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: "Thiếu thông tin đăng ký!" });
        }

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: "Email đã tồn tại!" });
        }

        const now = new Date();
        const tokenExpiry = 30 * 60 * 1000; 

        // ✅ Kiểm tra nếu đã có token xác thực hiện tại (chưa hết hạn)
        const existingToken = await UserToken.findOne({
            where: { email, type: "emailVerification" },
            order: [["createdAt", "DESC"]],
        });

        if (existingToken) {
            // ✅ Kiểm tra nếu token hiện tại chưa hết hạn hoặc chưa sử dụng
            if (existingToken.expiresAt > now && !existingToken.usedAt) {
                return res.status(200).json({ 
                    message: "Đã có link xác thực đang hoạt động. Vui lòng kiểm tra email của bạn.",
                    link: `${BASE_URL}/verify-email?token=${existingToken.token}`
                });
            } else {
                // ✅ Dọn dẹp token cũ nếu hết hạn hoặc đã sử dụng
                await existingToken.destroy();
            }
        }

        // ✅ Tạo token mới
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
        await sendEmail(
            email,
            "Xác thực tài khoản",
            `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #0073e6;">Xác thực tài khoản</h2>
                <p>Chào ${fullName.trim()},</p>
                <p>Vui lòng nhấp vào link dưới đây để xác thực tài khoản của bạn:</p>
                <a href="${verificationLink}" style="background: #0073e6; color: white; padding: 10px 15px; text-decoration: none;">Xác thực tài khoản</a>
                <p>Link này sẽ hết hạn sau 30 phút.</p>
            </div>
        `
        );

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
     
      return res.status(400).json({ message: "Link xác thực không hợp lệ hoặc đã hết hạn." });
    }

    const { email, fullName, password, roleId } = decoded;
   


    if (!email) {
    
      return res.status(400).json({ message: "Token không hợp lệ. Thiếu thông tin email." });
    }

    
    const userToken = await UserToken.findOne({
      where: { email, type: "emailVerification", token },
    });

    if (!userToken) {
      return res.status(400).json({ message: "Link xác thực không hợp lệ hoặc đã hết hạn." });
    }

   
    if (userToken.usedAt) {
      return res.status(400).json({ message: "Link xác thực đã được sử dụng." });
    }


    await userToken.update({ 
      usedAt: new Date(), 
      lockedUntil: null 
    });
    

    
    const existingUser = await User.findOne({ where: { email } });

    
      await User.create({
        fullName: fullName.trim(),
        email,
        password, 
        roleId: roleId || 2,
      });
    
    

  
    await sendEmail(
      email,
      "Đăng ký thành công!",
      `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <div style="background-color: #f4f4f9; padding: 20px; text-align: center;">
            <h2 style="color: #0073e6;">Chào mừng bạn đến với hệ thống!</h2>
            <p>Xin chào <strong>${fullName}</strong>,</p>
            <p>Bạn đã xác thực tài khoản thành công!</p>
          </div>
        </body>
      </html>
    `
    );

   

    res.status(200).json({ message: "Xác thực thành công! Vui lòng đăng nhập." });
  } catch (err) {
   
    res.status(500).json({ message: "Lỗi server!" });
  }
}


 
  static async checkVerificationStatus(req, res) {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: "Thiếu email." });
        }

        // ✅ Kiểm tra UserToken của loại đặt lại mật khẩu
        const userToken = await UserToken.findOne({
            where: { email, type: "passwordReset" },
            order: [["createdAt", "DESC"]],
        });

        // ✅ Nếu không có token nào, coi như chưa yêu cầu đặt lại mật khẩu
        if (!userToken) {
            return res.status(200).json({ verified: false, message: "Không có yêu cầu đặt lại mật khẩu." });
        }

        const now = new Date();

        // ✅ Nếu token đã được sử dụng (usedAt không null)
        if (userToken.usedAt) {
            return res.status(200).json({ verified: true, message: "Tài khoản đã được xác thực." });
        }

        // ✅ Nếu token đã hết hạn
        if (userToken.expiresAt && userToken.expiresAt < now) {
            await userToken.destroy();
            return res.status(200).json({ verified: false, message: "Token đã hết hạn. Vui lòng yêu cầu lại." });
        }

        // ✅ Nếu token bị khóa (lockedUntil)
        if (userToken.lockedUntil && userToken.lockedUntil > now) {
            const lockTime = userToken.lockedUntil - now;
            return res.status(200).json({ 
                verified: false, 
                lockTime,
                resendCooldown: 0,
                message: `Tài khoản đang bị khóa. Vui lòng thử lại sau ${Math.ceil(lockTime / 1000)} giây.` 
            });
        }

        // ✅ Token hợp lệ và chưa được sử dụng
        return res.status(200).json({ 
            verified: false, 
            lockTime: 0,
            resendCooldown: 0,
            message: "Token hợp lệ. Bạn có thể đặt lại mật khẩu."
        });

    } catch (err) {
        console.error(" Lỗi kiểm tra trạng thái xác thực:", err);
        res.status(500).json({ message: "Lỗi server!" });
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
            return res.status(404).json({ message: "Email không tồn tại trong hệ thống." });
        }

        const nowUtc = new Date();
        const tokenExpiry = 30 * 60 * 1000; // 30 phút
        const cooldownDuration = 10 * 1000; // 10 giây
        const lock1Minute = 1 * 60 * 1000; // 1 phút
        const lock2Minutes = 2 * 60 * 1000; // 2 phút
        const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress || "0.0.0.0";

        // ✅ Lấy token hiện tại nếu có
        let existingToken = await UserToken.findOne({
            where: { email, type: "passwordReset" },
            order: [["createdAt", "DESC"]],
        });

        // ✅ Nếu token đang bị khóa, không cho gửi lại
        if (existingToken && existingToken.lockedUntil && existingToken.lockedUntil > nowUtc) {
            const remainingLock = Math.ceil((existingToken.lockedUntil - nowUtc) / 1000);
            return res.status(429).json({
                message: `Tài khoản đang bị khóa. Vui lòng thử lại sau ${remainingLock} giây.`,
            });
        }

        // ✅ Kiểm tra cooldown
        if (existingToken && existingToken.lastSentAt) {
            const timeSinceLastSend = nowUtc - new Date(existingToken.lastSentAt);
            if (timeSinceLastSend < cooldownDuration) {
                return res.status(429).json({
                    message: `Vui lòng chờ ${Math.ceil((cooldownDuration - timeSinceLastSend) / 1000)} giây để gửi lại.`,
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
        const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "30m" });

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
            resendCooldown: cooldownDuration
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
    const lockTime = userToken.lockedUntil && userToken.lockedUntil > now 
      ? userToken.lockedUntil - now 
      : 0;

    // ✅ Kiểm tra cooldown dựa trên lastSentAt
    const timeSinceLastSend = now - new Date(userToken.lastSentAt || userToken.createdAt);
    const resendCooldown = timeSinceLastSend < cooldownDuration 
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


// ✅ API kiểm tra trạng thái đặt lại mật khẩu
// ✅ API kiểm tra trạng thái đặt lại mật khẩu
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
        const lockTime = userToken.lockedUntil && userToken.lockedUntil > now
            ? userToken.lockedUntil - now
            : 0;

        const cooldownDuration = 10 * 1000; // 10 giây cooldown
        const timeSinceLastSend = now - new Date(userToken.lastSentAt || userToken.createdAt);
        const resendCooldown = timeSinceLastSend < cooldownDuration
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
            return res.status(400).json({ verified: false, message: "Thiếu token!" });
        }

        const userToken = await UserToken.findOne({
            where: { token, type: "passwordReset" },
        });

        if (!userToken) {
            return res.status(400).json({ verified: false, message: "Liên kết không tồn tại hoặc đã hết hạn." });
        }

        const now = new Date();

        // ✅ Nếu token đã được sử dụng
        if (userToken.usedAt) {
            return res.status(400).json({ verified: false, message: "Liên kết đã được sử dụng. Vui lòng yêu cầu lại." });
        }

        // ✅ Nếu token đã hết hạn
        if (userToken.expiresAt && userToken.expiresAt < now) {
            await userToken.destroy();
            return res.status(400).json({ verified: false, message: "Liên kết đã hết hạn. Vui lòng yêu cầu lại." });
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
        res.status(200).json({ verified: true, message: "Liên kết hợp lệ. Bạn có thể đặt lại mật khẩu." });
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
            const remainingLock = Math.ceil((new Date(userToken.lockedUntil) - now) / 1000);
            return res.status(429).json({
                message: `Tài khoản đang bị khóa. Vui lòng thử lại sau ${remainingLock} giây.`,
            });
        }

        // ✅ Đếm số lần gửi lại
        const timeSinceLastSend = now - new Date(userToken.lastSentAt || userToken.createdAt);
        if (timeSinceLastSend < cooldownDuration) {
            return res.status(429).json({
                message: `❌ Vui lòng chờ ${Math.ceil((cooldownDuration - timeSinceLastSend) / 1000)} giây để gửi lại.`,
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
            return res.status(400).json({ message: "Thiếu token hoặc mật khẩu mới!" });
        }

        // ✅ Tìm token chưa sử dụng
        const userToken = await UserToken.findOne({
            where: { token: token.trim(), type: "passwordReset", usedAt: null }, // ✅ Chỉ lấy token chưa sử dụng
        });

        if (!userToken) {
            return res.status(400).json({ message: "Token không tồn tại, đã hết hạn hoặc đã được sử dụng." });
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
            return res.status(400).json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
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
            }
        });

        res.status(200).json({ message: "Đặt lại mật khẩu thành công! Vui lòng đăng nhập." });
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
          "dateOfBirth", // Sử dụng tên cột chính xác từ model User.js
          "avatarUrl"
        ],
      });

      if (!user) {
        return res.status(404).json({ message: "Người dùng không tồn tại!" });
      }

      // Chuyển đổi User instance thành object thuần để dễ dàng chỉnh sửa
      const userResponse = user.toJSON();

      // Xử lý dateOfBirth để trả về dạng { day, month, year } và đổi tên thành birthDate
      if (userResponse.dateOfBirth) { // dateOfBirth sẽ là một chuỗi dạng "YYYY-MM-DD"
        const [year, month, day] = userResponse.dateOfBirth.split('-');
        userResponse.birthDate = { // Đổi tên thành birthDate để khớp với state frontend
          day: day || '',
          month: month || '',
          year: year || ''
        };
      } else {
        // Nếu không có dateOfBirth, trả về object rỗng cho birthDate
        userResponse.birthDate = { day: '', month: '', year: '' };
      }
      // Xóa trường dateOfBirth gốc khỏi response nếu không muốn trả về cả hai
      delete userResponse.dateOfBirth;

      res.status(200).json({ user: userResponse }); // Gửi userResponse đã được chỉnh sửa

    } catch (err) {
      console.error("Lỗi khi lấy thông tin người dùng:", err.name, err.message); // Log chi tiết lỗi
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn!" });
      }
      // Các lỗi khác có thể là lỗi server không lường trước
      res.status(500).json({ message: "Đã xảy ra lỗi máy chủ khi cố gắng lấy thông tin người dùng." });
    }
  }
 // src/controllers/client/authController.js

// src/controllers/client/authController.js
 static async updateProfile(req, res) {
        console.log("===== BẮT ĐẦU updateProfile (Cloudinary) =====");
        console.log("req.body:", JSON.stringify(req.body, null, 2));
        console.log("req.user:", req.user);

        let tempAvatarPath = null; // Để quản lý file tạm do multer tạo ra

        try {
            const userId = req.user ? req.user.id : null;
            if (!userId) {
                console.error("Lỗi: Không tìm thấy userId trong req.user");
                if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                    try { fs.unlinkSync(req.file.path); } catch (e) { console.error("Lỗi xóa file tạm (no user):", e); }
                }
                return res.status(401).json({ message: "Xác thực thất bại, không tìm thấy người dùng." });
            }
            console.log("userId:", userId);

            const { fullName, phone, gender, birthDate: birthDateString } = req.body;

            const user = await User.findByPk(userId);
            if (!user) {
                console.error("Lỗi: Người dùng với ID", userId, "không tồn tại.");
                if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                    try { fs.unlinkSync(req.file.path); } catch (e) { console.error("Lỗi xóa file tạm (user not found):", e); }
                }
                return res.status(404).json({ message: "Người dùng không tồn tại!" });
            }
            console.log("User hiện tại từ DB:", user.toJSON());

            let newAvatarUrl = null; // Sẽ chứa URL từ Cloudinary
            let oldAvatarPublicId = user.avatarPublicId || null; // Giả sử bạn có cột này để lưu public_id

            // 1. Xử lý upload avatar nếu có file được gửi lên
            if (req.file) {
                console.log("---- Xử lý upload avatar lên Cloudinary ----");
                console.log("req.file nhận được từ multer:", req.file);
                tempAvatarPath = req.file.path;
                console.log("Đường dẫn file tạm:", tempAvatarPath);

                try {
                    console.log("Gọi hàm uploadImage với path:", tempAvatarPath);
                    const uploadResult = await uploadImage(tempAvatarPath, "user_avatars"); // 'user_avatars' là folder trên Cloudinary
                    console.log("Kết quả từ uploadImage (Cloudinary):", uploadResult);

                    if (uploadResult && uploadResult.url) {
                        newAvatarUrl = uploadResult.url;
                        // Lưu public_id để có thể xóa ảnh cũ trên Cloudinary nếu cần
                        // Bạn cần thêm cột avatarPublicId vào model User và database
                        // updateData.avatarPublicId = uploadResult.public_id; 
                        console.log("URL ảnh mới từ Cloudinary:", newAvatarUrl);
                        // tempAvatarPath đã được uploadImage xóa nếu thành công
                        tempAvatarPath = null; 
                    } else {
                        console.error("Lỗi: uploadImage không trả về URL. Kết quả:", uploadResult);
                        // File tạm có thể chưa được xóa nếu uploadImage không throw lỗi nhưng không trả về url
                        if (tempAvatarPath && fs.existsSync(tempAvatarPath)) {
                            try { fs.unlinkSync(tempAvatarPath); } catch (e) { console.error("Lỗi xóa file tạm (no URL from Cloudinary):", e); }
                        }
                        return res.status(500).json({ message: "Lỗi khi tải ảnh lên Cloudinary: Không nhận được URL." });
                    }
                } catch (uploadError) {
                    console.error("LỖI TRỰC TIẾP TỪ uploadImage:", uploadError.message, uploadError.stack);
                    if (tempAvatarPath && fs.existsSync(tempAvatarPath)) {
                        try { fs.unlinkSync(tempAvatarPath); } catch (e) { console.error("Lỗi xóa file tạm (uploadError catch):", e); }
                    }
                    return res.status(500).json({ message: "Lỗi khi tải ảnh đại diện lên Cloudinary: " + uploadError.message });
                }
            } else {
                console.log("---- Không có req.file (không có ảnh mới được upload) ----");
            }

            // 2. Kiểm tra số điện thoại (nếu có thay đổi) - giữ nguyên logic này

            // 3. Cập nhật thông tin vào instance 'user'
            if (fullName !== undefined) user.fullName = fullName;
            if (phone !== undefined) user.phone = (phone === '' ? null : phone);
            if (gender !== undefined) user.gender = gender;

         if (birthDateString !== undefined) {
  try {
    // Nếu là chuỗi JSON như: {"day":"19","month":"11","year":"2009"}
    const parsed = typeof birthDateString === 'string' ? JSON.parse(birthDateString) : birthDateString;

    if (parsed.year && parsed.month && parsed.day) {
      const monthPadded = String(parsed.month).padStart(2, '0');
      const dayPadded = String(parsed.day).padStart(2, '0');
      user.dateOfBirth = `${parsed.year}-${monthPadded}-${dayPadded}`;
    } else {
      user.dateOfBirth = null;
    }
  } catch (e) {
    // Nếu không phải JSON => thử gán trực tiếp
    if (/^\d{4}-\d{2}-\d{2}$/.test(birthDateString)) {
      user.dateOfBirth = birthDateString;
    } else {
      console.warn("Ngày sinh không hợp lệ, không được cập nhật.");
    }
  }
}

            if (newAvatarUrl) {
                user.avatarUrl = newAvatarUrl; // URL từ Cloudinary
                // user.avatarPublicId = updateData.avatarPublicId; // Nếu bạn lưu public_id
                console.log("Gán user.avatarUrl =", newAvatarUrl);

                // (Tùy chọn) Xóa ảnh cũ trên Cloudinary nếu có ảnh mới và có public_id cũ
                // if (oldAvatarPublicId && oldAvatarPublicId !== updateData.avatarPublicId) {
                //    try {
                //        console.log("Xóa ảnh cũ trên Cloudinary, public_id:", oldAvatarPublicId);
                //        await cloudinary.uploader.destroy(oldAvatarPublicId);
                //    } catch (deleteError) {
                //        console.error("Lỗi xóa ảnh cũ trên Cloudinary:", deleteError);
                //    }
                // }
            }

            console.log("Dữ liệu user TRƯỚC KHI SAVE:", user.toJSON());
            await user.save();
            console.log("User SAU KHI SAVE thành công.");

            // 5. Chuẩn bị và gửi response thành công về cho client (giữ nguyên logic này)
            const userResponseData = { /* ... */ }; // Copy từ code đầy đủ trước
            // ... (phần xử lý birthDate cho response)
            if (user.dateOfBirth) {
                const [year, month, day] = user.dateOfBirth.split('-');
                userResponseData.birthDate = { day: day || '', month: month || '', year: year || '' };
            } else {
                userResponseData.birthDate = { day: '', month: '', year: '' };
            }
            userResponseData.id = user.id;
            userResponseData.fullName = user.fullName;
            userResponseData.email = user.email;
            userResponseData.roleId = user.roleId;
            userResponseData.phone = user.phone;
            userResponseData.gender = user.gender;
            userResponseData.avatarUrl = user.avatarUrl; // URL từ Cloudinary

            res.status(200).json({
                message: "Cập nhật hồ sơ thành công!",
                user: userResponseData,
            });

        } catch (error) {
            console.error("===== LỖI CHUNG TRONG updateProfile (Cloudinary) =====");
            console.error("Tên lỗi:", error.name);
            console.error("Thông báo lỗi:", error.message);
            console.error("Stack trace:", error.stack);

            if (tempAvatarPath && fs.existsSync(tempAvatarPath)) { // Nếu file tạm còn mà chưa được uploadImage xóa
                try {
                    fs.unlinkSync(tempAvatarPath);
                    console.log("Đã xóa file tạm (trong catch chung):", tempAvatarPath);
                } catch (unlinkErr) {
                    console.error("Lỗi xóa file tạm (trong catch chung):", unlinkErr);
                }
            }
            res.status(500).json({ message: "Đã xảy ra lỗi máy chủ khi cập nhật hồ sơ. " + error.message });
        }
    }


  // src/controllers/client/authController.js

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
      console.error("❌ Facebook Login Error:", err);
      return res.status(401).json({ message: "Đăng nhập Facebook thất bại!" });
    }
  }
  // src/controllers/client/authController.js
  static async logout(req, res) {
    try {
      // Xóa cookie token
      res.clearCookie("token", {
        httpOnly: true,
        secure: true,
        sameSite: "None",
      });
      res.status(200).json({ message: "Đăng xuất thành công!" });
    } catch (err) {
      console.error("❌ Lỗi đăng xuất:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }
}

module.exports = AuthController;
