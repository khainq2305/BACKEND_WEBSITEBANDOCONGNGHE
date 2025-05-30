// src/validators/validateHighlightedCategoryItem.js
const { HighlightedCategoryItem } = require('../models');
const { Op } = require('sequelize');

// Regex kiểm tra URL đơn giản
const urlRegex = /^(https?:\/\/)[\w\-]+(\.[\w\-]+)+[/#?]?.*$/;

// Max file size (5MB)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// Kiểm tra đuôi file ảnh hợp lệ
const isValidImageType = (mimetype) =>
  ['image/jpeg', 'image/png', 'image/jpg'].includes(mimetype);

const validateHighlightedCategoryItem = async (req, res, next) => {
  const {
    customTitle,
    customLink,
    sortOrder,
    categoryId,
    isActive
  } = req.body;

  const errors = [];
  const isCreate = req.method === 'POST';
  const isUpdate = req.method === 'PUT';
  const file = req.file;
  console.log('✅ req.file:', req.file);
console.log('✅ req.body:', req.body);

  const id = req.params?.id;

  // ✅ customTitle: bắt buộc
  if (!customTitle || customTitle.trim() === '') {
    errors.push({
      field: 'customTitle',
      message: 'Tiêu đề là bắt buộc!',
    });
  } else {
    // Kiểm tra customTitle đã tồn tại
    const whereClause = {
      customTitle: customTitle.trim()
    };
    if (isUpdate && id) {
      whereClause.id = { [Op.ne]: id };
    }

    const existing = await HighlightedCategoryItem.findOne({ where: whereClause });
    if (existing) {
      errors.push({
        field: 'customTitle',
        message: 'Tiêu đề này đã tồn tại!',
      });
    }
  }

  // ✅ categoryId: bắt buộc và là số
  if (!categoryId || isNaN(parseInt(categoryId, 10))) {
    errors.push({
      field: 'categoryId',
      message: 'Vui lòng chọn danh mục hợp lệ!',
    });
  }

  

  // ✅ sortOrder: nếu có phải là số nguyên ≥ 0
  if (
    sortOrder !== undefined &&
    (isNaN(parseInt(sortOrder, 10)) || parseInt(sortOrder, 10) < 0)
  ) {
    errors.push({
      field: 'sortOrder',
      message: 'Thứ tự hiển thị phải là số nguyên không âm!',
    });
  }

  // ✅ isActive: nếu có phải là boolean
  if (isActive !== undefined && !(isActive === 'true' || isActive === 'false' || typeof isActive === 'boolean')) {
    errors.push({
      field: 'isActive',
      message: 'Trạng thái phải là true hoặc false!',
    });
  }

  // ✅ Kiểm tra ảnh nếu gửi lên
  if (isCreate && !file) {
    errors.push({
      field: 'imageUrl',
      message: 'Ảnh đại diện là bắt buộc!',
    });
  }

  if (file) {
    if (!isValidImageType(file.mimetype)) {
      errors.push({
        field: 'imageUrl',
        message: 'Chỉ chấp nhận ảnh định dạng JPG, JPEG hoặc PNG!',
      });
    }

    if (file.size > MAX_IMAGE_SIZE) {
      errors.push({
        field: 'imageUrl',
        message: 'Ảnh phải nhỏ hơn 5MB!',
      });
    }
  }

  // Nếu có lỗi thì trả về
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateHighlightedCategoryItem };
