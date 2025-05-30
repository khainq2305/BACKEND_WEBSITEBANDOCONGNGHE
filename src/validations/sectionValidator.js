// src/validations/sectionValidator.js
const { HomeSection } = require('../models');
const { Op } = require('sequelize');

// Giữ đúng với ENUM định nghĩa ở model
const validTypes = [
  'productOnly',
  'productWithBanner',
  'productWithFilters',
  'fullBlock'
];

// Kiểm tra số nguyên >= 0
const isValidInteger = val => {
  const num = Number(val);
  return Number.isInteger(num) && num >= 0;
};

const validateSection = async (req, res, next) => {
  try {
    const {
      title,
      type,
      orderIndex,
      skuIds = '[]',
      bannersMetaJson = '[]',
      filters = '[]'
    } = req.body;

    const errors = [];

    // 1. Title
    if (!title || title.trim() === '') {
      errors.push({ field: 'title', message: 'Tiêu đề khối không được để trống!' });
    } else {
      const existed = await HomeSection.findOne({ where: { title: title.trim() } });
      if (existed) {
        errors.push({ field: 'title', message: 'Tiêu đề khối đã tồn tại!' });
      }
    }

    // 2. Type
    if (!validTypes.includes(type)) {
      errors.push({ field: 'type', message: 'Loại khối không hợp lệ!' });
    }

    // 3. OrderIndex
    if (!isValidInteger(orderIndex)) {
      errors.push({ field: 'orderIndex', message: 'Thứ tự phải là số nguyên không âm!' });
    }

    // 4. Parse JSON
    let parsedSkuIds = [], parsedBanners = [], parsedFilters = [];
    try {
      parsedSkuIds   = JSON.parse(skuIds);
      parsedBanners  = JSON.parse(bannersMetaJson);
      parsedFilters  = JSON.parse(filters);
    } catch {
      errors.push({ field: 'json', message: 'Dữ liệu JSON không hợp lệ!' });
    }

    // 5. Business rules
    if (type === 'productOnly' && parsedSkuIds.length === 0) {
      errors.push({ field: 'skuIds', message: 'Phải chọn ít nhất 1 sản phẩm!' });
    }
    if (type === 'productWithBanner' || type === 'fullBlock') {
      if (parsedBanners.length === 0) {
        errors.push({ field: 'banners', message: 'Phải có ít nhất 1 banner!' });
      }
    }
    if (type === 'productWithFilters' || type === 'fullBlock') {
      if (parsedFilters.length === 0) {
        errors.push({ field: 'filters', message: 'Phải có ít nhất 1 bộ lọc!' });
      }
    }

    // 6. Nếu có lỗi, trả về
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    next();
  } catch (err) {
    console.error('[validateSection]', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi validate section',
      error: err.message
    });
  }
};

module.exports = { validateSection };
