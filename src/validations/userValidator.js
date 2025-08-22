// validations/userValidator.js
const validator = require("validator");

const createUserValidator = (req, res, next) => {
  const { email, password } = req.body;

  // Email bắt buộc & hợp lệ
  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({
      errors: [{ field: "email", message: "Email bắt buộc và phải hợp lệ!" }],
    });
  }

  // Password bắt buộc
  if (!password) {
    return res.status(400).json({
      errors: [{ field: "password", message: "Mật khẩu không được để trống!" }],
    });
  }

  // Password phải đủ mạnh
  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^+=])[A-Za-z\d@$!%*?&#^+=]{8,}$/;

  if (!strongPasswordRegex.test(password)) {
    return res.status(400).json({
      errors: [
        {
          field: "password",
          message:
            "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt!",
        },
      ],
    });
  }


  next();
};

module.exports = { createUserValidator };
