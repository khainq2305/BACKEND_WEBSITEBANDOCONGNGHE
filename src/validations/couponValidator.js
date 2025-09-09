const { Coupon } = require("../models");
const validator = require("validator");
const { Op } = require("sequelize");

const validateCoupon = async (req, res, next) => {
  const {
    code,
    title,
    type,
    discountType,
    discountValue,
    startTime,
    endTime,
    totalQuantity,
    maxUsagePerUser,
    minOrderValue,
    maxDiscountValue,
    userIds = [],
    productIds = [],
    categoryIds = [],
  } = req.body;

  const errors = [];
  const isUpdate = !!req.params.id;
  const currentId = req.params.id;

  if (!code || typeof code !== "string" || code.trim() === "") {
    errors.push({ field: "code", message: "Mã không được để trống" });
  }

  if (!title || typeof title !== "string" || title.trim() === "") {
    errors.push({ field: "title", message: "Tiêu đề không được để trống" });
  }

  if (!type || !["discount", "shipping"].includes(type)) {
    errors.push({ field: "type", message: "Loại voucher không hợp lệ" });
  }

  const parsedMaxUsagePerUser = (maxUsagePerUser !== null && maxUsagePerUser !== undefined && maxUsagePerUser !== '') ? Number(String(maxUsagePerUser).replace(/[^0-9]/g, '')) : null;
  if (parsedMaxUsagePerUser !== null && (isNaN(parsedMaxUsagePerUser) || parsedMaxUsagePerUser < 0)) {
    errors.push({
      field: "maxUsagePerUser",
      message: "Số lần dùng mỗi người không hợp lệ",
    });
  }

  const parsedMinOrderValue = (minOrderValue !== null && minOrderValue !== undefined && minOrderValue !== '') ? Number(String(minOrderValue).replace(/[^0-9]/g, '')) : null;
  if (parsedMinOrderValue === null && type === "discount") {
    errors.push({
      field: "minOrderValue",
      message: "Giá trị đơn hàng tối thiểu là bắt buộc",
    });
  }

  if (parsedMinOrderValue !== null && (isNaN(parsedMinOrderValue) || parsedMinOrderValue < 0)) {
    errors.push({
      field: "minOrderValue",
      message: "Giá trị đơn hàng tối thiểu không hợp lệ",
    });
  }

  if (!startTime || typeof startTime !== "string") {
    errors.push({ field: "startTime", message: "Ngày bắt đầu là bắt buộc" });
  }

  if (!endTime || typeof endTime !== "string") {
    errors.push({ field: "endTime", message: "Ngày kết thúc là bắt buộc" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const parsedDiscountValue = (discountValue !== null && discountValue !== undefined && discountValue !== '') ? Number(String(discountValue).replace(/[^0-9]/g, '')) : null;
  const parsedMaxDiscountValue = (maxDiscountValue !== null && maxDiscountValue !== undefined && maxDiscountValue !== '') ? Number(String(maxDiscountValue).replace(/[^0-9]/g, '')) : null;

  if (type === "discount") {
    if (parsedDiscountValue === null || isNaN(parsedDiscountValue) || parsedDiscountValue <= 0) {
      errors.push({
        field: "discountValue",
        message: "Giá trị giảm phải lớn hơn 0",
      });
    }

    if (!["percent", "amount"].includes(discountType)) {
      errors.push({
        field: "discountType",
        message: "Loại giảm giá phải là phần trăm hoặc cố định",
      });
    }

    if (discountType === "percent" && parsedDiscountValue > 100) {
      errors.push({
        field: "discountValue",
        message: "Phần trăm giảm không được vượt quá 100%",
      });
    }

    if (discountType === "percent") {
      if (parsedMaxDiscountValue !== null && (isNaN(parsedMaxDiscountValue) || parsedMaxDiscountValue < 0)) {
        errors.push({
          field: "maxDiscountValue",
          message: "Giá trị giảm tối đa không hợp lệ",
        });
      }
    }
  }

  if (type === "shipping") {
   if (parsedDiscountValue !== null && (isNaN(parsedDiscountValue) || parsedDiscountValue < 0)) {
        errors.push({
            field: "discountValue",
            message: "Mức hỗ trợ phí ship phải >= 0 (0 = miễn phí toàn phần)",
        });
    }
    if (discountType) {
      errors.push({
        field: "discountType",
        message: "Voucher phí ship không cần loại giảm giá",
      });
    }
    if (parsedMaxDiscountValue !== null && parsedMaxDiscountValue > 0) {
      errors.push({
        field: "maxDiscountValue",
        message: "Miễn phí vận chuyển không cần nhập giảm tối đa",
      });
    }
  }

  const parsedTotalQuantity = (totalQuantity !== null && totalQuantity !== undefined && totalQuantity !== '') ? Number(String(totalQuantity).replace(/[^0-9]/g, '')) : null;
  if (parsedTotalQuantity !== null && (isNaN(parsedTotalQuantity) || parsedTotalQuantity < 0)) {
    errors.push({
      field: "totalQuantity",
      message: "Tổng số lượng không hợp lệ",
    });
  }

  if (req.body.visibility === "private" && (!Array.isArray(userIds) || userIds.length === 0)) {
    errors.push({
      field: "userIds",
      message: "Phải chọn người dùng cho coupon private",
    });
  }

  if (req.body.applyScope === "product" && (!Array.isArray(productIds) || productIds.length === 0)) {
    errors.push({
      field: "productIds",
      message: "Phải chọn ít nhất 1 sản phẩm khi scope = product",
    });
  }

  if (!validator.isISO8601(startTime) && !errors.find((e) => e.field === "startTime")) {
    errors.push({ field: "startTime", message: "Ngày bắt đầu không hợp lệ" });
  }

  if (!validator.isISO8601(endTime) && !errors.find((e) => e.field === "endTime")) {
    errors.push({ field: "endTime", message: "Ngày kết thúc không hợp lệ" });
  }

  if (validator.isISO8601(startTime) && validator.isISO8601(endTime) && new Date(startTime) > new Date(endTime)) {
    errors.push({
      field: "endTime",
      message: "Ngày kết thúc phải sau ngày bắt đầu",
    });
  }

  const existing = await Coupon.findOne({
    where: {
      code,
      ...(isUpdate ? { id: { [Op.ne]: currentId } } : {}),
    },
  });
  if (existing) {
    errors.push({ field: "code", message: "Mã giảm giá đã tồn tại" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateCoupon };