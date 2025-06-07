const validator = require("validator");
const { Category } = require("../models");
const { Op } = require("sequelize");

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Middleware kiểm tra dữ liệu khi tạo mới Category
 */
const validateCategoryProduct = async (req, res, next) => {
  const { name, orderIndex } = req.body;

  // 1. Bắt lỗi nếu tên rỗng
  if (!name || name.trim() === "") {
    return res.status(400).json({ field: "name", message: "Tên danh mục không được để trống!" });
  }

  // 2. Kiểm tra xem đã tồn tại tên cùng tên (chưa xóa mềm) chưa
  const existed = await Category.findOne({
    where: {
      name: name.trim(),
      deletedAt: null
    },
    paranoid: false
  });
  if (existed) {
    return res.status(400).json({ field: "name", message: "Tên danh mục đã tồn tại!" });
  }

  // 3. Bắt lỗi nếu không có ảnh upload
  if (!req.file) {
    return res.status(400).json({ field: "thumbnail", message: "Vui lòng chọn ảnh đại diện!" });
  }

  // 4. Bắt lỗi nếu ảnh vượt quá 5MB
  if (req.file.size > MAX_IMAGE_SIZE) {
    return res.status(400).json({ field: "thumbnail", message: "Ảnh không được vượt quá 5MB!" });
  }

  // 5. Nếu có orderIndex, bắt buộc phải là số nguyên không âm
  if (orderIndex !== undefined && orderIndex !== null) {
    const strValue = orderIndex.toString();
    if (!validator.isInt(strValue, { min: 0 })) {
      return res.status(400).json({
        field: "orderIndex",
        message: "Thứ tự phải là số nguyên không âm!",
      });
    }
  }

  // Nếu qua hết, gọi tiếp controller
  next();
};


/**
 * Middleware kiểm tra dữ liệu khi cập nhật Category (PUT /:slug)
 * Ở đây req.params.id chính là slug của Category cần sửa
 */
const validateCategoryUpdate = async (req, res, next) => {
  const { name, orderIndex } = req.body;
  const slugParam = req.params.id; // slug của category đang muốn update

  // 1. Bắt lỗi nếu tên rỗng
  if (!name || name.trim() === "") {
    return res.status(400).json({ field: "name", message: "Tên danh mục không được để trống!" });
  }

  // 2. Tìm chính bản ghi gốc dựa trên slug để biết numeric ID
  const originalCategory = await Category.findOne({
    where: { slug: slugParam },
    paranoid: false
  });
  if (!originalCategory) {
    return res.status(404).json({ message: "Không tìm thấy danh mục muốn cập nhật." });
  }

  // 3. Kiểm tra xem có bản ghi khác (không phải chính nó) đang dùng chung tên không?
  const existed = await Category.findOne({
    where: {
      name: name.trim(),
      id: { [Op.ne]: originalCategory.id }, // loại trừ chính record này
      deletedAt: null
    },
    paranoid: false
  });
  if (existed) {
    return res.status(400).json({ field: "name", message: "Tên danh mục đã tồn tại!" });
  }

  // 4. Nếu upload file mới, kiểm tra kích thước (nếu có)
  if (req.file && req.file.size > MAX_IMAGE_SIZE) {
    return res.status(400).json({ field: "thumbnail", message: "Ảnh không được vượt quá 5MB!" });
  }

  // 5. Nếu có orderIndex, bắt buộc phải là số nguyên không âm
  if (orderIndex !== undefined && !validator.isInt(orderIndex.toString(), { min: 0 })) {
    return res.status(400).json({ field: "orderIndex", message: "Thứ tự phải là số nguyên không âm!" });
  }

  // Tất cả hợp lệ → chuyển tiếp sang controller
  next();
};


module.exports = {
  validateCategoryProduct,
  validateCategoryUpdate,
};
