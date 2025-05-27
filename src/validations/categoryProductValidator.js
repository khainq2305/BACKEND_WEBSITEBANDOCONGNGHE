const validator = require("validator");

const validateCategoryProduct = (req, res, next) => {
  const { name, orderIndex } = req.body;

  if (!name || name.trim() === "") {
    return res
      .status(400)
      .json({ field: "name", message: "Tên danh mục không được để trống!" });
  }

  if (!req.file) {
    return res
      .status(400)
      .json({ field: "thumbnail", message: "Vui lòng chọn ảnh đại diện!" });
  }

  if (req.file.size > 2 * 1024 * 1024) {
    return res
      .status(400)
      .json({ field: "thumbnail", message: "Ảnh không được vượt quá 2MB!" });
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


const validateCategoryUpdate = (req, res, next) => {
  const { name, orderIndex } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ field: "name", message: "Tên danh mục không được để trống!" });
  }

  // ảnh là tùy chọn khi edit
  if (req.file && req.file.size > 2 * 1024 * 1024) {
    return res.status(400).json({ field: "thumbnail", message: "Ảnh không được vượt quá 2MB!" });
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