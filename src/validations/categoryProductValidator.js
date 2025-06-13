const validator = require("validator");
const { Category } = require("../models");
const { Op } = require("sequelize");

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const validateCategoryProduct = async (req, res, next) => {
  const { name, orderIndex } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ field: "name", message: "Tên danh mục không được để trống!" });
  }
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

  if (!req.file) {
    return res.status(400).json({ field: "thumbnail", message: "Vui lòng chọn ảnh đại diện!" });
  }


  if (req.file.size > MAX_IMAGE_SIZE) {
    return res.status(400).json({ field: "thumbnail", message: "Ảnh không được vượt quá 5MB!" });
  }


  if (orderIndex !== undefined && orderIndex !== null) {
    const strValue = orderIndex.toString();
    if (!validator.isInt(strValue, { min: 0 })) {
      return res.status(400).json({
        field: "orderIndex",
        message: "Thứ tự phải là số nguyên không âm!",
      });
    }
  }
  next();
};
const validateCategoryUpdate = async (req, res, next) => {
  const { name, orderIndex } = req.body;
  const slugParam = req.params.id;
  if (!name || name.trim() === "") {
    return res.status(400).json({ field: "name", message: "Tên danh mục không được để trống!" });
  }
  const originalCategory = await Category.findOne({
    where: { slug: slugParam },
    paranoid: false
  });
  if (!originalCategory) {
    return res.status(404).json({ message: "Không tìm thấy danh mục muốn cập nhật." });
  }

  const existed = await Category.findOne({
    where: {
      name: name.trim(),
      id: { [Op.ne]: originalCategory.id }, 
      deletedAt: null
    },
    paranoid: false
  });
  if (existed) {
    return res.status(400).json({ field: "name", message: "Tên danh mục đã tồn tại!" });
  }
  if (req.file && req.file.size > MAX_IMAGE_SIZE) {
    return res.status(400).json({ field: "thumbnail", message: "Ảnh không được vượt quá 5MB!" });
  }
  if (orderIndex !== undefined && !validator.isInt(orderIndex.toString(), { min: 0 })) {
    return res.status(400).json({ field: "orderIndex", message: "Thứ tự phải là số nguyên không âm!" });
  }
  next();
};


module.exports = {
  validateCategoryProduct,
  validateCategoryUpdate,
};
