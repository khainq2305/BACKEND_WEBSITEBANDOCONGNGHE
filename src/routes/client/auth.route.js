const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

const fs = require("fs"); // ✅ THÊM ĐÚNG MODULE FS (File System)
const { checkJWT} = require("../../middlewares/checkJWT");
const AuthController = require("../../controllers/client/authController");
const { validateRegister, validateLogin, validateForgotPassword, validateResetPassword } = require("../../validations/authValidator");
router.get("/verify-reset-token", AuthController.verifyResetToken);

router.post("/reset-password", AuthController.resetPassword);
router.post("/register",validateRegister, AuthController.register);
router.get("/verify-email", AuthController.verifyEmail);
router.post("/resend-verification-link", AuthController.resendVerificationLink);
router.get("/check-verification-status", AuthController.checkVerificationStatus);
router.post("/login", validateLogin, AuthController.login);
router.post("/google", AuthController.googleLogin);
router.post("/facebook", AuthController.facebookLogin);
router.post("/forgot-password", validateForgotPassword, AuthController.forgotPassword);
router.post("/resend-forgot-password", validateForgotPassword, AuthController.resendForgotPassword);
router.get("/check-reset-status", AuthController.checkResetStatus);

router.get("/verification-cooldown", AuthController.getVerificationCooldown);
// ✅ Đảm bảo thư mục public/uploads tồn tại
const uploadsDir = path.join(__dirname, "../../public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ✅ Cấu hình Multer đúng cách với storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // ✅ Lưu vào thư mục public/uploads
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// ✅ Đảm bảo upload chỉ nhận file hình ảnh
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("❌ Chỉ chấp nhận file hình ảnh!"));
    }
    cb(null, true);
  },
});

// ✅ Đảm bảo route sử dụng đúng middleware upload
router.put("/update-profile", checkJWT, upload.single("avatarImage"), AuthController.updateProfile);
router.get("/get-reset-cooldown", AuthController.getResetCooldown); 
router.get("/user-info", checkJWT, AuthController.getUserInfo);
router.post("/logout", checkJWT, AuthController.logout);
module.exports = router;
