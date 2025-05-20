const validator = require("validator");


// Validate đăng ký
const validateRegister = (req, res, next) => {
  const { fullName, email, password } = req.body;

  if (!fullName || fullName.trim() === "") {
    return res.status(400).json({ message: "Họ tên không được để trống!" });
  }

  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ message: "Email không hợp lệ!" });
  }

  if (!password) {
    return res.status(400).json({ message: "Mật khẩu là bắt buộc!" });
  }

  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^+=])[A-Za-z\d@$!%*?&#^+=]{8,}$/;

  if (!strongPasswordRegex.test(password)) {
    return res.status(400).json({
      message:
        "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt!",
    });
  }

  next();
};


const validateOtp = (req, res, next) => {
  const { otp } = req.body;

  if (!otp || otp.trim() === "") {
    return res.status(400).json({ message: "Mã OTP không được để trống!" });
  }

  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: "Mã OTP không hợp lệ. Vui lòng nhập 6 chữ số!" });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || email.trim() === "") {
    return res.status(400).json({ message: "Email không được để trống!" });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: "Email không hợp lệ!" });
  }

  if (!password || password.trim() === "") {
    return res.status(400).json({ message: "Mật khẩu không được để trống!" });
  }

  next();
};

const validateForgotPassword = (req, res, next) => {
  const { email } = req.body;

  if (!email || email.trim() === "") {
    return res.status(400).json({ field: "email", message: "Email không được để trống!" });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ field: "email", message: "Email không hợp lệ!" });
  }

  next();
};

const validateResetPassword = (req, res, next) => {
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ message: "Mật khẩu không được để trống!" });
  }

  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^+=])[A-Za-z\d@$!%*?&#^+=]{8,}$/;

  if (!strongPasswordRegex.test(newPassword)) {
    return res.status(400).json({
      message:
        "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt!",
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: "Mật khẩu xác nhận không khớp!" });
  }

  next();
};
module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateOtp,
  validateResetPassword
};
