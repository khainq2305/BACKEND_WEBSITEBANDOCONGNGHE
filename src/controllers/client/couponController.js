// src/controllers/CouponController.js

const { Op } = require("sequelize");
const {
  Coupon,
  CouponUser,
  CouponItem,
  Sku,
  Product,
  Order,
} = require("../../models");

function formatCoupon(coupon, isApplicable) {
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
  };
}

class CouponController {
  static async applyCoupon(req, res) {
    try {
      const userId = req.user.id;
      const { code, skuIds = [], orderTotal } = req.body;

      if (!code || typeof code !== "string") {
        console.warn("⚠️  Invalid code format");
        return res.status(400).json({ message: "Mã không hợp lệ" });
      }

      const coupon = await Coupon.findOne({
        where: { code: code.trim() },
        include: [
          {
            model: CouponUser,
            as: "users",
            attributes: ["userId"],
            paranoid: false,
          },
          {
            model: CouponItem,
            as: "products",
            attributes: ["skuId"],
            paranoid: false,
          },
        ],
        paranoid: false,
      });

      if (!coupon) {
        return res.status(404).json({ message: `Mã "${code}" không tồn tại.` });
      }

      const now = new Date();
      if (coupon.startTime && now < new Date(coupon.startTime)) {
   
        return res
          .status(400)
          .json({ message: "Mã chưa đến thời gian áp dụng." });
      }
      if (coupon.endTime && now > new Date(coupon.endTime)) {
        return res.status(400).json({ message: "Mã đã hết hạn." });
      }

      if (coupon.deletedAt) {
      
        return res.status(400).json({ message: "Mã đã bị xóa." });
      }
      if (!coupon.isActive) {
        return res.status(400).json({ message: "Mã đang tạm ngưng." });
      }

      if (coupon.minOrderValue && orderTotal < coupon.minOrderValue) {
        return res.status(400).json({
          message: `Đơn hàng phải đạt tối thiểu ${coupon.minOrderValue.toLocaleString()}₫ để áp dụng mã.`,
        });
      }

      if (coupon.type === "private") {
        const allowedUserIds = (coupon.users ?? []).map((u) => u.userId);
        if (!allowedUserIds.includes(userId)) {
          return res
            .status(403)
            .json({ message: "Bạn không có quyền sử dụng mã này." });
        }
      }

      const allowedSkuIds = (coupon.products ?? []).map((p) => Number(p.skuId));
      const incomingSkuIds = (skuIds ?? []).map(Number).filter(Boolean);

      if (allowedSkuIds.length > 0) {
        const allowedSet = new Set(allowedSkuIds);
        const hasMatch = incomingSkuIds.some((id) => allowedSet.has(id));

        if (!hasMatch) {
          return res
            .status(403)
            .json({ message: "Mã không áp dụng cho sản phẩm này." });
        }
      }

      if (coupon.totalQuantity !== null && coupon.totalQuantity > 0) {
        const usedCount = await Order.count({
          where: {
            couponId: coupon.id,
            status: { [Op.notIn]: ["cancelled", "failed"] },
          },
        });
        if (usedCount >= coupon.totalQuantity) {
          console.warn("⚠️  Coupon out of stock");
          return res.status(400).json({ message: "Mã đã hết lượt sử dụng." });
        }
      }

      let discountAmount = 0;
      if (coupon.discountType === "percent") {
        discountAmount = (orderTotal * Number(coupon.discountValue)) / 100;
      } else {
        discountAmount = Number(coupon.discountValue);
      }
      if (
        coupon.maxDiscountValue &&
        discountAmount > Number(coupon.maxDiscountValue)
      ) {
        discountAmount = Number(coupon.maxDiscountValue);
      }

      const finalTotal = Math.max(orderTotal - discountAmount, 0);

      return res.json({
        message: "Áp dụng mã thành công",
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
      console.error("Lỗi khi áp dụng mã giảm:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: err.message });
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

      const coupons = await Coupon.findAll({
        where: {
          isActive: true,
          deletedAt: null,
          startTime: { [Op.lte]: now },
          endTime: { [Op.gte]: now },
        },
        include: [
          {
            model: CouponUser,
            as: "users",
            attributes: ["userId"],
            paranoid: false,
          },
          {
            model: CouponItem,
            as: "products",
            attributes: ["skuId"],
            paranoid: false,
          },
        ],
        order: [["createdAt", "DESC"]],
        paranoid: false,
      });

      const data = coupons.map((coupon) => {
        const allowedUserIds = coupon.users.map((u) => u.userId);
        const userHasAccess =
          coupon.type === "public" || allowedUserIds.includes(userId);
        if (!userHasAccess) return formatCoupon(coupon, false);

        const allowedSkuIds = coupon.products.map((p) => Number(p.skuId));
        if (
          allowedSkuIds.length > 0 &&
          skuIdsFromQuery.length > 0 &&
          !skuIdsFromQuery.some((id) => allowedSkuIds.includes(id))
        ) {
          return formatCoupon(coupon, false);
        }
        return formatCoupon(coupon, true);
      });

      return res.json({ data });
    } catch (err) {
      console.error("Lỗi khi lấy danh sách mã giảm giá:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: err.message });
    }
  }
}

module.exports = CouponController;
