const { Banner } = require("../models");
const validator = require("validator");
const path = require("path");
const slugify = require("slugify");
const { Op } = require("sequelize");

const validateBanner = async (req, res, next) => {
  const { title, type, startDate, endDate, displayOrder } = req.body;

  const errors = [];
  const isEdit = !!req.params?.slug;
  let currentBannerId = null;

  if (isEdit) {
    const existingBanner = await Banner.findOne({
      where: { slug: req.params.slug },
    });
    if (!existingBanner) {
      return res.status(404).json({ message: "Không tìm thấy banner cần sửa" });
    }
    currentBannerId = existingBanner.id;
  }

  if (!title || typeof title !== "string" || !title.trim()) {
    errors.push({ field: "title", message: "Tiêu đề không được để trống" });
  }

  if (!type || typeof type !== "string" || !type.trim()) {
    errors.push({ field: "type", message: "Loại hiển thị là bắt buộc" });
  }

  if (displayOrder !== undefined && isNaN(Number(displayOrder))) {
    errors.push({
      field: "displayOrder",
      message: "Thứ tự hiển thị phải là số",
    });
  }

  // === 2. Ngày
  const isValidStart = startDate && validator.isISO8601(startDate);
  const isValidEnd = endDate && validator.isISO8601(endDate);

 if (startDate) {
  if (!isValidStart) {
    errors.push({ field: "startDate", message: "Ngày bắt đầu không hợp lệ" });
} else {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // reset về 00:00 hôm nay

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0); // reset giờ startDate để so sánh theo ngày

  if (start < now) {
    errors.push({
      field: "startDate",
      message: "Ngày bắt đầu không được nằm trong quá khứ",
    });
  }
}

}


  if (endDate && !isValidEnd) {
    errors.push({ field: "endDate", message: "Ngày kết thúc không hợp lệ" });
  }

  if (isValidStart && isValidEnd && new Date(startDate) > new Date(endDate)) {
    errors.push({
      field: "endDate",
      message: "Ngày kết thúc phải sau ngày bắt đầu",
    });
  }

  if (!isEdit && (!req.file || !req.file.path)) {
    errors.push({ field: "image", message: "Vui lòng chọn ảnh banner" });
  }

  if (req.file && req.file.originalname) {
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      errors.push({
        field: "image",
        message: "Chỉ chấp nhận định dạng ảnh .jpg, .jpeg hoặc .png",
      });
    }
  }

  const slug = slugify(title.trim(), { lower: true, strict: true });
  const slugCheckWhere = { slug };

  if (isEdit && currentBannerId) {
    slugCheckWhere.id = { [Op.ne]: currentBannerId };
  }

  const existing = await Banner.findOne({ where: slugCheckWhere });
  if (existing) {
    errors.push({ field: "title", message: "Tiêu đề đã tồn tại" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateBanner };
