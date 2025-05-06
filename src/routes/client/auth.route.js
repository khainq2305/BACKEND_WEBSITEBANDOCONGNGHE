const express = require("express");
const router = express.Router();
const AuthController = require("../../controllers/client/authController");
const { validateRegister, validateLogin } = require("../../validations/authValidator");

router.post("/register", validateRegister, AuthController.register);
router.post("/login", validateLogin, AuthController.login);
router.get("/verify-email", AuthController.verifyEmail);
router.post("/google", AuthController.googleLogin);
router.post("/facebook", AuthController.facebookLogin);
module.exports = router;
