// src/controllers/WalletController.js

const { Wallet, WalletTransaction, UserToken } = require("../../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const sendEmail = require("../../utils/sendEmail");
const { User } = require("../../models");
/**
 * @description Tạo một token 6 chữ số ngẫu nhiên.
 * @returns {string} Token 6 chữ số.
 */
const generateToken = () => Math.floor(100000 + Math.random() * 900000).toString();

class WalletController {
  /**
   * @description Lấy thông tin ví của người dùng. Nếu chưa có, tạo ví mới.
   * @param {object} req - Đối tượng request
   * @param {object} res - Đối tượng response
   */
  static async getWallet(req, res) {
  try {
    const userId = req.user.id;

    let wallet = await Wallet.findOne({
      where: { userId },
      attributes: ['id', 'balance', 'pinHash', 'updatedAt'],
    });

    // Nếu chưa có ví → Tạo ví mới
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        balance: 0,
        pinHash: null,
      });
    }

    // ✅ Truy thêm từ bảng users
    const user = await User.findByPk(userId, {
      attributes: ['email', 'walletEmailVerified']
    });

    const hasPin = !!wallet.pinHash;

    return res.status(200).json({
  data: {
    id: wallet.id,
    balance: wallet.balance,
    updatedAt: wallet.updatedAt,
    hasPin, // ✅ Thêm dòng này vào trong data
    email: user.email,
    walletEmailVerified: user.walletEmailVerified || false
  },
});

  } catch (error) {
    console.error('❌ Lỗi khi lấy số dư ví:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

  /**
   * @description Xác minh mã PIN của ví.
   * @param {object} req - Đối tượng request
   * @param {object} res - Đối tượng response
   */
  static async verifyWalletPin(req, res) {
    try {
      const userId = req.user.id;
      const { pin } = req.body;

      const wallet = await Wallet.findOne({ where: { userId } });
      if (!wallet || !wallet.pinHash) {
        return res.status(404).json({ message: "Ví chưa được thiết lập PIN" });
      }

      const isMatch = await bcrypt.compare(pin, wallet.pinHash);
      if (!isMatch) {
        return res.status(400).json({ message: "Mã PIN không đúng" });
      }

      return res.json({ message: "Mã PIN hợp lệ" });
    } catch (error) {
      console.error("❌ Lỗi xác minh PIN:", error);
      return res.status(500).json({ message: "Lỗi xác minh mã PIN" });
    }
  }

  /**
   * @description Lấy lịch sử giao dịch của ví.
   * @param {object} req - Đối tượng request
   * @param {object} res - Đối tượng response
   */
  static async getTransactions(req, res) {
    try {
      const userId = req.user.id;

      const wallet = await Wallet.findOne({ where: { userId } });
      if (!wallet) {
        return res.status(404).json({ message: 'Không tìm thấy ví' });
      }

      const transactions = await WalletTransaction.findAll({
        where: { walletId: wallet.id },
        order: [['createdAt', 'DESC']],
      });

      return res.json({ data: transactions });
    } catch (error) {
      console.error('❌ Lỗi khi lấy lịch sử giao dịch ví:', error);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }

  /**
   * @description Gửi mã xác minh thiết lập PIN đến email người dùng, có logic chống spam.
   * @param {object} req - Đối tượng request
   * @param {object} res - Đối tượng response
   */
static async sendWalletPinVerification(req, res) {
  try {
    const user = req.user;
    const now = new Date();
    const ipAddress =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      "0.0.0.0";

    const tokenExpiry = 10 * 60 * 1000; // 10 phút
    const cooldownDuration = 10 * 1000; // cooldown gửi lại: 10 giây
    const lockShort = 15 * 1000;        // khóa ngắn: >= 3 lần
    const lockLong = 30 * 1000;         // khóa dài: >= 5 lần

    // Tìm token cũ
    let userToken = await UserToken.findOne({
      where: { userId: user.id, type: "walletPinSetup" },
      order: [["createdAt", "DESC"]],
    });

    // Nếu đang bị khóa
    if (userToken && userToken.lockedUntil && now < new Date(userToken.lockedUntil)) {
      const remainingLock = Math.ceil((new Date(userToken.lockedUntil) - now) / 1000);
      return res.status(429).json({
        message: `Đã bị khóa. Vui lòng thử lại sau ${remainingLock} giây.`,
      });
    }

    let sendCount = 1;
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + tokenExpiry);

    if (userToken) {
      const timeSinceLastSend = now - new Date(userToken.lastSentAt || userToken.createdAt);
      if (timeSinceLastSend < cooldownDuration) {
        return res.status(429).json({
          message: `Vui lòng chờ ${Math.ceil((cooldownDuration - timeSinceLastSend) / 1000)} giây để gửi lại.`,
        });
      }

      sendCount = userToken.sendCount + 1;

      // Cập nhật các trường
      const updateData = {
        token,
        expiresAt,
        usedAt: null,
        ipAddress,
        lastSentAt: now,
        sendCount,
      };

      // Khóa theo số lần gửi
      if (sendCount >= 3 && sendCount < 5) {
        updateData.lockedUntil = new Date(now.getTime() + lockShort);
      } else if (sendCount >= 5) {
        updateData.lockedUntil = new Date(now.getTime() + lockLong);
      }

      await userToken.update(updateData);
    } else {
      // Nếu chưa có token, tạo mới
      await UserToken.create({
        userId: user.id,
        email: user.email,
        token,
        type: "walletPinSetup",
        expiresAt,
        ipAddress,
        sendCount,
        lastSentAt: now,
        createdAt: now,
        lockedUntil: null,
        usedAt: null,
      });
    }

    const emailContent = `Mã xác minh thiết lập PIN của bạn là: ${token}. Mã này sẽ hết hạn sau 10 phút.`;
    await sendEmail(user.email, "Mã xác minh thiết lập mã PIN", emailContent);

    return res.json({ message: "Đã gửi mã xác minh đến email của bạn." });
  } catch (error) {
    console.error("❌ Lỗi gửi mã xác minh ví:", error);
    return res.status(500).json({ message: "Lỗi khi gửi mã xác minh" });
  }
}



  /**
   * @description Lấy trạng thái cooldown/lock cho việc gửi mã PIN.
   * @param {object} req - Đối tượng request
   * @param {object} res - Đối tượng response
   */
  static async getWalletPinCooldown(req, res) {
  try {
    const userId = req.user.id;
    const cooldownDuration = 10 * 1000; // ✅ 10 giây cooldown

    const now = new Date();
    const userToken = await UserToken.findOne({
      where: { userId, type: "walletPinSetup" },
      order: [["createdAt", "DESC"]],
    });

    if (!userToken) {
      return res.status(200).json({ lockTime: 0, cooldown: 0 });
    }

    const timeSinceLastSend = now - new Date(userToken.lastSentAt || userToken.createdAt);
    const cooldownRemaining = timeSinceLastSend < cooldownDuration
      ? cooldownDuration - timeSinceLastSend
      : 0;

    const lockRemaining =
      userToken.lockedUntil && now < new Date(userToken.lockedUntil)
        ? new Date(userToken.lockedUntil).getTime() - now.getTime()
        : 0;

    return res.status(200).json({
      cooldown: cooldownRemaining > 0 ? cooldownRemaining : 0,
      lockTime: lockRemaining > 0 ? lockRemaining : 0,
    });
  } catch (err) {
    console.error("Lỗi kiểm tra trạng thái cooldown:", err);
    return res.status(500).json({ message: "Lỗi server!" });
  }
}
/**
 * @description Xác minh mã PIN và trả về số dư nếu hợp lệ.
 */
static async verifyPinAndGetBalance(req, res) {
  try {
    const userId = req.user.id;
    const { pin } = req.body;

    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet || !wallet.pinHash) {
      return res.status(404).json({ message: "Ví chưa được thiết lập PIN" });
    }

    const isMatch = await bcrypt.compare(pin, wallet.pinHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Mã PIN không đúng" });
    }

    return res.status(200).json({
      data: {
        balance: wallet.balance,
        updatedAt: wallet.updatedAt,
      },
    });
  } catch (error) {
    console.error("❌ Lỗi verifyPinAndGetBalance:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
}


  /**
   * @description Xác minh mã xác thực (token) từ email.
   * @param {object} req - Đối tượng request
   * @param {object} res - Đối tượng response
   */
  /**
 * @description Xác minh mã xác thực (token) từ email.
 */
static async verifyWalletPinToken(req, res) {
  try {
    const user = req.user;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Thiếu mã xác minh." });
    }

    const found = await UserToken.findOne({
      where: {
        userId: user.id,
        token,
        type: "walletPinSetup",
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!found) {
      return res.status(400).json({ message: "Mã xác minh không hợp lệ hoặc đã hết hạn." });
    }

    // Đánh dấu đã dùng
    found.usedAt = new Date();
    await found.save();

    // ✅ Cập nhật user
    const dbUser = await User.findByPk(user.id);
    if (dbUser) {
      dbUser.walletEmailVerified = true;
      await dbUser.save();
    }

    return res.json({ message: "Xác minh thành công." });
  } catch (error) {
    console.error("❌ Lỗi xác minh mã PIN:", error);
    return res.status(500).json({ message: "Lỗi xác minh" });
  }
}


  /**
   * @description Thiết lập mã PIN cho ví sau khi xác minh thành công.
   * @param {object} req - Đối tượng request
   * @param {object} res - Đối tượng response
   */
  static async setWalletPin(req, res) {
    try {
      const user = req.user;
      const { pin } = req.body;

      if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ message: "Mã PIN phải gồm 6 chữ số." });
      }

   let wallet = await Wallet.findOne({ where: { userId: user.id } });

if (!wallet) {
  wallet = await Wallet.create({ userId: user.id });
}

      if (wallet.pinHash) {
        return res.status(400).json({ message: "Bạn đã thiết lập mã PIN trước đó." });
      }

      wallet.pinHash = await bcrypt.hash(pin, 10);
      await wallet.save();

      return res.json({ message: "Thiết lập mã PIN thành công." });
    } catch (error) {
      console.error("❌ Lỗi thiết lập mã PIN:", error);
      return res.status(500).json({ message: "Lỗi khi thiết lập mã PIN" });
    }
  }
  static async sendForgotPinVerification(req, res) {
  try {
    const user = req.user;

    const now = new Date();
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    // Cập nhật hoặc tạo UserToken
    await UserToken.upsert({
      userId: user.id,
      email: user.email,
      token,
      type: "walletPinReset",
      expiresAt,
      usedAt: null,
      createdAt: now,
      updatedAt: now,
      sendCount: 1,
    });

    await sendEmail(user.email, "Mã xác minh đặt lại mã PIN", `Mã của bạn là: ${token}`);

    return res.json({ message: "Đã gửi mã xác minh để đặt lại mã PIN." });
  } catch (error) {
    console.error("❌ Lỗi gửi mã xác minh reset PIN:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
}
static async verifyForgotPinToken(req, res) {
  try {
    const user = req.user;
    const { token } = req.body;

    const found = await UserToken.findOne({
      where: {
        userId: user.id,
        token,
        type: "walletPinReset",
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!found) {
      return res.status(400).json({ message: "Mã xác minh không hợp lệ hoặc hết hạn" });
    }

    found.usedAt = new Date();
    await found.save();

    return res.json({ message: "Xác minh thành công." });
  } catch (error) {
    return res.status(500).json({ message: "Lỗi xác minh token" });
  }
}
static async resetWalletPin(req, res) {
  try {
    const user = req.user;
    const { pin } = req.body;

    if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ message: "Mã PIN phải gồm 6 chữ số." });
    }

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    if (!wallet) return res.status(404).json({ message: "Không tìm thấy ví" });

    wallet.pinHash = await bcrypt.hash(pin, 10);
    await wallet.save();

    return res.json({ message: "Đặt lại mã PIN thành công." });
  } catch (error) {
    return res.status(500).json({ message: "Lỗi đặt lại mã PIN" });
  }
}
static async changeWalletPin(req, res) {
  try {
    const userId = req.user.id;
    const { currentPin, newPin } = req.body;

    if (!newPin || newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ message: "Mã PIN mới phải gồm 6 chữ số." });
    }

    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet || !wallet.pinHash) {
      return res.status(400).json({ message: "Chưa có mã PIN để đổi." });
    }

    const isMatch = await bcrypt.compare(currentPin, wallet.pinHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Mã PIN hiện tại không đúng." });
    }

    wallet.pinHash = await bcrypt.hash(newPin, 10);
    await wallet.save();

    return res.json({ message: "Đổi mã PIN thành công." });
  } catch (error) {
    console.error("❌ Lỗi đổi mã PIN:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

}

module.exports = WalletController;
