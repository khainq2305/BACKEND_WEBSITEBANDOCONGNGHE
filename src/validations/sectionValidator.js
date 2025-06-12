const { HomeSection } = require("../models");
const { Op } = require("sequelize");
const validator = require("validator");

const validTypes = ["productOnly", "productWithBanner", "fullBlock"];
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp"];

const MAX_MB = 5;

const validateSection = async (req, res, next) => {
  try {
    const {
      title,
      type,
      orderIndex,
      productIds = "[]",
      bannersMetaJson = "[]",
    } = req.body;

    const errors = [];
    const slugParam = req.params.slug;

    // --- Title ---
    if (validator.isEmpty(title || '')) {
      errors.push({ field: "title", message: "Tiêu đề khối không được để trống!" });
    } else {
      const where = { title: title.trim() };
      if (slugParam) {
        const currentSection = await HomeSection.findOne({ where: { slug: slugParam }, attributes: ['id'] });
        if (currentSection) where.id = { [Op.ne]: currentSection.id };
      }

      const existed = await HomeSection.findOne({ where });
      if (existed) errors.push({ field: "title", message: "Tiêu đề khối đã tồn tại!" });
    }

    // --- Type ---
    if (!validTypes.includes(type)) {
      errors.push({ field: "type", message: "Loại khối không hợp lệ hoặc bị thiếu!" });
    }

    // --- orderIndex ---
    if (!validator.isInt(String(orderIndex), { min: 0 })) {
      errors.push({ field: "orderIndex", message: "Thứ tự phải là số nguyên không âm!" });
    }

    // --- Parse JSON ---
    let parsedProductIds = [];
    let parsedBannersMeta = [];

    if (!validator.isJSON(productIds)) {
      errors.push({ field: "productIds", message: "productIds phải là chuỗi JSON của mảng!" });
    } else {
      parsedProductIds = JSON.parse(productIds);
      if (!Array.isArray(parsedProductIds)) {
        errors.push({ field: "productIds", message: "productIds phải là mảng!" });
      }
    }

    if (!validator.isJSON(bannersMetaJson)) {
      errors.push({ field: "bannersMetaJson", message: "Dữ liệu banner phải là chuỗi JSON mảng!" });
    } else {
      parsedBannersMeta = JSON.parse(bannersMetaJson);
      if (!Array.isArray(parsedBannersMeta)) {
        errors.push({ field: "bannersMetaJson", message: "Banner phải là mảng!" });
      }
    }

    if ((type === 'productOnly' || type === 'productWithBanner') && parsedProductIds.length === 0) {
      errors.push({ field: "productIds", message: "Phải chọn ít nhất 1 sản phẩm!" });
    }

    if (type === "productWithBanner" || type === "fullBlock") {
      const bannerFiles = req.files || [];
      const hasContent = parsedBannersMeta.some(b => b.existingImageUrl || b.hasNewFile);
      const newBannerCount = parsedBannersMeta.filter(b => b.hasNewFile).length;

      if (!hasContent && bannerFiles.length === 0) {
        errors.push({ field: "banners", message: "Cần ít nhất 1 banner!" });
      }

      if (newBannerCount > bannerFiles.length) {
        errors.push({
          field: "bannerFiles",
          message: `Có ${newBannerCount} banner cần upload nhưng chỉ có ${bannerFiles.length} file.`,
        });
      }

      // ✅ Validate file định dạng và dung lượng
      bannerFiles.forEach((file, idx) => {
        const { originalname, mimetype, size } = file;
        const sizeMB = size / (1024 * 1024);

        if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
          errors.push({
            field: `banners.${idx}`,
            message: `File ${originalname} không đúng định dạng! Chỉ chấp nhận: JPG, JPEG, PNG.`,
          });
        }

        if (sizeMB > MAX_MB) {
          errors.push({
            field: `banners.${idx}`,
            message: `File ${originalname} vượt quá ${MAX_MB}MB!`,
          });
        }
      });
    }

    // --- Trả lỗi nếu có ---
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    req.parsedBody = {
      parsedProductIds,
      parsedBannersMeta,
    };

    next();
  } catch (err) {
    console.error("[validateSection Error]", err.stack || err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi validate section",
      error: err.message,
    });
  }
};

module.exports = { validateSection };
