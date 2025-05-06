const validator = require("validator");

// Validate đăng ký
const validateRegister = (req, res, next) => {
  const { email, password } = req.body;

  // Không còn check fullName nữa
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

// Validate đăng nhập
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ message: "Email không hợp lệ!" });
  }

  if (!password || validator.isEmpty(password)) {
    return res.status(400).json({ message: "Mật khẩu là bắt buộc!" });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
};
