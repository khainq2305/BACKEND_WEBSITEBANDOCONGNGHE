// src/controllers/WalletController.js
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { Wallet, Withdrawal, WalletTransaction, User } = require("../../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const sendEmail = require("../../utils/sendEmail");

const generateToken = () => Math.floor(100000 + Math.random() * 900000).toString();

class WalletController {
  static async getWallet(req, res) {
  try {
    const userId = req.user.id;

    // đảm bảo có ví
    let wallet = await Wallet.findOne({
      where: { userId },
      attributes: ['id', 'balance', 'pinHash', 'updatedAt'],
    });

    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0, pinHash: null });
    }

    // lấy user + các trường 2FA
    const user = await User.findByPk(userId, {
      attributes: [
        'email',
        'walletEmailVerified',
        'wallet2FASecret',
        'wallet2FAStatus',      // <-- cột mới
        'wallet2FAEnabledAt',   // <-- cột mới (nếu có)
      ],
    });

    // fallback khi chưa migrate cột mới:
    const googleAuthStatus =
      user?.wallet2FAStatus ||
      (user?.wallet2FASecret ? 'active' : 'off'); // nếu chỉ có secret (code cũ), tạm coi là active

    const hasPin = !!wallet.pinHash;
    const hasGoogleAuth = googleAuthStatus === 'active';

    return res.status(200).json({
      data: {
        id: wallet.id,
        balance: wallet.balance,
        updatedAt: wallet.updatedAt,

        // security
        hasPin,
        hasGoogleAuth,                 // chỉ true khi ACTIVE
        googleAuthStatus,              // 'off' | 'pending' | 'active'
        googleAuthEnabledAt: user?.wallet2FAEnabledAt || null,

        // method ưu tiên hiển thị
        securityMethod: hasGoogleAuth ? 'google-auth' : (hasPin ? 'pin' : null),

        // info khác
        email: user?.email || null,
        walletEmailVerified: !!user?.walletEmailVerified,
      },
    });
  } catch (error) {
    console.error('Lỗi khi lấy số dư ví:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}


 

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
      console.error('Lỗi khi lấy lịch sử giao dịch ví:', error);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }

 

 static async enableGoogleAuth(req, res) {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'wallet2FASecret', 'wallet2FAStatus'],
    });

    // Nếu đang 'active' -> không cho enable lại
    if (user.wallet2FAStatus === 'active') {
      return res.status(400).json({ message: '2FA đã được kích hoạt.' });
    }

    // Nếu đang 'pending' và đã có secret -> tái sử dụng secret cũ, phát lại QR
    if (user.wallet2FAStatus === 'pending' && user.wallet2FASecret) {
      const otpauthUrl = speakeasy.otpauthURL({
        secret: user.wallet2FASecret,
        label: `MyApp Wallet (${req.user.email})`,
        issuer: 'MyApp',
        encoding: 'base32',
      });
      const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);
      return res.json({
        message: 'Quét mã QR bằng Google Authenticator',
        qrCode: qrCodeDataURL,
        secret: user.wallet2FASecret,
        otpauthUrl,
      });
    }

    // Tạo secret mới
    const secret = speakeasy.generateSecret({
      name: `MyApp Wallet (${req.user.email})`, // label hiển thị trong app
      issuer: 'MyApp',
      length: 20,
    });

    await user.update({
      wallet2FASecret: secret.base32,
      wallet2FAStatus: 'pending',
      wallet2FAEnabledAt: null,
    });

    const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

    return res.json({
      message: 'Quét mã QR bằng Google Authenticator',
      qrCode: qrCodeDataURL,
      secret: secret.base32,         // 👈 thêm
      otpauthUrl: secret.otpauth_url // 👈 thêm
    });
  } catch (error) {
    console.error('Lỗi bật Google Auth:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}



static async verifyGoogleAuth(req, res) {
  try {
    const { token } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user.wallet2FASecret || user.wallet2FAStatus !== 'pending') {
      return res.status(400).json({ message: "Chưa bật Google Authenticator hoặc đã xác minh" });
    }

    const verified = speakeasy.totp.verify({
      secret: user.wallet2FASecret,
      encoding: "base32",
      token,
      window: 1
    });

    if (!verified) {
      return res.status(400).json({ message: "Mã không hợp lệ hoặc đã hết hạn" });
    }

    await user.update({
      wallet2FAStatus: 'active',
      wallet2FAEnabledAt: new Date()
    });

    res.json({ message: "Xác minh thành công, 2FA đã được kích hoạt" });
  } catch (error) {
    console.error("Lỗi xác minh Google Auth:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
}


  static async disableGoogleAuth(req, res) {
  try {
    const { token } = req.body || {};
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'wallet2FASecret']
    });

    if (!user.wallet2FASecret) {
      return res.status(400).json({ message: "Bạn chưa bật Google Authenticator" });
    }

    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ message: "Mã Google Authenticator không hợp lệ (6 số)" });
    }

    const ok = speakeasy.totp.verify({
      secret: user.wallet2FASecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!ok) {
      return res.status(400).json({ message: "Mã Google Authenticator không hợp lệ hoặc đã hết hạn" });
    }

    await user.update({
      wallet2FASecret: null,
      wallet2FAStatus: null,
      wallet2FAEnabledAt: null
    });

    try {
      await sendEmail(
        user.email,
        "Bạn đã tắt Google Authenticator",
        "Bạn vừa tắt bảo mật 2 bước (Google Authenticator). Nếu không phải bạn, hãy liên hệ hỗ trợ ngay."
      );
    } catch (e) {
      console.error("Gửi email thông báo tắt GA lỗi:", e);
    }

    return res.json({ message: "Đã tắt Google Authenticator" });
  } catch (error) {
    console.error("disableGoogleAuth:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

// WalletController.js
static async verifyPayment(req, res) {
  try {
    const { token } = req.body || {};
    if (!/^\d{6}$/.test(token || '')) {
      return res.status(400).json({ message: 'Mã OTP không hợp lệ (6 số)' });
    }

    const user = await User.findByPk(req.user.id, {
      attributes: ['wallet2FASecret', 'wallet2FAStatus'],
    });
    if (!user.wallet2FASecret || user.wallet2FAStatus !== 'active') {
      return res.status(400).json({ message: '2FA chưa được kích hoạt' });
    }

    const ok = speakeasy.totp.verify({
      secret: user.wallet2FASecret,
      encoding: 'base32',
      token,
      window: 1,
    });
    if (!ok) return res.status(400).json({ message: 'OTP không đúng hoặc đã hết hạn' });

    return res.json({ success: true, message: 'Xác minh OTP thành công' });
  } catch (e) {
    console.error('verifyPayment:', e);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}
 static async requestWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const { amount, method, accountName, accountNumber, bankCode, token } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Số tiền không hợp lệ" });
      }

      // tìm ví
      const wallet = await Wallet.findOne({ where: { userId } });
      if (!wallet) return res.status(404).json({ message: "Không tìm thấy ví" });

      if (parseFloat(wallet.balance) < amount) {
        return res.status(400).json({ message: "Số dư không đủ" });
      }

      // kiểm tra 2FA
      const user = await User.findByPk(userId, {
        attributes: ["wallet2FASecret", "wallet2FAStatus"],
      });

      if (user.wallet2FAStatus === "active") {
        if (!token || !/^\d{6}$/.test(token)) {
          return res.status(400).json({ message: "Mã OTP không hợp lệ" });
        }

        const ok = speakeasy.totp.verify({
          secret: user.wallet2FASecret,
          encoding: "base32",
          token,
          window: 1,
        });
        if (!ok) return res.status(400).json({ message: "OTP sai hoặc hết hạn" });
      }

      // phí rút (vd 1%)
      const fee = Math.ceil(amount * 0.01);
      const netAmount = amount - fee;

      // trừ tiền khỏi ví ngay
      wallet.balance = parseFloat(wallet.balance) - amount;
      await wallet.save();

      // tạo Withdrawal record
      const withdrawal = await Withdrawal.create({
        walletId: wallet.id,
        amount,
        fee,
        netAmount,
        method,
        accountName,
        accountNumber,
        bankCode,
        status: "pending", // chờ xử lý
        requestedAt: new Date(),
      });

      // log transaction
      await WalletTransaction.create({
        walletId: wallet.id,
        type: "withdraw",
        amount: -amount,
        description: `Rút tiền ${method}`,
        relatedOrderId: null,
      });

      return res.json({ message: "Yêu cầu rút tiền thành công", data: withdrawal });
    } catch (e) {
      console.error("requestWithdrawal:", e);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  // Lịch sử rút tiền
  static async getWithdrawals(req, res) {
    try {
      const userId = req.user.id;
      const wallet = await Wallet.findOne({ where: { userId } });
      if (!wallet) return res.status(404).json({ message: "Không tìm thấy ví" });

      const list = await Withdrawal.findAll({
        where: { walletId: wallet.id },
        order: [["createdAt", "DESC"]],
      });

      return res.json({ data: list });
    } catch (e) {
      console.error("getWithdrawals:", e);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = WalletController;
