const { Coupon } = require("../models");
const validator = require("validator");

const validateCreateCoupon = async (req, res, next) => {
  const {
    code,
    title,
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

  // 1. Bắt buộc nhập
  if (!code || typeof code !== "string" || code.trim() === "") {
    errors.push({ field: "code", message: "Mã không được để trống" });
  }

  if (!title || typeof title !== "string" || title.trim() === "") {
    errors.push({ field: "title", message: "Tiêu đề không được để trống" });
  }

  if (!discountType) {
    errors.push({ field: "discountType", message: "Loại giảm giá là bắt buộc" });
  }

  if (discountValue === undefined || discountValue === "") {
    errors.push({ field: "discountValue", message: "Giá trị giảm là bắt buộc" });
  }

  if (totalQuantity === undefined || totalQuantity === "") {
    errors.push({ field: "totalQuantity", message: "Tổng số lượng là bắt buộc" });
  }

  if (maxUsagePerUser === undefined || maxUsagePerUser === "") {
    errors.push({ field: "maxUsagePerUser", message: "Số lần dùng mỗi người là bắt buộc" });
  }

  if (minOrderValue === undefined || minOrderValue === "") {
    errors.push({ field: "minOrderValue", message: "Giá trị đơn hàng tối thiểu là bắt buộc" });
  }

  if (maxDiscountValue === undefined || maxDiscountValue === "") {
    errors.push({ field: "maxDiscountValue", message: "Giá trị giảm tối đa là bắt buộc" });
  }

  if (!startTime || typeof startTime !== "string") {
    errors.push({ field: "startTime", message: "Ngày bắt đầu là bắt buộc" });
  }

  if (!endTime || typeof endTime !== "string") {
    errors.push({ field: "endTime", message: "Ngày kết thúc là bắt buộc" });
  }

  // Nếu có lỗi để trống => trả lỗi luôn, không kiểm tra tiếp
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  // 2. Kiểm tra hợp lệ chi tiết
  if (!["percent", "amount"].includes(discountType)) {
    errors.push({ field: "discountType", message: "Loại giảm giá không hợp lệ" });
  }

  if (isNaN(discountValue) || Number(discountValue) <= 0) {
    errors.push({ field: "discountValue", message: "Giá trị giảm không hợp lệ" });
  }

  if (isNaN(totalQuantity) || Number(totalQuantity) <= 0) {
    errors.push({ field: "totalQuantity", message: "Tổng số lượng không hợp lệ" });
  }

  if (isNaN(maxUsagePerUser) || Number(maxUsagePerUser) <= 0) {
    errors.push({ field: "maxUsagePerUser", message: "Số lần dùng mỗi người không hợp lệ" });
  }

  if (isNaN(minOrderValue) || Number(minOrderValue) < 0) {
    errors.push({ field: "minOrderValue", message: "Giá trị đơn hàng tối thiểu không hợp lệ" });
  }

  if (isNaN(maxDiscountValue) || Number(maxDiscountValue) < 0) {
    errors.push({ field: "maxDiscountValue", message: "Giá trị giảm tối đa không hợp lệ" });
  }

  if (!validator.isISO8601(startTime) && !errors.find(e => e.field === 'startTime')) {
  errors.push({ field: "startTime", message: "Ngày bắt đầu không hợp lệ" });
}

if (!validator.isISO8601(endTime) && !errors.find(e => e.field === 'endTime')) {
  errors.push({ field: "endTime", message: "Ngày kết thúc không hợp lệ" });
}

if (
  validator.isISO8601(startTime) &&
  validator.isISO8601(endTime) &&
  new Date(startTime) > new Date(endTime)
) {
  errors.push({ field: "endTimeOrder", message: "Ngày kết thúc phải sau ngày bắt đầu" });
}



  // 3. Kiểm tra mã trùng (nếu đã nhập mã)
  const existing = await Coupon.findOne({ where: { code } });
  if (existing) {
    errors.push({ field: "code", message: "Mã giảm giá đã tồn tại" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateCreateCoupon };
