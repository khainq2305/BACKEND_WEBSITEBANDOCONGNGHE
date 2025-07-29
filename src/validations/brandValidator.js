const { Brand } = require('../models');
const { Op } = require('sequelize');

const validateBrand = async (req, res, next) => {
  const { name, description } = req.body;
  let isActive = req.body.isActive;
  const file = req.file;
  const slug = req.params.slug;
  let excludeId = null;

  if (req.method === 'PUT' && slug) {
    const brand = await Brand.findOne({ where: { slug }, paranoid: false });
    if (brand) {
      excludeId = brand.id;
    }
  }

  if (!name || name.trim() === '') {
    return res.status(400).json({ field: 'name', message: 'Tên thương hiệu không được để trống!' });
  }

  const existing = await Brand.findOne({
    where: {
      name: name.trim(),
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {})
    },
    paranoid: false
  });

  if (existing) {
    return res.status(400).json({ field: 'name', message: 'Tên thương hiệu đã tồn tại!' });
  }

  if (description && typeof description !== 'string') {
    return res.status(400).json({ field: 'description', message: 'Mô tả phải là một chuỗi!' });
  }

  
  if (isActive !== undefined) {
    const validStatus = ['1', '0', 1, 0, true, false, 'true', 'false'];
    if (!validStatus.includes(isActive)) {
      return res.status(400).json({ field: 'isActive', message: 'Trạng thái phải là 1 (hiển thị) hoặc 0 (ẩn)' });
    }
    req.body.isActive = ['1', 1, true, 'true'].includes(isActive) ? 1 : 0;
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
  const maxSize = 5 * 1024 * 1024;

  if (req.method === 'POST' && file) {
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ field: 'logoUrl', message: 'Chỉ chấp nhận ảnh PNG, JPG, JPEG' });
    }
    if (file.size > maxSize) {
      return res.status(400).json({ field: 'logoUrl', message: 'Dung lượng ảnh tối đa là 5MB' });
    }
  }

  if (req.method === 'PUT' && file) {
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ field: 'logoUrl', message: 'Chỉ chấp nhận ảnh PNG, JPG, JPEG' });
    }
    if (file.size > maxSize) {
      return res.status(400).json({ field: 'logoUrl', message: 'Dung lượng ảnh tối đa là 5MB' });
    }
  }

  next();
};

module.exports = {
  validateBrand,
};
