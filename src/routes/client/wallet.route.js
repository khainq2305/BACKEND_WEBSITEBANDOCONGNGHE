const express = require('express');
const router = express.Router();
const WalletController = require('../../controllers/client/WalletController');
const { checkJWT } = require('../../middlewares/checkJWT');

router.use(checkJWT);

// 💰 Ví
router.get('/', WalletController.getWallet);
router.get('/transactions', WalletController.getTransactions);

// 🔐 Thiết lập & xác minh mã PIN
router.post('/send-pin-verification', WalletController.sendWalletPinVerification);
router.get('/pin-cooldown', WalletController.getWalletPinCooldown); 
router.post('/verify-pin-token', WalletController.verifyWalletPinToken);
router.post('/set-pin', WalletController.setWalletPin);
router.post('/verify-pin-and-balance', WalletController.verifyPinAndGetBalance);

// ✅ Thêm các route mới:
router.post('/pin/send-forgot', WalletController.sendForgotPinVerification);      // Gửi mã quên PIN
router.post('/pin/verify-forgot', WalletController.verifyForgotPinToken);         // Xác minh mã quên PIN
router.post('/pin/reset', WalletController.resetWalletPin);                       // Đặt lại PIN
router.post('/pin/change', WalletController.changeWalletPin);                     // Đổi PIN

module.exports = router;
