const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

const fs = require("fs");
const { checkJWT} = require("../../middlewares/checkJWT");
const AuthController = require("../../controllers/client/authController");
const upload = require("../../middlewares/upload");

const { validateRegister, validateLogin, validateForgotPassword, validateResetPassword, validateUpdateProfile } = require("../../validations/authValidator");
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


router.put(
  "/update-profile",
  checkJWT,
  upload.single("avatarImage"),
  validateUpdateProfile,
  AuthController.updateProfile
);


router.get("/get-reset-cooldown", AuthController.getResetCooldown); 
router.get("/user-info", checkJWT, AuthController.getUserInfo);
router.post("/logout", checkJWT, AuthController.logout);
module.exports = router;
