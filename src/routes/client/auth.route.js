const express = require("express");
const router = express.Router();
const AuthController = require("../../controllers/client/authController");
const { validateRegister, validateLogin, validateForgotPassword, validateResetPassword } = require("../../validations/authValidator");
router.get("/verify-reset-token", AuthController.verifyResetToken); // ✅ Mới thêm

router.post("/reset-password", AuthController.resetPassword);
router.post("/register",validateRegister, AuthController.register);
router.get("/verify-email", AuthController.verifyEmail);
router.post("/resend-verification-link", AuthController.resendVerificationLink); // ✅ Gửi lại link xác thực
router.get("/check-verification-status", AuthController.checkVerificationStatus);
router.post("/login", validateLogin, AuthController.login);
router.post("/google", AuthController.googleLogin);
router.post("/facebook", AuthController.facebookLogin);
router.post("/forgot-password", validateForgotPassword, AuthController.forgotPassword);
router.post("/resend-forgot-password", validateForgotPassword, AuthController.resendForgotPassword);
router.get("/check-reset-status", AuthController.checkResetStatus);
// routes/client/authRoutes.js
router.get("/verification-cooldown", AuthController.getVerificationCooldown);

// routes/client/authRoutes.js
router.get("/user-info", AuthController.getUserInfo);
router.post("/logout", AuthController.logout);
module.exports = router;
