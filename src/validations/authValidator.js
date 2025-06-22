const validator = require("validator");

const path = require("path");

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
const validateUpdateProfile = (req, res, next) => {
  console.log("body:", req.body);
  console.log("file:", req.file);

  const { fullName, dateOfBirth, phone } = req.body;
  const errors = {};

  // Kiểm tra họ tên
  if (!fullName || fullName.trim() === "") {
    errors.fullName = "Họ tên không được để trống!";
  } else {
    const nameRegex = /^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơưẠ-ỹ\s]+$/;
    if (!nameRegex.test(fullName)) {
      errors.fullName = "Họ tên không được chứa ký tự đặc biệt!";
    }
  }

  // ✅ Kiểm tra số điện thoại
  if (phone) {
    const phoneRegex = /^(0|\+84)(3[2-9]|5[6|8|9]|7[0|6-9]|8[1-9]|9[0-9])[0-9]{7}$/;
    if (!phoneRegex.test(phone)) {
      errors.phone = "Số điện thoại không hợp lệ!";
    }
  }

  // Kiểm tra ngày sinh
  if (dateOfBirth) {
    const birthDate = new Date(dateOfBirth);
    const now = new Date();
    const maxDate = new Date(now.getFullYear() - 100, now.getMonth(), now.getDate());

    if (birthDate > now) {
      errors.dateOfBirth = "Ngày sinh không được lớn hơn ngày hiện tại!";
    } else if (birthDate < maxDate) {
      errors.dateOfBirth = "Tuổi không được vượt quá 100!";
    }
  }
  const file = req.file;
  if (file) {
    const allowedExt = [".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowedExt.includes(ext)) {
      errors.avatarImage = "Ảnh đại diện chỉ chấp nhận .jpg, .jpeg, .png!";
    }

    if (file.size > 5 * 1024 * 1024) {
      errors.avatarImage = "Ảnh đại diện không được vượt quá 5MB!";
    }
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};
module.exports = {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateOtp,
  validateResetPassword,
  validateUpdateProfile
};
