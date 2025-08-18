// src/controllers/CouponController.js

const { Op } = require("sequelize");
const {
  Coupon,
  CouponUser,
  CouponItem,
  Sku,
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
    const { code, skuIds = [], orderTotal } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Mã không hợp lệ" });
    }

    const now = new Date();

    const rows = await Coupon.findAll({
      where: { code: code.trim() },
      include: [
        { model: CouponUser, as: "users", attributes: ["userId"], paranoid: false },
        { model: CouponItem, as: "products", attributes: ["skuId"], paranoid: false },
      ],
      order: [["updatedAt", "DESC"], ["createdAt", "DESC"]],
      paranoid: false,
    });

    if (!rows.length) {
      return res.status(404).json({ message: `Mã "${code}" không tồn tại.` });
    }

    const coupon =
      rows.find(c =>
        !c.deletedAt &&
        c.isActive === true &&
        (!c.startTime || c.startTime <= now) &&
        (!c.endTime || c.endTime >= now)
      ) || null;

    if (!coupon) {
      const latest = rows[0];
      if (latest.deletedAt) return res.status(400).json({ message: "Mã đã bị xóa." });
      if (latest.startTime && now < new Date(latest.startTime)) return res.status(400).json({ message: "Mã chưa đến thời gian áp dụng." });
      if (latest.endTime && now > new Date(latest.endTime)) return res.status(400).json({ message: "Mã đã hết hạn." });
      if (!latest.isActive) return res.status(400).json({ message: "Mã đang tạm ngưng." });
      return res.status(400).json({ message: "Mã không hợp lệ." });
    }

    if (coupon.minOrderValue && Number(orderTotal) < Number(coupon.minOrderValue)) {
      return res.status(400).json({
        message: `Đơn hàng phải đạt tối thiểu ${formatCurrencyVND(coupon.minOrderValue)} để áp dụng mã.`,
      });
    }

    if (coupon.type === "private") {
      const allowedUserIds = (coupon.users ?? []).map(u => u.userId);
      if (!allowedUserIds.includes(userId)) {
        return res.status(403).json({ message: "Bạn không có quyền sử dụng mã này." });
      }
    }

    const allowedSkuIds = (coupon.products ?? []).map(p => Number(p.skuId));
    const incomingSkuIds = (skuIds ?? []).map(Number).filter(Boolean);
    if (allowedSkuIds.length > 0) {
      const allowedSet = new Set(allowedSkuIds);
      const hasMatch = incomingSkuIds.some(id => allowedSet.has(id));
      if (!hasMatch) {
        return res.status(403).json({ message: "Mã không áp dụng cho sản phẩm này." });
      }
    }

    if (typeof coupon.totalQuantity === "number") {
      const usedCount = await Order.count({
        where: { couponId: coupon.id, status: { [Op.notIn]: ["cancelled", "failed"] } },
      });
      if (coupon.totalQuantity === 0 || usedCount >= coupon.totalQuantity) {
        return res.json({
          isValid: false,
          isOutOfUsage: true,
          message: "Mã đã hết lượt sử dụng.",
          coupon: null,
        });
      }
    }

    let discountAmount = 0;
    if (coupon.discountType === "percent") {
      discountAmount = (Number(orderTotal) * Number(coupon.discountValue)) / 100;
    } else {
      discountAmount = Number(coupon.discountValue);
    }
    if (coupon.maxDiscountValue && discountAmount > Number(coupon.maxDiscountValue)) {
      discountAmount = Number(coupon.maxDiscountValue);
    }

    const finalTotal = Math.max(Number(orderTotal) - discountAmount, 0);

    return res.json({
      message: "Áp dụng mã thành công",
      isValid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscountValue,
        minOrderAmount: coupon.minOrderValue || 0,
        discountAmount: Math.round(discountAmount),
        expiryDate: coupon.endTime,
        allowedSkuIds,
      },
      finalTotal,
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
          where: {
            [Op.or]: [
              { userId: userId },
              { userId: { [Op.is]: null } },
            ],
          },
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

    const couponIds = coupons.map((c) => c.id);
    let usedCountMap = {};
    if (couponIds.length) {
      const usedCounts = await Order.findAll({
        where: {
          couponId: { [Op.in]: couponIds },
          status: { [Op.notIn]: ["cancelled", "failed"] },
        },
        attributes: ["couponId", [sequelize.fn("COUNT", sequelize.col("couponId")), "usedCount"]],
        group: ["couponId"],
      });
      usedCounts.forEach((item) => {
        usedCountMap[item.couponId] = Number(item.get("usedCount"));
      });
    }

    const data = coupons
      .filter((coupon) => {
        if (coupon.type === "private") {
          const allowedUserIds = coupon.users.map((u) => u.userId);
          return allowedUserIds.includes(userId);
        }
        return true;
      })
      .map((coupon) => {
        const allowedUserIds = coupon.users.map((u) => u.userId);
        const allowedSkuIds = coupon.products.map((p) => Number(p.skuId));

        const userHasAccess = coupon.type === "public" || allowedUserIds.includes(userId);
        const skuMatched = allowedSkuIds.length === 0 || skuIdsFromQuery.some((id) => allowedSkuIds.includes(id));
        const minOrderValue = Number(coupon.minOrderValue || 0);
        const orderValid = !coupon.minOrderValue || orderTotal >= minOrderValue;
        const usedCount = usedCountMap[coupon.id] || 0;
        const unlimited = coupon.totalQuantity === null || typeof coupon.totalQuantity === "undefined";
        const hasRemainingUsage = unlimited ? true : (coupon.totalQuantity === 0 ? true : usedCount < coupon.totalQuantity);
        const hasStarted = coupon.startTime <= now;
        const stillValid = coupon.endTime >= now;
        const isApplicable = hasStarted && stillValid && userHasAccess && skuMatched && orderValid && hasRemainingUsage;

        let notApplicableReason = null;
        if (!hasStarted) notApplicableReason = "Chưa tới thời gian áp dụng";
        else if (!stillValid) notApplicableReason = "Mã đã hết hạn";
        else if (!userHasAccess) notApplicableReason = "Bạn không có quyền sử dụng mã này";
        else if (!skuMatched) notApplicableReason = "Sản phẩm không thỏa điều kiện voucher";
        else if (!orderValid) notApplicableReason = `Đơn hàng chưa đạt giá trị tối thiểu ${minOrderValue.toLocaleString()}đ`;
        else if (!hasRemainingUsage) notApplicableReason = "Mã đã hết lượt sử dụng";

        const base = formatCoupon(coupon, isApplicable, usedCount);
        return {
          ...base,
          isActiveNow: hasStarted && stillValid,
          isUpcoming: !hasStarted && stillValid,
          startsInMs: !hasStarted ? (coupon.startTime - now) : 0,
          notApplicableReason,
        };
      })
      .sort((a, b) => {
        if (a.isActiveNow !== b.isActiveNow) return a.isActiveNow ? -1 : 1;
        if (a.isUpcoming !== b.isUpcoming) return a.isUpcoming ? -1 : 1;
        return 0;
      });

    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi server", error: err.message });
  }
}





}

module.exports = CouponController;