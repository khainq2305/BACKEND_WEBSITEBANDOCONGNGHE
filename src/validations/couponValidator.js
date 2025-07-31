const { Coupon } = require("../models");
const validator = require("validator");
const { Op } = require("sequelize");

const validateCoupon = async (req, res, next) => {
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
  const isUpdate = !!req.params.id;
  const currentId = req.params.id;

  // 1. Validate required
  if (!code || typeof code !== "string" || code.trim() === "") {
    errors.push({ field: "code", message: "Mã không được để trống" });
  }

  if (!title || typeof title !== "string" || title.trim() === "") {
    errors.push({ field: "title", message: "Tiêu đề không được để trống" });
  }

  if (!discountType) {
    errors.push({
      field: "discountType",
      message: "Loại giảm giá là bắt buộc",
    });
  }

  if (discountValue === undefined || discountValue === "") {
    errors.push({
      field: "discountValue",
      message: "Giá trị giảm là bắt buộc",
    });
  }

  

  if (maxUsagePerUser === undefined || maxUsagePerUser === "") {
    errors.push({
      field: "maxUsagePerUser",
      message: "Số lần dùng mỗi người là bắt buộc",
    });
  }

  if (minOrderValue === undefined || minOrderValue === "") {
    errors.push({
      field: "minOrderValue",
      message: "Giá trị đơn hàng tối thiểu là bắt buộc",
    });
  }

  if (maxDiscountValue === undefined || maxDiscountValue === "") {
    errors.push({
      field: "maxDiscountValue",
      message: "Giá trị giảm tối đa là bắt buộc",
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

  // 2. Validate logic
  if (!["percent", "amount", "shipping"].includes(discountType)) {
    errors.push({
      field: "discountType",
      message: "Loại giảm giá không hợp lệ",
    });
  }

  if (["percent", "amount"].includes(discountType)) {
    if (isNaN(discountValue) || Number(discountValue) <= 0) {
      errors.push({
        field: "discountValue",
        message: "Giá trị giảm phải lớn hơn 0",
      });
    }

    if (discountType === "percent" && Number(discountValue) > 100) {
      errors.push({
        field: "discountValue",
        message: "Phần trăm giảm không được vượt quá 100%",
      });
    }

    if (discountType === "percent") {
      if (isNaN(maxDiscountValue) || Number(maxDiscountValue) < 0) {
        errors.push({
          field: "maxDiscountValue",
          message: "Giá trị giảm tối đa không hợp lệ",
        });
      }
    }
  }

  if (discountType === "shipping") {
    if (isNaN(discountValue) || Number(discountValue) < 0) {
      errors.push({
        field: "discountValue",
        message: "Giá trị hỗ trợ phí ship phải >= 0",
      });
    }

    if (maxDiscountValue !== undefined && Number(maxDiscountValue) > 0) {
      errors.push({
        field: "maxDiscountValue",
        message: "Miễn phí vận chuyển không cần nhập giảm tối đa",
      });
    }
  }

  if (
  totalQuantity !== undefined &&
  totalQuantity !== "" &&
  (isNaN(totalQuantity) || Number(totalQuantity) < 0)
) {
  errors.push({
    field: "totalQuantity",
    message: "Tổng số lượng không hợp lệ",
  });
}


  if (isNaN(maxUsagePerUser) || Number(maxUsagePerUser) < 0) {
    errors.push({
      field: "maxUsagePerUser",
      message: "Số lần dùng mỗi người không hợp lệ",
    });
  }

  if (isNaN(minOrderValue) || Number(minOrderValue) < 0) {
    errors.push({
      field: "minOrderValue",
      message: "Giá trị đơn hàng tối thiểu không hợp lệ",
    });
  }
  if (
    req.body.type === "private" &&
    (!Array.isArray(userIds) || userIds.length === 0)
  ) {
    errors.push({
      field: "userIds",
      message: "Phải chọn người dùng cho coupon chỉ định",
    });
  }

  if (
    req.body.applyProduct &&
    (!Array.isArray(productIds) || productIds.length === 0)
  ) {
    errors.push({
      field: "productIds",
      message: "Phải chọn ít nhất 1 sản phẩm",
    });
  }

  if (
    !validator.isISO8601(startTime) &&
    !errors.find((e) => e.field === "startTime")
  ) {
    errors.push({ field: "startTime", message: "Ngày bắt đầu không hợp lệ" });
  }

  if (
    !validator.isISO8601(endTime) &&
    !errors.find((e) => e.field === "endTime")
  ) {
    errors.push({ field: "endTime", message: "Ngày kết thúc không hợp lệ" });
  }

  if (
    validator.isISO8601(startTime) &&
    validator.isISO8601(endTime) &&
    new Date(startTime) > new Date(endTime)
  ) {
    errors.push({
      field: "endTime",
      message: "Ngày kết thúc phải sau ngày bắt đầu",
    });
  }
if (!isUpdate && validator.isISO8601(startTime)) {
  const now = new Date();
  const start = new Date(startTime);

  if (start < now) {
    errors.push({
      field: "startTime",
      message: "Ngày bắt đầu không được trong quá khứ",
    });
  }
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

  const existingTitle = await Coupon.findOne({
    where: {
      title,
      ...(isUpdate ? { id: { [Op.ne]: currentId } } : {}),
    },
  });
  if (existingTitle) {
    errors.push({ field: "title", message: "Tiêu đề mã giảm giá đã tồn tại" });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateCoupon };
