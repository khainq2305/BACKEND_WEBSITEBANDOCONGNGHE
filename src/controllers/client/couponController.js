// src/controllers/CouponController.js

const { Op } = require("sequelize");
const {
  Coupon,
  CouponUser,
  CouponItem,
  Sku,
  OrderCoupon,
  Product,
  Order,
  sequelize
} = require("../../models");
const { formatCurrencyVND } = require('../../utils/formatCurrency');


function formatCoupon(coupon, isApplicable, usedCount = 0) {
  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.title,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscount: coupon.maxDiscountValue,
    minOrderAmount: coupon.minOrderValue || 0,
    expiryDate: coupon.endTime,

    type: coupon.type,
    isApplicable,
    totalQuantity: coupon.totalQuantity, // Thêm totalQuantity
    usedCount: usedCount, // Thêm usedCount
  };
}

class CouponController {
 static async applyCoupon(req, res) {
  try {
    const userId = req.user.id;
    const { codes = [], skuIds = [], orderTotal } = req.body;

    if (!Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({ message: "Mã không hợp lệ" });
    }

    const now = new Date();

    const coupons = await Coupon.findAll({
      where: { code: { [Op.in]: codes.map(c => c.trim()) } },
      include: [
        { model: CouponUser, as: "users", attributes: ["userId"], paranoid: false },
        { model: CouponItem, as: "products", attributes: ["skuId"], paranoid: false },
      ],
      order: [["updatedAt", "DESC"], ["createdAt", "DESC"]],
      paranoid: false,
    });

    if (!coupons.length) {
      return res.status(404).json({ message: `Mã ${codes.join(", ")} không tồn tại.` });
    }

    let discountCoupon = null;
    let shippingCoupon = null;
    let discountAmount = 0;
    let shippingDiscount = 0;
    const invalidCoupons = [];

    for (const coupon of coupons) {
      if (
        coupon.deletedAt ||
        !coupon.isActive ||
        (coupon.startTime && now < new Date(coupon.startTime)) ||
        (coupon.endTime && now > new Date(coupon.endTime))
      ) {
        invalidCoupons.push({ code: coupon.code, reason: "Không còn hiệu lực" });
        continue;
      }

      if (coupon.minOrderValue && Number(orderTotal) < Number(coupon.minOrderValue)) {
        invalidCoupons.push({ code: coupon.code, reason: "Chưa đạt giá trị tối thiểu" });
        continue;
      }

      if (coupon.visibility === "private") {
        const allowedUserIds = (coupon.users ?? []).map(u => u.userId);
        if (!allowedUserIds.includes(userId)) {
          invalidCoupons.push({ code: coupon.code, reason: "Không thuộc nhóm người dùng" });
          continue;
        }
      }

      if (coupon.applyScope === "product") {
        const allowedSkuIds = (coupon.products ?? []).map(p => Number(p.skuId));
        const incomingSkuIds = (skuIds ?? []).map(Number).filter(Boolean);
        if (allowedSkuIds.length > 0) {
          const allowedSet = new Set(allowedSkuIds);
          const hasMatch = incomingSkuIds.some(id => allowedSet.has(id));
          if (!hasMatch) {
            invalidCoupons.push({ code: coupon.code, reason: "Không áp dụng cho sản phẩm" });
            continue;
          }
        }
      }

      if (typeof coupon.totalQuantity === "number") {
        const usedCount = await OrderCoupon.count({
          where: { couponId: coupon.id },
          include: [{
            model: Order,
            as: "order",
            where: { status: { [Op.notIn]: ["cancelled", "failed"] } },
          }],
        });
        if (coupon.totalQuantity === 0 || usedCount >= coupon.totalQuantity) {
          invalidCoupons.push({ code: coupon.code, reason: "Đã hết lượt sử dụng" });
          continue;
        }
      }

      if (coupon.maxUsagePerUser !== null && coupon.maxUsagePerUser !== undefined) {
        if (coupon.maxUsagePerUser === 0) {
          invalidCoupons.push({ code: coupon.code, reason: "Không cho phép sử dụng" });
          continue;
        }
        const userUsedCount = await OrderCoupon.count({
          where: { couponId: coupon.id },
          include: [{
            model: Order,
            as: "order",
            where: { userId, status: { [Op.notIn]: ["cancelled", "failed"] } },
          }],
        });
        if (userUsedCount >= coupon.maxUsagePerUser) {
          invalidCoupons.push({ code: coupon.code, reason: "Đã dùng tối đa số lần" });
          continue;
        }
      }

      if (coupon.type === "discount" && !discountCoupon) {
        if (coupon.discountType === "percent") {
          discountAmount = (Number(orderTotal) * Number(coupon.discountValue)) / 100;
        } else {
          discountAmount = Number(coupon.discountValue);
        }
        if (coupon.maxDiscountValue && discountAmount > Number(coupon.maxDiscountValue)) {
          discountAmount = Number(coupon.maxDiscountValue);
        }
        discountCoupon = coupon;
      } else if (coupon.type === "shipping" && !shippingCoupon) {
        const fee = Number(req.body.shippingFee || 0);
        if (coupon.discountValue === null || Number(coupon.discountValue) === 0) {
          shippingDiscount = fee;
        } else {
          shippingDiscount = Math.min(Number(coupon.discountValue), fee);
        }
        shippingCoupon = coupon;
      }
    }

    const totalDiscount = discountAmount + shippingDiscount;
    const finalTotal = Math.max(Number(orderTotal) - totalDiscount, 0);

    return res.json({
      message: (discountCoupon || shippingCoupon) ? "Áp dụng mã thành công" : "Không áp dụng được mã",
      isValid: !!(discountCoupon || shippingCoupon),
      discountCoupon: discountCoupon ? {
        id: discountCoupon.id,
        code: discountCoupon.code,
        title: discountCoupon.title,
        type: discountCoupon.type,
        discountType: discountCoupon.discountType,
        discountValue: discountCoupon.discountValue,
        maxDiscount: discountCoupon.maxDiscountValue,
        minOrderAmount: discountCoupon.minOrderValue || 0,
        discountAmount: Math.round(discountAmount),
        expiryDate: discountCoupon.endTime,
        totalQuantity: discountCoupon.totalQuantity,
        maxUsagePerUser: discountCoupon.maxUsagePerUser,
      } : null,
      shippingCoupon: shippingCoupon ? {
        id: shippingCoupon.id,
        code: shippingCoupon.code,
        title: shippingCoupon.title,
        type: shippingCoupon.type,
        discountType: shippingCoupon.discountType,
        discountValue: shippingCoupon.discountValue,
        discountAmount: Math.round(shippingDiscount),
        expiryDate: shippingCoupon.endTime,
        totalQuantity: shippingCoupon.totalQuantity,
        maxUsagePerUser: shippingCoupon.maxUsagePerUser,
      } : null,
      finalTotal,
      invalidCoupons,
    });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi server", error: err.message });
  }
}







  static async getAvailableCoupons(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();

    let skuIdsFromQuery = [];
    if (req.query.skuIds) {
      skuIdsFromQuery = req.query.skuIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter(Boolean);
    }
    if (req.query.skuId) {
      const n = Number(req.query.skuId);
      if (!Number.isNaN(n)) skuIdsFromQuery.push(n);
    }
    skuIdsFromQuery = [...new Set(skuIdsFromQuery)];

    const orderTotal = Number(req.query.orderTotal || 0);

    const coupons = await Coupon.findAll({
      where: {
        isActive: true,
        deletedAt: null,
        endTime: { [Op.gte]: now },
      },
      include: [
        {
          model: CouponUser,
          as: "users",
          attributes: ["userId"],
          required: false,
          paranoid: false,
        },
        {
          model: CouponItem,
          as: "products",
          attributes: ["skuId"],
          required: false,
          paranoid: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      paranoid: false,
    });

    // --- lấy tổng số lần đã dùng cho từng coupon ---
    let usedCountMap = {};
    let userUsedCountMap = {};
    if (coupons.length) {
      const couponIds = coupons.map((c) => c.id);

      // Tổng số lần toàn hệ thống
     const usedCounts = await OrderCoupon.findAll({
  where: { couponId: { [Op.in]: couponIds } },
  include: [{
    model: Order,
    as: "order",
    attributes: [],  // ⛔ không select hết order.*, chỉ dùng để filter where
    where: { status: { [Op.notIn]: ["cancelled", "failed"] } }
  }],
  attributes: [
    "couponId",
    [sequelize.fn("COUNT", sequelize.col("OrderCoupon.id")), "usedCount"]
  ],
  group: ["OrderCoupon.couponId"],
});

      usedCounts.forEach((item) => {
        usedCountMap[item.couponId] = Number(item.get("usedCount"));
      });

      // Số lần mỗi user đã dùng
     const userUsedCounts = await OrderCoupon.findAll({
  where: { couponId: { [Op.in]: couponIds } },
  include: [{
    model: Order,
    as: "order",
    attributes: [], // ⛔ không lấy cột order.*, chỉ lọc userId
    where: { userId, status: { [Op.notIn]: ["cancelled", "failed"] } }
  }],
  attributes: [
    "couponId",
    [sequelize.fn("COUNT", sequelize.col("OrderCoupon.id")), "userUsedCount"]
  ],
  group: ["OrderCoupon.couponId"],
});

      userUsedCounts.forEach((item) => {
        userUsedCountMap[item.couponId] = Number(item.get("userUsedCount"));
      });
    }

    const data = coupons.map((coupon) => {
      const allowedUserIds = coupon.users.map((u) => u.userId);
      const allowedSkuIds = coupon.products.map((p) => Number(p.skuId));

      const userHasAccess = coupon.visibility === "public" || allowedUserIds.includes(userId);
      const skuMatched =
        coupon.applyScope === "all" ||
        allowedSkuIds.length === 0 ||
        skuIdsFromQuery.some((id) => allowedSkuIds.includes(id));
      const minOrderValue = Number(coupon.minOrderValue || 0);
      const orderValid = !coupon.minOrderValue || orderTotal >= minOrderValue;

      const usedCount = usedCountMap[coupon.id] || 0;
      const userUsedCount = userUsedCountMap[coupon.id] || 0;
      const unlimited = coupon.totalQuantity === null || typeof coupon.totalQuantity === "undefined";
      const hasRemainingUsage = unlimited ? true : usedCount < coupon.totalQuantity;
      const perUserValid =
        coupon.maxUsagePerUser == null || userUsedCount < coupon.maxUsagePerUser;

      const hasStarted = coupon.startTime <= now;
      const stillValid = coupon.endTime >= now;

      const isApplicable =
        hasStarted && stillValid && userHasAccess && skuMatched && orderValid && hasRemainingUsage && perUserValid;

      let notApplicableReason = null;
      if (!hasStarted) notApplicableReason = "Chưa tới thời gian áp dụng";
      else if (!stillValid) notApplicableReason = "Mã đã hết hạn";
      else if (!userHasAccess) notApplicableReason = "Bạn không có quyền sử dụng mã này";
      else if (!skuMatched) notApplicableReason = "Sản phẩm không thỏa điều kiện voucher";
      else if (!orderValid) notApplicableReason = `Đơn hàng chưa đạt giá trị tối thiểu ${minOrderValue.toLocaleString()}đ`;
      else if (!hasRemainingUsage) notApplicableReason = "Mã đã hết lượt sử dụng";
      else if (!perUserValid) notApplicableReason = "Bạn đã dùng tối đa số lần cho mã này";

      return {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        type: coupon.type,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscountValue: coupon.maxDiscountValue,
        minOrderValue: coupon.minOrderValue,
        totalQuantity: coupon.totalQuantity,
        maxUsagePerUser: coupon.maxUsagePerUser,
        allowedSkuIds,
        usedCount,
        userUsedCount,
        isApplicable,
        notApplicableReason,
        isActiveNow: hasStarted && stillValid,
        isUpcoming: !hasStarted && stillValid,
        startsInMs: !hasStarted ? coupon.startTime - now : 0,
        expiryDate: coupon.endTime
      };
    });

    return res.json({ data });
  } catch (err) {
    console.error("❌ Lỗi getAvailableCoupons:", err)
    return res.status(500).json({ message: "Lỗi server", error: err.message });
  }
}







}

module.exports = CouponController;