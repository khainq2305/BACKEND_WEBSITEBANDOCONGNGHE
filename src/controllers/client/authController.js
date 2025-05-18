// src/controllers/client/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const User = require("../../models/userModel");
const sendEmail = require("../../utils/sendEmail");
const UserToken = require("../../models/userTokenModel");
const JWT_SECRET = process.env.JWT_SECRET || "your_secret";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { Op } = require("sequelize");
const moment = require("moment-timezone");

class AuthController {
 
static async register(req, res) {
  try {
    const { fullName, email, password } = req.body;

    
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "❌ Email đã tồn tại!" });
    }

    // ✅ Sử dụng thời gian UTC
    const nowUtc = new Date();
    const tokenExpiry = 60 * 60 * 1000; // 60 phút hết hạn token
    const lockDuration = 60 * 60 * 1000; // 60 phút khóa nếu gửi quá nhiều lần

    // ✅ Xóa tất cả token hết hạn (60 phút) hoặc bị khóa
    await UserToken.destroy({
      where: {
        email,
        type: "emailVerification",
        [Op.or]: [
          { createdAt: { [Op.lte]: new Date(nowUtc.getTime() - tokenExpiry) } },
          { lockUntil: { [Op.not]: null, [Op.lte]: nowUtc } },
        ],
      },
    });

    // ✅ Tìm token gần nhất
    let existingToken = await UserToken.findOne({
      where: { email, type: "emailVerification" },
      order: [["createdAt", "DESC"]],
    });

    // ✅ Nếu bị khóa, từ chối gửi lại
    if (existingToken && existingToken.lockUntil && nowUtc < new Date(existingToken.lockUntil)) {
      const remainingTime = new Date(existingToken.lockUntil) - nowUtc;
      return res.status(429).json({
        message: `Đã gửi lại quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(remainingTime / 60000)} phút.`,
        lockTime: remainingTime,
      });
    }

    // ✅ Nếu đã gửi quá nhiều lần (5 lần)
    if (existingToken && existingToken.sendCount >= 5) {
      await existingToken.update({
        lockUntil: new Date(nowUtc.getTime() + lockDuration),
        resendCooldown: null,
      });
      return res.status(429).json({
        message: "❌ Đã gửi lại quá nhiều lần. Vui lòng thử lại sau 60 phút.",
        lockTime: lockDuration,
      });
    }

    let token;
    if (existingToken) {
      // ✅ Nếu có token chưa hết hạn, tăng số lần gửi lại
      token = existingToken.token;
      await existingToken.update({
        sendCount: existingToken.sendCount + 1,
        lockUntil: null,
        createdAt: nowUtc,
      });
    } else {
      // ✅ Nếu chưa có, tạo token mới
      token = jwt.sign({ fullName, email, password, roleId: 2 }, JWT_SECRET, { expiresIn: "60m" });
      await UserToken.create({
        email,
        token,
        type: "emailVerification",
        sendCount: 1,
        createdAt: nowUtc,
        lockUntil: null,
      });
    }

    // ✅ Gửi link xác thực qua email
    const verificationLink = `${BASE_URL}/verify-email?token=${token}`;
    await sendEmail(email, "Xác thực tài khoản", `
      <div>
        <h2>Xác thực tài khoản</h2>
        <p>Chào ${fullName},</p>
        <p>Vui lòng nhấp vào link dưới đây để xác thực tài khoản của bạn:</p>
        <a href="${verificationLink}">Xác thực tài khoản</a>
        <p>Link này sẽ hết hạn sau 60 phút.</p>
      </div>
    `);

    res.status(200).json({ message: "✅ Đã gửi link xác thực qua email!" });
  } catch (err) {
    console.error("❌ Lỗi đăng ký:", err);
    res.status(500).json({ message: "❌ Lỗi server!" });
  }
}







static async resendVerificationLink(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "❌ Thiếu email." });
    }

    // ✅ Sử dụng thời gian UTC
    const nowUtc = new Date();
    const lockDuration = 60 * 60 * 1000; // 60 phút khóa
    const cooldownDuration = 10 * 1000; // 10 giây cooldown

    // ✅ Tìm token gần nhất
    let existingToken = await UserToken.findOne({
      where: { email, type: "emailVerification" },
      order: [["createdAt", "DESC"]],
    });

    // ✅ Nếu không có token, tạo mới
    if (!existingToken) {
      const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "60m" });
      await UserToken.create({
        email,
        token,
        type: "emailVerification",
        sendCount: 1,
        createdAt: nowUtc,
        resendCooldown: new Date(nowUtc.getTime() + cooldownDuration),
        lockUntil: null,
      });
      return res.status(200).json({
        message: "✅ Đã gửi lại link xác thực qua email!",
        resendCooldown: cooldownDuration,
        lockTime: null,
      });
    }

    // ✅ Kiểm tra nếu bị khóa (lockUntil)
    if (existingToken.lockUntil && new Date(existingToken.lockUntil) > nowUtc) {
      const remainingLockTime = new Date(existingToken.lockUntil) - nowUtc;
      return res.status(429).json({
        message: "❌ Đã gửi lại quá nhiều lần. Vui lòng thử lại sau 60 phút.",
        lockTime: remainingLockTime,
      });
    }

    // ✅ Kiểm tra cooldown (resendCooldown)
    if (existingToken.resendCooldown && new Date(existingToken.resendCooldown) > nowUtc) {
      const remainingCooldown = new Date(existingToken.resendCooldown) - nowUtc;
      return res.status(429).json({
        message: "❌ Vui lòng chờ trước khi gửi lại.",
        resendCooldown: remainingCooldown,
      });
    }

    // ✅ Nếu đã gửi quá nhiều lần (5 lần)
    if (existingToken.sendCount >= 5) {
      await existingToken.update({
        lockUntil: new Date(nowUtc.getTime() + lockDuration),
        resendCooldown: null,
        sendCount: 5,
      });
      return res.status(429).json({
        message: "❌ Đã gửi lại quá nhiều lần. Vui lòng thử lại sau 60 phút.",
        lockTime: lockDuration,
      });
    }

    // ✅ Nếu chưa đạt giới hạn, tăng sendCount và đặt cooldown
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "60m" });
    await existingToken.update({
      token,
      sendCount: existingToken.sendCount + 1,
      resendCooldown: new Date(nowUtc.getTime() + cooldownDuration),
      lockUntil: null,
    });

    // ✅ Gửi lại link xác thực qua email
    const verificationLink = `${BASE_URL}/verify-email?token=${token}`;
    await sendEmail(email, "Xác thực lại tài khoản", `
      <div>
        <h2>Xác thực lại tài khoản</h2>
        <p>Vui lòng nhấp vào link dưới đây để xác thực tài khoản của bạn:</p>
        <a href="${verificationLink}">Xác thực tài khoản</a>
        <p>Link này sẽ hết hạn sau 60 phút.</p>
      </div>
    `);

    res.status(200).json({
      message: "✅ Đã gửi lại link xác thực qua email!",
      resendCooldown: cooldownDuration,
      lockTime: null,
    });
  } catch (err) {
    console.error("❌ Lỗi gửi lại link xác thực:", err);
    res.status(500).json({ message: "❌ Lỗi server!" });
  }
}




static async getVerificationCooldown(req, res) {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: "❌ Thiếu email." });
    }

    const userToken = await UserToken.findOne({
      where: { email, type: "emailVerification" },
      order: [["createdAt", "DESC"]],
    });

    if (!userToken) {
      return res.status(404).json({ message: "❌ Không tìm thấy thông tin xác thực." });
    }

    const now = moment.tz("Asia/Ho_Chi_Minh");
    const lockUntil = userToken.lockUntil ? moment(userToken.lockUntil) : null;
    const resendCooldown = userToken.resendCooldown ? moment(userToken.resendCooldown) : null;

    res.status(200).json({
      verified: false,
      lockUntil: lockUntil && lockUntil.isAfter(now) ? lockUntil.toISOString() : null,
      resendCooldown: resendCooldown && resendCooldown.isAfter(now) ? resendCooldown.toISOString() : null,
    });
  } catch (err) {
    console.error("❌ Lỗi kiểm tra trạng thái xác thực:", err);
    res.status(500).json({ message: "❌ Lỗi server!" });
  }
}








static async verifyEmail(req, res) {
  try {
    console.log("\n\n🔍 [START] Xác thực email - API xác thực");
    const { token } = req.query;
    console.log("🔍 [STEP 1] Token nhận được từ URL:", token);

    if (!token) {
      console.log("❌ [ERROR] Thiếu token xác thực!");
      return res.status(400).json({ message: "Thiếu token xác thực!" });
    }

    // ✅ Giải mã token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.log("❌ [ERROR] Token không hợp lệ hoặc đã hết hạn.");
      return res.status(400).json({ message: "Link xác thực không hợp lệ hoặc đã hết hạn." });
    }

    const { fullName, email, password, roleId } = decoded;
    console.log("🔍 [STEP 2] Thông tin từ token:", { fullName, email, password, roleId });

    const tokenExpiry = 60 * 60 * 1000; // 60 phút hết hạn token

    // ✅ Xóa tất cả token hết hạn (60 phút) hoặc bị khóa (lockUntil hết hạn)
    await UserToken.destroy({
      where: {
        email,
        type: "emailVerification",
        [Op.or]: [
          { createdAt: { [Op.lte]: new Date(Date.now() - tokenExpiry) } }, // Hết hạn
          { lockUntil: { [Op.not]: null, [Op.lte]: new Date() } },         // Khóa đã hết hạn
        ],
      },
    });

    // ✅ Tìm token hiện tại trong database
    const userToken = await UserToken.findOne({
      where: { email, type: "emailVerification", token },
    });

    console.log("🔍 [STEP 3] Token tìm thấy trong database:", userToken ? userToken.token : "Không tìm thấy");

    if (!userToken) {
      console.log("❌ [ERROR] Token không tồn tại trong database hoặc đã hết hạn.");
      return res.status(400).json({ message: "Link xác thực không hợp lệ hoặc đã hết hạn." });
    }

    // ✅ Kiểm tra nếu user đã tồn tại (nghĩa là đã xác thực)
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      console.log("✅ [INFO] Tài khoản đã được xác thực trước đó.");
      await UserToken.destroy({ where: { email, type: "emailVerification" } });
      return res.status(200).json({ 
        message: "✅ Tài khoản của bạn đã được xác thực. Vui lòng đăng nhập.",
        alreadyVerified: true 
      });
    }

    // ✅ Đảm bảo thông tin đầy đủ
    if (!fullName || !password) {
      console.log("❌ [ERROR] Token không hợp lệ. Thiếu thông tin người dùng.");
      return res.status(400).json({ message: "❌ Token không hợp lệ. Thiếu thông tin người dùng." });
    }

    // ✅ Đảm bảo roleId có giá trị mặc định (nếu không có)
    const finalRoleId = roleId || 2;

    // ✅ Lưu user vào database (chỉ khi nhấp vào link)
    console.log("🔍 [STEP 4] Đang lưu người dùng vào database...");
    await User.create({
      fullName: fullName.trim(),
      email,
      password,
      roleId: finalRoleId,
    });
    console.log("✅ [STEP 5] Đã lưu người dùng:", email);

    // ✅ Xóa tất cả token xác thực email của user này (đã xác thực)
    await UserToken.destroy({ where: { email, type: "emailVerification" } });
    console.log("✅ [STEP 6] Đã xóa token xác thực của user trong database.");

    res.status(200).json({ message: "✅ Xác thực thành công! Vui lòng đăng nhập." });
  } catch (err) {
    console.error("❌ [ERROR] Lỗi xác thực email:", err);
    res.status(500).json({ message: "❌ Lỗi server!" });
  }
}







// ✅ API kiểm tra trạng thái xác thực
static async checkVerificationStatus(req, res) {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: "Thiếu email." });
    }

    const user = await User.findOne({ where: { email } });
    if (user) {
      return res.status(200).json({ verified: true });
    }

    res.status(200).json({ verified: false });
  } catch (err) {
    console.error("❌ Lỗi kiểm tra trạng thái xác thực:", err);
    res.status(500).json({ message: "❌ Lỗi server!" });
  }
}











  // src/controllers/client/authController.js
static async login(req, res) {
  try {
    const { email, password } = req.body;

    // ✅ Tìm người dùng theo email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: "Email hoặc mật khẩu không đúng!" });
    }

    // ✅ Kiểm tra trạng thái tài khoản (bị khóa)
    if (user.status === 0) {
      return res.status(403).json({ message: "Tài khoản bị khóa!" });
    }

    // ✅ So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Email hoặc mật khẩu không đúng!" });
    }

    // ✅ Tạo JWT Token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roleId: user.roleId
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ Đặt Cookie Token
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 ngày
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
      }
    });
  } catch (err) {
    console.error("❌ Lỗi đăng nhập:", err);
    res.status(500).json({ message: "Lỗi server!" });
  }
}


  
  // src/controllers/client/authController.js
  // ✅ Đặt lại mật khẩu
// src/controllers/client/authController.js
// ✅ Đặt lại mật khẩu
// src/controllers/client/authController.js
// src/controllers/client/authController.js
// src/controllers/client/authController.js
// src/controllers/client/authController.js
// ✅ Đặt lại mật khẩu (Gửi lại link)
// ✅ API gửi link đặt lại mật khẩu
// ✅ API gửi yêu cầu đặt lại mật khẩu
static async forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "❌ Thiếu email." });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "❌ Email không tồn tại trong hệ thống." });
    }

    const nowUtc = new Date();
    const lockDuration = 60 * 60 * 1000; // 60 phút khóa
    const resendCooldown = 10 * 1000; // 10 giây cooldown
    const tokenExpiry = 60 * 60 * 1000; // 60 phút hết hạn token

    // ✅ Xóa tất cả token hết hạn hoặc bị khóa (UTC)
    await UserToken.destroy({
      where: {
        email,
        type: "passwordReset",
        [Op.or]: [
          { createdAt: { [Op.lte]: new Date(nowUtc.getTime() - tokenExpiry) } },
          { lockUntil: { [Op.not]: null, [Op.lte]: nowUtc } },
        ]
      }
    });

    let existingToken = await UserToken.findOne({
      where: { email, type: "passwordReset" },
      order: [["createdAt", "DESC"]],
    });

    // ✅ Nếu đã có token
    if (existingToken) {
      if (existingToken.lockUntil && existingToken.lockUntil > nowUtc) {
        const remainingTime = existingToken.lockUntil.getTime() - nowUtc.getTime();
        return res.status(429).json({
          message: "Đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.",
          lockTime: remainingTime,
        });
      }

      if (existingToken.sendCount >= 5) {
        await existingToken.update({
          lockUntil: new Date(nowUtc.getTime() + lockDuration),
          resendCooldown: null,
          sendCount: 5
        });
        return res.status(429).json({
          message: "Đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 60 phút.",
          lockTime: lockDuration,
        });
      }

      // ✅ Nếu không bị khóa, tăng số lần gửi lại và đặt cooldown
      await existingToken.update({
        sendCount: existingToken.sendCount + 1,
        resendCooldown: new Date(nowUtc.getTime() + resendCooldown),
        lockUntil: null,
      });
    } else {
      // ✅ Nếu chưa có, tạo token mới
      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "60m" });
      await UserToken.create({
        userId: user.id,
        email,
        token,
        type: "passwordReset",
        sendCount: 1,
        lockUntil: null,
        resendCooldown: new Date(nowUtc.getTime() + resendCooldown),
        createdAt: nowUtc
      });
      existingToken = { token };
    }

    const resetLink = `${BASE_URL}/dat-lai-mat-khau?token=${existingToken.token}`;
    await sendEmail(email, "Đặt lại mật khẩu", `
      <div>
        <h2>Đặt lại mật khẩu</h2>
        <p>Nhấn vào link dưới đây để đặt lại mật khẩu của bạn:</p>
        <a href="${resetLink}">Đặt lại mật khẩu</a>
        <p>Link này sẽ hết hạn sau 60 phút.</p>
      </div>
    `);

    res.status(200).json({ 
      message: "✅ Đã gửi liên kết đặt lại mật khẩu qua email!",
      resendCooldown: resendCooldown,
      lockTime: 0
    });
  } catch (err) {
    console.error("❌ Lỗi đặt lại mật khẩu:", err);
    res.status(500).json({ message: "❌ Lỗi server!" });
  }
}


// ✅ API kiểm tra trạng thái đặt lại mật khẩu
// ✅ API kiểm tra trạng thái đặt lại mật khẩu
static async checkResetStatus(req, res) {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: "❌ Thiếu email." });
    }

    const userToken = await UserToken.findOne({
      where: { email, type: "passwordReset" },
      order: [["createdAt", "DESC"]],
    });

    const nowUtc = new Date();

    if (!userToken) {
      return res.status(200).json({
        lockTime: 0,
        resendCooldown: 0,
        message: "✅ Không có yêu cầu đặt lại mật khẩu đang chờ xử lý.",
      });
    }

    const lockTime = userToken.lockUntil ? Math.max(0, userToken.lockUntil.getTime() - nowUtc.getTime()) : 0;
    const resendCooldown = userToken.resendCooldown ? Math.max(0, userToken.resendCooldown.getTime() - nowUtc.getTime()) : 0;

    res.status(200).json({
      lockTime,
      resendCooldown,
      message: "✅ Đã lấy trạng thái khóa và cooldown thành công.",
    });
  } catch (err) {
    console.error("❌ Lỗi kiểm tra trạng thái đặt lại mật khẩu:", err);
    res.status(500).json({ message: "❌ Lỗi server!" });
  }
}








static async verifyResetToken(req, res) {
  try {
    const { token } = req.query;
    console.log("🔍 API Xác thực token - Token nhận được:", token);

    if (!token) {
      console.log("❌ Lỗi: Thiếu token!");
      return res.status(400).json({ verified: false, message: "❌ Thiếu token!" });
    }

    const userToken = await UserToken.findOne({
      where: {
        token: token,
        type: "passwordReset"
      }
    });
    console.log("🔍 Token trong database:", userToken ? userToken.token : "Không tìm thấy");

    if (!userToken) {
      console.log("❌ Lỗi: Token không tồn tại!");
      return res.status(400).json({ verified: false, message: "❌ Token không tồn tại!" });
    }

    // ✅ Giải mã token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log("✅ Token hợp lệ:", decoded);
    } catch (err) {
      await UserToken.destroy({ where: { token, type: "passwordReset" } });
      console.log("❌ Token không hợp lệ hoặc đã hết hạn!", err);
      return res.status(400).json({ verified: false, message: "❌ Token không hợp lệ hoặc đã hết hạn!" });
    }

    res.status(200).json({ verified: true, message: "✅ Token hợp lệ." });
  } catch (err) {
    console.error("❌ Lỗi kiểm tra token:", err);
    res.status(500).json({ verified: false, message: "❌ Lỗi server!" });
  }
}





 












static async resetPassword(req, res) {
  console.log("\n\n🔍 [START] Đặt lại mật khẩu - API resetPassword");
  
  const { token, newPassword } = req.body;
  console.log("🔍 Token nhận được:", token);
  console.log("🔍 Mật khẩu mới:", newPassword);

  if (!token || !newPassword) {
    return res.status(400).json({ message: "❌ Thiếu token hoặc mật khẩu mới!" });
  }

  // 🔍 Tìm token trong database
  const userToken = await UserToken.findOne({
    where: { token: token.trim(), type: "passwordReset" }
  }).catch(err => {
    console.error("❌ Lỗi tìm token trong database:", err);
    return res.status(500).json({ message: "❌ Lỗi server khi tìm token!" });
  });

  if (!userToken) {
    console.log("❌ Token không tồn tại trong database.");
    return res.status(400).json({ message: "❌ Token không tồn tại hoặc đã hết hạn." });
  }

  // ✅ Giải mã token
  let decoded;
  try {
    decoded = jwt.verify(token.trim(), JWT_SECRET);
    console.log("✅ Token hợp lệ:", decoded);
  } catch (err) {
    await UserToken.destroy({ where: { token: token.trim(), type: "passwordReset" } });
    console.log("❌ Token không hợp lệ hoặc đã hết hạn!", err);
    return res.status(400).json({ message: "❌ Token không hợp lệ hoặc đã hết hạn!" });
  }

  // 🔍 Lấy user theo ID trong token
  const user = await User.findByPk(decoded.id).catch(err => {
    console.error("❌ Lỗi tìm user trong database:", err);
    return res.status(500).json({ message: "❌ Lỗi server khi tìm user!" });
  });

  if (!user) {
    return res.status(404).json({ message: "❌ Người dùng không tồn tại!" });
  }

  // ✅ Đặt lại mật khẩu mới (hash mật khẩu)
  user.password = await bcrypt.hash(newPassword, 10).catch(err => {
    console.error("❌ Lỗi hash mật khẩu:", err);
    return res.status(500).json({ message: "❌ Lỗi server khi hash mật khẩu!" });
  });
  
  await user.save().catch(err => {
    console.error("❌ Lỗi lưu mật khẩu mới:", err);
    return res.status(500).json({ message: "❌ Lỗi server khi lưu mật khẩu mới!" });
  });

  // ✅ Xóa token sau khi sử dụng
  await UserToken.destroy({ where: { token: token.trim(), type: "passwordReset" } });

  console.log("✅ Đã đặt lại mật khẩu thành công cho user:", user.email);
  res.status(200).json({ message: "✅ Đặt lại mật khẩu thành công! Vui lòng đăng nhập." });
}







// ✅ API gửi lại link đặt lại mật khẩu
// ✅ API gửi lại link đặt lại mật khẩu
static async resendForgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "❌ Thiếu email." });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "❌ Email không tồn tại trong hệ thống." });
    }

    const nowUtc = new Date();
    const lockDuration = 60 * 60 * 1000; // 60 phút khóa
    const resendCooldown = 10 * 1000; // 10 giây cooldown
    const tokenExpiry = 60 * 60 * 1000; // 60 phút hết hạn token

    // ✅ Xóa tất cả token hết hạn (60 phút)
    await UserToken.destroy({
      where: {
        email,
        type: "passwordReset",
        [Op.or]: [
          { createdAt: { [Op.lte]: new Date(nowUtc.getTime() - tokenExpiry) } },
          { lockUntil: { [Op.not]: null, [Op.lte]: nowUtc } }
        ]
      }
    });

    let existingToken = await UserToken.findOne({
      where: { email, type: "passwordReset" },
      order: [["createdAt", "DESC"]],
    });

    // ✅ Nếu có token hiện tại
    if (existingToken) {
      const lockTime = existingToken.lockUntil ? new Date(existingToken.lockUntil).getTime() : 0;
      const cooldownTime = existingToken.resendCooldown ? new Date(existingToken.resendCooldown).getTime() : 0;

      // ✅ Nếu bị khóa
      if (lockTime > nowUtc.getTime()) {
        return res.status(429).json({
          message: `❌ Đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${Math.ceil((lockTime - nowUtc.getTime()) / 60000)} phút.`,
          lockTime: lockTime - nowUtc.getTime(),
        });
      }

      // ✅ Nếu đang trong thời gian cooldown
      if (cooldownTime > nowUtc.getTime()) {
        return res.status(429).json({
          message: `❌ Vui lòng chờ ${Math.ceil((cooldownTime - nowUtc.getTime()) / 1000)} giây để gửi lại.`,
          resendCooldown: cooldownTime - nowUtc.getTime(),
        });
      }

      // ✅ Nếu đã gửi quá nhiều lần, khóa 60 phút
      if (existingToken.sendCount >= 5) {
        await existingToken.update({
          lockUntil: new Date(nowUtc.getTime() + lockDuration),
          resendCooldown: null,
          sendCount: 5,
        });
        return res.status(429).json({
          message: "❌ Đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau 60 phút.",
          lockTime: lockDuration,
        });
      }

      // ✅ Nếu không bị khóa, tăng số lần gửi lại và đặt cooldown
      await existingToken.update({
        sendCount: existingToken.sendCount + 1,
        resendCooldown: new Date(nowUtc.getTime() + resendCooldown),
        lockUntil: null,
      });
    } else {
      // ✅ Nếu chưa có, tạo token mới
      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "60m" });
      await UserToken.create({
        userId: user.id,
        email,
        token,
        type: "passwordReset",
        sendCount: 1,
        lockUntil: null,
        resendCooldown: new Date(nowUtc.getTime() + resendCooldown),
      });
      existingToken = { token };
    }

    const resetLink = `${BASE_URL}/dat-lai-mat-khau?token=${existingToken.token}`;
    await sendEmail(email, "Đặt lại mật khẩu", `
      <div>
        <h2>Đặt lại mật khẩu</h2>
        <p>Nhấn vào link dưới đây để đặt lại mật khẩu của bạn:</p>
        <a href="${resetLink}">Đặt lại mật khẩu</a>
        <p>Link này sẽ hết hạn sau 60 phút.</p>
      </div>
    `);

    res.status(200).json({
      message: "✅ Đã gửi lại liên kết đặt lại mật khẩu!",
      lockTime: existingToken.lockUntil ? Math.max(0, new Date(existingToken.lockUntil).getTime() - nowUtc.getTime()) : 0,
      resendCooldown: existingToken.resendCooldown ? Math.max(0, new Date(existingToken.resendCooldown).getTime() - nowUtc.getTime()) : 0,
    });
  } catch (err) {
    console.error("❌ Lỗi gửi lại email đặt lại mật khẩu:", err);
    res.status(500).json({ message: "❌ Lỗi server!" });
  }
}





// ✅ API kiểm tra trạng thái đặt lại mật khẩu





 
static async getUserInfo(req, res) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    console.log("🔎 Token Backend nhận được:", token);
    
    if (!token) return res.status(401).json({ message: "Không có token!" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("🔎 Thông tin Token:", decoded);

    const user = await User.findByPk(decoded.id, {
      attributes: ["id", "fullName", "email", "roleId"],
    });

    if (!user) return res.status(404).json({ message: "Người dùng không tồn tại!" });

    res.status(200).json({ user });
  } catch (err) {
    console.error("❌ Lỗi lấy thông tin người dùng:", err);
    res.status(401).json({ message: "Token không hợp lệ hoặc hết hạn!" });
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
    const providerId = payload.sub; // Google ID
    const email = payload.email;
    const name = payload.name || email.split("@")[0];
    const avatar = payload.picture;
    console.log("🔍 fullName từ Google:", name);
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
        fullName: user.fullName, // ✅ Đảm bảo có fullName ở đây
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
        fullName: user.fullName, // ✅ Đảm bảo trả về fullName
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
