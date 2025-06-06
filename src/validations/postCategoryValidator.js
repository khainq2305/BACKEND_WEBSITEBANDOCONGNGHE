const validator = require("validator");

const validatePostCategory = (req, res, next) => {
  const formData = {
    name: req.body.name,
    // parentId: req.body.parentId,
    // isActive: req.body.isActive,
    // description: req.body.description
  };

  const errors = {};

  // Tên danh mục
  if (!formData.name || validator.isEmpty(formData.name.trim())) {
  errors.name = "Tên danh mục không được để trống";
} else if (formData.name.trim().length < 2) {
  errors.name = "Tên danh mục phải có ít nhất 2 ký tự";
} else if (/[^a-zA-Z0-9\s-_À-ỹà-ỹ]/.test(formData.name)) {
  errors.name = "Tên danh mục không được chứa ký tự đặc biệt";
}


  

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = validatePostCategory;
