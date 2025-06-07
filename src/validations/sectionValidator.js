// src/validations/sectionValidator.js
const { HomeSection } = require("../models");
const { Op } = require("sequelize");

const validTypes = ["productOnly", "productWithBanner", "fullBlock"];

const isValidInteger = (val) => {
  const num = Number(val);
  return Number.isInteger(num) && num >= 0;
};

const validateSection = async (req, res, next) => {
  try {
    const {
      title,
      type,
      orderIndex,
      productIds = "[]", // Đổi từ skuIds thành productIds
      bannersMetaJson = "[]",
    } = req.body;

    const errors = [];
    const currentSectionSlugFromParams = req.params.slug;

    // --- Validation cho Title ---
    if (!title || title.trim() === "") {
      errors.push({
        field: "title",
        message: "Tiêu đề khối không được để trống!",
      });
    } else {
      const whereClauseForTitle = {
        title: title.trim(),
      };

      if (currentSectionSlugFromParams) {
        const currentSection = await HomeSection.findOne({
          where: { slug: currentSectionSlugFromParams },
          attributes: ['id']
        });
        if (currentSection) {
          whereClauseForTitle.id = { [Op.ne]: currentSection.id };
        }
      }

      const existedTitle = await HomeSection.findOne({ where: whereClauseForTitle });
      if (existedTitle) {
        errors.push({ field: "title", message: "Tiêu đề khối đã tồn tại!" });
      }
    }

    // --- Validation cho Type và OrderIndex ---
    if (!type || !validTypes.includes(type)) {
      errors.push({ field: "type", message: "Loại khối không hợp lệ hoặc bị thiếu!" });
    }

    if (orderIndex === undefined || orderIndex === null || !isValidInteger(orderIndex)) {
      errors.push({
        field: "orderIndex",
        message: "Thứ tự phải là số nguyên không âm và không được để trống!",
      });
    }

    // --- Parse dữ liệu từ JSON string ---
    let parsedProductIds = [];
    let parsedBannersMeta = [];
    try {
      parsedProductIds = JSON.parse(productIds); // Đổi từ skuIds
      if (!Array.isArray(parsedProductIds)) throw new Error("productIds must be an array string.");
    } catch (e) {
      errors.push({ field: "productIds", message: "Dữ liệu Sản phẩm không hợp lệ (phải là một chuỗi JSON của mảng)!" });
    }
    try {
      parsedBannersMeta = JSON.parse(bannersMetaJson);
      if (!Array.isArray(parsedBannersMeta)) throw new Error("bannersMetaJson must be an array string.");
    } catch (e) {
      errors.push({ field: "bannersMetaJson", message: "Dữ liệu Banner không hợp lệ (phải là một chuỗi JSON của mảng)!" });
    }

    // --- Validation logic dựa trên Type ---
    if (!errors.some(e => e.field === 'productIds' || e.field === 'type')) {
      if ((type === "productOnly" || type === "productWithBanner") && parsedProductIds.length === 0) {
        errors.push({
          field: "productIds", // Đổi từ skuIds
          message: "Với loại này, phải chọn ít nhất 1 sản phẩm!",
        });
      }
    }

    if (!errors.some(e => e.field === 'bannersMetaJson' || e.field === 'type')) {
      if (type === "productWithBanner" || type === "fullBlock") {
        const hasAnyBannerContent = parsedBannersMeta.some(b => b.existingImageUrl || b.hasNewFile);
      const bannerFiles = Array.isArray(req.files) ? req.files : [];

        const newBannersCountFromMeta = parsedBannersMeta.filter(b => b.hasNewFile === true || b.hasNewFile === 'true').length;

        if (!hasAnyBannerContent && bannerFiles.length === 0 && newBannersCountFromMeta === 0) {
          errors.push({ field: "banners", message: "Với loại này, phải có ít nhất 1 banner!" });
        } else if (newBannersCountFromMeta > bannerFiles.length) {
          errors.push({ field: "bannerFiles", message: `Khai báo ${newBannersCountFromMeta} banner mới nhưng chỉ tải lên ${bannerFiles.length} file.` });
        }
      }
    }

    // --- Trả về lỗi nếu có ---
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // --- Gắn dữ liệu đã parse vào request để controller sử dụng ---
    req.parsedBody = {
      parsedProductIds, // Đổi từ parsedSkuIds
      parsedBannersMeta
    };

    next();
  } catch (err) {
    console.error("[validateSection Error]", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi validate section",
      error: err.message,
    });
  }
};

module.exports = { validateSection };