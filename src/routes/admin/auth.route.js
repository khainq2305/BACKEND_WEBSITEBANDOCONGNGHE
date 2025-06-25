const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

const fs = require("fs");
const AuthController = require("../../controllers/admin/AuthController");

const { validateRegister, validateLogin, validateForgotPassword, validateResetPassword, validateUpdateProfile } = require("../../validations/authValidator");
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");
const { requireTurnstile } = require('../../middlewares/requireTurnstile')
router.post("/dang-nhap-dashboard", AuthController.login);
router.post("/dang-xuat", AuthController.logout)
router.get("/account-info",checkJWT, AuthController.getUserInfo);

module.exports = router