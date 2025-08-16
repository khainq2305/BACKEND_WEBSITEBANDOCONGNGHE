const { VariantValue } = require('../models');
const { Op } = require('sequelize');

const validateVariantValue = async (req, res, next) => {
  const { value, variantId, sortOrder } = req.body;
  const { id } = req.params;
  const errors = [];
  req.body.isActive = req.body.isActive === 'true';

  if (!value || value.trim() === '') {
    errors.push({ field: 'value', message: 'Giá trị không được để trống!' });
  } else {
    const whereClause = {
      value: value.trim(),
      variantId
    };
    if (id) whereClause.id = { [Op.ne]: id };

    const existing = await VariantValue.findOne({ where: whereClause });
    if (existing) {
      errors.push({ field: 'value', message: 'Giá trị đã tồn tại trong thuộc tính này!' });
    }
  }

  if (!variantId || isNaN(Number(variantId))) {
    errors.push({ field: 'variantId', message: 'Thuộc tính không hợp lệ!' });
  }

  if (typeof req.body.isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'Trạng thái phải là true hoặc false!' });
  }

  if (req.file && req.file.size > 5 * 1024 * 1024) {
    errors.push({ field: 'imageFile', message: 'Ảnh phải nhỏ hơn 5MB!' });
  }

if (sortOrder === undefined || sortOrder === null || isNaN(Number(sortOrder))) {
  errors.push({ field: 'sortOrder', message: 'Thứ tự phải là số!' });
} else if (Number(sortOrder) < 0) {
  errors.push({ field: 'sortOrder', message: 'Thứ tự phải phải hơn hoặc bằng 0' });
}


  if (req.body.variantType === 'image' && !req.file && !id) {
    errors.push({ field: 'imageFile', message: 'Ảnh không được để trống!' });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateVariantValue };
