const validator = require("validator");

const validatePost = (req, res, next) => {
  const thumbnailUrl = req.file?.path || req.body.thumbnailUrl;
  const formData = {
    title: req.body.title,
    content: req.body.content,
    categoryId: req.body.categoryId,
    thumbnailUrl,
    isScheduled: req.body.isScheduled === "true",
    publishAt: req.body.publishAt,
  };
  console.table(req.body);
  console.log("req.file:", req.file);
console.log("req.body:", req.body);
  const errors = {};

  if (!formData.title || validator.isEmpty(formData.title.trim())) {
    errors.title = "Tiêu đề không được để trống";
  }

  if (!formData.content || formData.content.trim().length < 20) {
    errors.content = "Nội dung phải có ít nhất 20 ký tự";
  }

  if (!formData.categoryId || isNaN(Number(formData.categoryId))) {
    errors.categoryId = "Danh mục không hợp lệ";
  }

  if (!formData.thumbnailUrl) {
    errors.thumbnailUrl = "Vui lòng chọn ảnh đại diện hahaaaa (thumbnail)";
  }

  if (formData.isScheduled && (!formData.publishAt || validator.isEmpty(formData.publishAt))) {
    errors.publishAt = "Vui lòng chọn ngày xuất bản khi hẹn giờ";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = validatePost;
