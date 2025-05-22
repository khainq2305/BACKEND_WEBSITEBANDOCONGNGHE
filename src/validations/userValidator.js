const validator = require("validator");

const createUserValidator = (req, res, next) => {
  const { fullName, email, password, roleId, status, phone } = req.body;

  if (!fullName || fullName.trim() === "") {
    return res.status(400).json({ errors: [{ field: "fullName", message: "Họ tên không được để trống!" }] });
  }

  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ errors: [{ field: "email", message: "Email không hợp lệ!" }] });
  }

  if (!password) {
    return res.status(400).json({ errors: [{ field: "password", message: "Mật khẩu không được để trống!" }] });
  }

  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^+=])[A-Za-z\d@$!%*?&#^+=]{8,}$/;

  if (!strongPasswordRegex.test(password)) {
    return res.status(400).json({
      errors: [{
        field: "password",
        message: "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt!"
      }]
    });
  }

  if (!roleId || isNaN(roleId) || parseInt(roleId) < 1) {
    return res.status(400).json({ errors: [{ field: "roleId", message: "Vai trò không hợp lệ!" }] });
  }

  if (status !== undefined && ![0, 1].includes(parseInt(status))) {
    return res.status(400).json({ errors: [{ field: "status", message: "Trạng thái phải là 0 hoặc 1!" }] });
  }

  if (phone && !validator.isMobilePhone(phone, "vi-VN")) {
    return res.status(400).json({ errors: [{ field: "phone", message: "Số điện thoại không hợp lệ!" }] });
  }

  next(); 
};

module.exports = { createUserValidator };
