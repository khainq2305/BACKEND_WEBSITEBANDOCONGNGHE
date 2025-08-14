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
        message: `Đơn hàng phải đạt tối thiểu ${formatCurrencyVND(          coupon.minOrderValue
        )} để áp dụng mã.`,      });
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

    // Sửa phần kiểm tra giới hạn lượt dùng mã:
    if (typeof coupon.totalQuantity === "number") {
      console.log("🎯 Kiểm tra giới hạn lượt dùng mã:", {
        totalAllowed: coupon.totalQuantity,
      });

      const usedCount = await Order.count({
        where: {
          couponId: coupon.id,
          status: { [Op.notIn]: ["cancelled", "failed"] },
        },
      });

      console.log("🔢 Đã dùng:", usedCount);

      // Điều chỉnh logic: nếu totalQuantity là 0 hoặc usedCount đã vượt quá/bằng totalQuantity
      if (coupon.totalQuantity === 0 || usedCount >= coupon.totalQuantity) {
        console.warn("🚫 Coupon đã hết lượt sử dụng");
        return res.json({
          isValid: false,
            isOutOfUsage: true,      // <-- thêm flag này
          message: "Mã đã hết lượt sử dụng.",
          coupon: null,
        });
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
    console.error("Lỗi khi áp dụng mã giảm:", err);
    return res.status(500).json({ message: "Lỗi server", error: err.message });
  }
}



static async getAvailableCoupons(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();

    console.log('======================= 📥 API: getAvailableCoupons =======================');
    console.log('➡️ userId:', userId);
    console.log('➡️ req.query:', req.query);

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

    const orderTotalRaw = req.query.orderTotal;
    const orderTotal = Number(orderTotalRaw || 0);

    console.log("➡️ orderTotal (raw):", orderTotalRaw);
    console.log("➡️ orderTotal (parsed):", orderTotal);
    console.log("➡️ skuIdsFromQuery:", skuIdsFromQuery);

    // ✅ Lấy cả coupon sắp tới: chỉ cần đảm bảo chưa hết hạn
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
              { userId: { [Op.is]: null } }, // giúp include được coupon public
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

    // ✅ Đếm đã dùng (bỏ qua nếu không có coupon nào)
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

      usedCountMap = {};
      usedCounts.forEach((item) => {
        usedCountMap[item.couponId] = Number(item.get("usedCount"));
      });
    }

    const data = coupons
      .filter((coupon) => {
        // ⚠️ Nếu là private mà không gán user thì bỏ
        if (coupon.type === "private") {
          const allowedUserIds = coupon.users.map((u) => u.userId);
          return allowedUserIds.includes(userId);
        }
        return true; // public giữ lại
      })
      .map((coupon) => {
        const allowedUserIds = coupon.users.map((u) => u.userId);
        const allowedSkuIds = coupon.products.map((p) => Number(p.skuId));

        const userHasAccess = coupon.type === "public" || allowedUserIds.includes(userId);

        const skuMatched =
          allowedSkuIds.length === 0 ||
          skuIdsFromQuery.some((id) => allowedSkuIds.includes(id));

        const minOrderValue = Number(coupon.minOrderValue || 0);
        const orderValid = !coupon.minOrderValue || orderTotal >= minOrderValue;

        const usedCount = usedCountMap[coupon.id] || 0;

        // 🔧 Nếu totalQuantity = 0 là không giới hạn => đổi thành unlimited
        const unlimited = coupon.totalQuantity === null || typeof coupon.totalQuantity === "undefined";
        const hasRemainingUsage = unlimited ? true : (coupon.totalQuantity === 0 ? true : usedCount < coupon.totalQuantity);

        const hasStarted = coupon.startTime <= now;
        const stillValid = coupon.endTime >= now;

        // ✅ Chỉ áp dụng khi đã bắt đầu
        const isApplicable = hasStarted && stillValid && userHasAccess && skuMatched && orderValid && hasRemainingUsage;

        console.log("------------------------------------------------------------");
        console.log(`🎟️ [Coupon Check] "${coupon.title || coupon.code}"`);
        console.log({
          couponCode: coupon.code,
          couponTitle: coupon.title,
          couponType: coupon.type,
          userId,
          userHasAccess,
          allowedUserIds,
          skuIdsFromQuery,
          allowedSkuIds,
          skuMatched,
          orderTotal,
          minOrderValue,
          orderValid,
          usedCount,
          totalQuantity: coupon.totalQuantity,
          hasRemainingUsage,
          isApplicable,
          timeNow: now,
          startTime: coupon.startTime,
          endTime: coupon.endTime,
          hasStarted,
          stillValid,
          timeValid: hasStarted && stillValid,
        });

        const base = formatCoupon(coupon, isApplicable, usedCount);
        return {
          ...base,
          isActiveNow: hasStarted && stillValid,
          isUpcoming: !hasStarted && stillValid, // 🆕 FE có thể hiển thị "Sắp diễn ra"
          startsInMs: !hasStarted ? (coupon.startTime - now) : 0, // tiện cho countdown nếu cần
        };
      })
      // (Tùy chọn) Sắp xếp: active trước, rồi upcoming
      .sort((a, b) => {
        if (a.isActiveNow !== b.isActiveNow) return a.isActiveNow ? -1 : 1;
        if (a.isUpcoming !== b.isUpcoming) return a.isUpcoming ? -1 : 1;
        return 0;
      });

    return res.json({ data });
  } catch (err) {
    console.error("❌ Lỗi khi lấy danh sách mã giảm giá:", err);
    return res.status(500).json({ message: "Lỗi server", error: err.message });
  }
}




}

module.exports = CouponController;