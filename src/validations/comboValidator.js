const validator = require('validator');

const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const validateComboFields = (body, file, isCreate = true) => {
  const errors = [];

  if (!body.name || body.name.trim() === '') {
    errors.push({ field: 'name', message: 'Tên combo không được để trống!' });
  }

  if (!body.price || isNaN(body.price) || Number(body.price) <= 0) {
    errors.push({ field: 'price', message: 'Giá combo phải là số lớn hơn 0!' });
  }

  if (!body.quantity || isNaN(body.quantity) || Number(body.quantity) <= 0) {
    errors.push({ field: 'quantity', message: 'Số lượng combo phải lớn hơn 0!' });
  }

  // Kiểm tra comboSkus là mảng và có ít nhất 1 phần tử
  try {
    const parsedSkus = typeof body.comboSkus === 'string' ? JSON.parse(body.comboSkus) : body.comboSkus;
    if (!Array.isArray(parsedSkus) || parsedSkus.length === 0) {
      errors.push({ field: 'comboSkus', message: 'Cần chọn ít nhất một sản phẩm cho combo!' });
    }
  } catch {
    errors.push({ field: 'comboSkus', message: 'comboSkus không hợp lệ!' });
  }

  if (body.startAt && body.expiredAt) {
    const start = new Date(body.startAt);
    const end = new Date(body.expiredAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      errors.push({ field: 'expiredAt', message: 'Ngày bắt đầu hoặc ngày kết thúc không hợp lệ!' });
    } else if (end <= start) {
      errors.push({ field: 'expiredAt', message: 'Ngày hết hạn phải sau ngày bắt đầu!' });
    }
  }

  if (isCreate) {
    if (!file) {
      errors.push({ field: 'thumbnail', message: 'Ảnh đại diện là bắt buộc!' });
    } else {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        errors.push({ field: 'thumbnail', message: 'Ảnh phải là định dạng JPG, JPEG hoặc PNG!' });
      }
      if (file.size > MAX_IMAGE_SIZE) {
        errors.push({ field: 'thumbnail', message: 'Ảnh không được vượt quá 5MB!' });
      }
    }
  }

  return errors;
};

const createComboValidator = (req, res, next) => {
  const errors = validateComboFields(req.body, req.file, true);
  if (errors.length > 0) return res.status(400).json({ errors });
  next();
};

const updateComboValidator = (req, res, next) => {
  const errors = validateComboFields(req.body, req.file, false);
  if (errors.length > 0) return res.status(400).json({ errors });
  next();
};

module.exports = {
  createComboValidator,
  updateComboValidator
};
