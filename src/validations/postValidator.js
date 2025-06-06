const validator = require("validator");

const validatePost = (req, res, next) => {
  const formData = {
    title: req.body.title,
    content: req.body.content,
    category: req.body.category,
    thumbnail: req.file,
    isScheduled: req.body.isScheduled === "true",
    publishAt: req.body.publishAt,
  };

  const errors = {};

  if (!formData.title || validator.isEmpty(formData.title.trim())) {
    errors.title = "Tiêu đề không được để trống";
  }

  if (!formData.content || formData.content.trim().length < 20) {
    errors.content = "Nội dung phải có ít nhất 20 ký tự";
  }

  if (!formData.category || isNaN(Number(formData.category))) {
    errors.category = "Danh mục không hợp lệ";
  }

  if (!formData.thumbnail) {
    errors.thumbnail = "Vui lòng chọn ảnh đại diện (thumbnail)";
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
