const validator = require('validator');

// Các loại hợp lệ cho type và targetType
const allowedTypes = ['system', 'promotion', 'order', 'news'];

// Chuyển đổi boolean từ string về boolean thực
const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
};

const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const validateCommonFields = (body, file, isCreate = true) => {
  const errors = [];

  if (!body.title || body.title.trim() === '') {
    errors.push({ field: 'title', message: 'Tiêu đề không được để trống!' });
  }

  if (body.message && body.message.trim() === '') {
    errors.push({ field: 'message', message: 'Nội dung không được để trống!' });
  }

  if (body.link && !validator.isURL(body.link)) {
    errors.push({ field: 'link', message: 'Link không hợp lệ!' });
  }

  if (body.targetId !== undefined && body.targetId !== null && body.targetId !== '') {
    if (!validator.isInt(body.targetId.toString(), { min: 0 })) {
      errors.push({ field: 'targetId', message: 'ID mục tiêu phải là số nguyên không âm!' });
    }
  }

  if (!body.type || !allowedTypes.includes(body.type)) {
    errors.push({ field: 'type', message: 'Loại thông báo không hợp lệ!' });
  }

  if (!body.targetType || !allowedTypes.includes(body.targetType)) {
    errors.push({ field: 'targetType', message: 'TargetType không hợp lệ!' });
  }

  const isGlobalParsed = parseBoolean(body.isGlobal);
  const isActiveParsed = parseBoolean(body.isActive);

  if (isGlobalParsed === undefined) {
    errors.push({ field: 'isGlobal', message: 'Trường isGlobal không hợp lệ!' });
  }

  if (isActiveParsed === undefined) {
    errors.push({ field: 'isActive', message: 'Trường isActive không hợp lệ!' });
  }

  if (body.startAt) {
    const startDate = new Date(body.startAt);
    if (isNaN(startDate.getTime())) {
      errors.push({ field: 'startAt', message: 'Ngày bắt đầu không hợp lệ!' });
    } else if (startDate < new Date()) {
      errors.push({ field: 'startAt', message: 'Ngày bắt đầu phải là thời gian tương lai!' });
    }
  }

  switch (body.type) {
    case 'order':
    case 'news':
      if (body.targetId === undefined || body.targetId === null || body.targetId === '' || isNaN(body.targetId)) {
        errors.push({ field: 'targetId', message: 'targetId là bắt buộc cho loại order/news!' });
      }
      break;
    case 'promotion':
      if (body.targetId === undefined || body.targetId === null || body.targetId === '' || isNaN(body.targetId)) {
        errors.push({ field: 'targetId', message: 'targetId là bắt buộc cho loại promotion!' });
      }
      if (!body.link || !validator.isURL(body.link)) {
        errors.push({ field: 'link', message: 'Link là bắt buộc và phải hợp lệ cho loại promotion!' });
      }
      break;
  }

  if (isGlobalParsed === false) {
    try {
      const parsedUserIds = JSON.parse(body.userIds);
      if (!Array.isArray(parsedUserIds) || parsedUserIds.length === 0) {
        errors.push({ field: 'userIds', message: 'Phải chọn ít nhất 1 người dùng khi không gửi toàn bộ!' });
      }
    } catch {
      errors.push({ field: 'userIds', message: 'Dữ liệu userIds không hợp lệ!' });
    }
  }

  if (isCreate) {
    if (!file) {
      errors.push({ field: 'image', message: 'Ảnh là bắt buộc!' });
    } else {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        errors.push({ field: 'image', message: 'Chỉ chấp nhận ảnh PNG, JPG, JPEG!' });
      }
      if (file.size > MAX_IMAGE_SIZE) {
        errors.push({ field: 'image', message: 'Ảnh tối đa 5MB!' });
      }
    }
  }

  return errors;
};

const createNotificationValidator = (req, res, next) => {
  const errors = validateCommonFields(req.body, req.file, true);
  if (errors.length > 0) return res.status(400).json({ errors });
  next();
};

const updateNotificationValidator = (req, res, next) => {
  const errors = validateCommonFields(req.body, req.file, false);
  if (errors.length > 0) return res.status(400).json({ errors });
  next();
};

module.exports = {
  createNotificationValidator,
  updateNotificationValidator
};
