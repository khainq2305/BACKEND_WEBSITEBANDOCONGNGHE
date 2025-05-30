const { Variant } = require('../models');

const allowedTypes = ['text', 'image', 'color', 'dropdown', 'size'];

const validateVariant = async (req, res, next) => {
  const { name, type, isActive } = req.body;
  const { id } = req.params; 
  const errors = [];

  if (!name || name.trim() === '') {
    errors.push({ field: 'name', message: 'Tên thuộc tính không được để trống!' });
  } else {
    const whereClause = { name: name.trim() };
    if (id) whereClause.id = { [require('sequelize').Op.ne]: id };

    const existing = await Variant.findOne({ where: whereClause });
    if (existing) {
      errors.push({ field: 'name', message: 'Tên thuộc tính đã tồn tại!' });
    }
  }

  if (!type || !allowedTypes.includes(type)) {
    errors.push({ field: 'type', message: 'Kiểu thuộc tính không hợp lệ!' });
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    errors.push({ field: 'isActive', message: 'Trạng thái phải là true hoặc false!' });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateVariant };
