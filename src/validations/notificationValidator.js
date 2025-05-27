const validator = require('validator');

const allowedTypes = ['system', 'promotion', 'order', 'news'];

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
};

const validateCommonFields = (body, file, isCreate = true) => {
  const errors = [];

  if (!body.title || body.title.trim() === '') {
    errors.push({ field: 'title', message: 'Tiêu đề không được để trống!' });
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

  // Validate boolean fields
  const isGlobalParsed = parseBoolean(body.isGlobal);
  const isActiveParsed = parseBoolean(body.isActive);

  if (isGlobalParsed === undefined) {
    errors.push({ field: 'isGlobal', message: 'Trường isGlobal không hợp lệ!' });
  }

  if (isActiveParsed === undefined) {
    errors.push({ field: 'isActive', message: 'Trường isActive không hợp lệ!' });
  }

  // Validate theo type
  switch (body.type) {
    case 'order':
    case 'news':
      if (!body.targetId || isNaN(body.targetId)) {
        errors.push({ field: 'targetId', message: 'targetId là bắt buộc cho loại order/news!' });
      }
      break;
    case 'promotion':
      if (!body.targetId || isNaN(body.targetId)) {
        errors.push({ field: 'targetId', message: 'targetId là bắt buộc cho loại promotion!' });
      }
      if (!body.link || !validator.isURL(body.link)) {
        errors.push({ field: 'link', message: 'Link là bắt buộc và phải hợp lệ cho loại promotion!' });
      }
      break;
  }

  // Validate ảnh khi tạo mới
  if (isCreate && !file) {
    errors.push({ field: 'image', message: 'Ảnh là bắt buộc!' });
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
