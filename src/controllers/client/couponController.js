// src/controllers/CouponController.js

const { Op } = require('sequelize');
const {
  Coupon,
  CouponUser,
  CouponItem,
  CouponCategory,
  Sku,
  Product
} = require('../../models');

class CouponController {
  // ✅ Áp dụng mã giảm giá
  static async applyCoupon(req, res) {
    try {
      const userId = req.user.id;
      const { code, skuId, orderTotal } = req.body;

      if (!code || !skuId || !orderTotal) {
        return res.status(400).json({ message: "Thiếu dữ liệu áp mã giảm giá" });
      }

      // Tìm coupon, include luôn bảng liên quan
      const coupon = await Coupon.findOne({
        where: { code },
        include: [
          { model: CouponUser,    as: 'users',      attributes: ['userId'],    paranoid: false },
          { model: CouponItem,    as: 'products',   attributes: ['skuId'],      paranoid: false },
          { model: CouponCategory,as: 'categories', attributes: ['categoryId'], paranoid: false }
        ],
        paranoid: false
      });

      if (!coupon) return res.status(404).json({ message: "Mã giảm giá không tồn tại" });
      if (coupon.deletedAt) return res.status(400).json({ message: "Mã giảm giá đã bị xoá" });
      if (!coupon.isActive) return res.status(400).json({ message: "Mã giảm giá đang tạm ngưng" });

      const now = new Date();
      if (coupon.startTime && now < new Date(coupon.startTime)) {
        return res.status(400).json({ message: "Mã giảm giá chưa được áp dụng" });
      }
      if (coupon.endTime && now > new Date(coupon.endTime)) {
        return res.status(400).json({ message: "Mã giảm giá đã hết hạn" });
      }

      if (coupon.minOrderValue && orderTotal < coupon.minOrderValue) {
        return res.status(400).json({
          message: `Đơn hàng phải đạt tối thiểu ${coupon.minOrderValue.toLocaleString()}₫ để áp dụng mã`
        });
      }

      if (coupon.type === 'private') {
        const allowedUserIds = coupon.users?.map(u => u.userId) || [];
        if (!allowedUserIds.includes(userId)) {
          return res.status(403).json({ message: "Bạn không có quyền sử dụng mã này" });
        }
      }

      // Tìm SKU để lấy productId và categoryId
      const sku = await Sku.findByPk(skuId, {
        include: {
          model: Product,
          as: 'product',
          attributes: ['id', 'categoryId']
        }
      });

      if (!sku || !sku.product) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm tương ứng với SKU" });
      }

      const productId = sku.product.id;
      const categoryId = sku.product.categoryId;

      // CHỈNH LẠI PHẦN CHECK SẢN PHẨM: coupon.products trả về mảng { skuId }
      const allowedSkuIds = coupon.products?.map(p => p.skuId) || [];
      if (allowedSkuIds.length > 0 && !allowedSkuIds.includes(skuId)) {
        return res.status(403).json({ message: "Mã không áp dụng cho sản phẩm này" });
      }

      // Kiểm tra danh mục (nếu có ràng buộc category)
      const allowedCategoryIds = coupon.categories?.map(c => c.categoryId) || [];
      if (allowedCategoryIds.length > 0 && !allowedCategoryIds.includes(categoryId)) {
        return res.status(403).json({ message: "Mã không áp dụng cho danh mục này" });
      }

      // Tính discount
      let discountAmount = 0;
      if (coupon.discountType === 'percentage') {
        discountAmount = (orderTotal * coupon.discountValue) / 100;
      } else if (coupon.discountType === 'fixed') {
        discountAmount = coupon.discountValue;
      }
      if (coupon.maxDiscountValue && discountAmount > coupon.maxDiscountValue) {
        discountAmount = coupon.maxDiscountValue;
      }

      return res.json({
        message: "Áp dụng mã giảm giá thành công",
        coupon: {
          id: coupon.id,
          code: coupon.code,
          title: coupon.title,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          maxDiscount: coupon.maxDiscountValue,
          minOrderAmount: coupon.minOrderValue || 0,
          discountAmount: Math.round(discountAmount),
          expiryDate: coupon.endTime
        }
      });

    } catch (err) {
      console.error("❌ Lỗi khi áp dụng mã giảm:", err);
      return res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  // ✅ Lấy danh sách mã giảm giá khả dụng
  static async getAvailableCoupons(req, res) {
    try {
      const userId = req.user.id;            // ID user đang login
      const now = new Date();

      // 1. Lấy skuId từ query param
      //    Nếu bạn muốn hỗ trợ nhiều skuId cùng lúc, bạn có thể gửi req.query.skuIds = ['1054','1055'] (mảng)
      const skuIdFromQuery = req.query.skuId ? Number(req.query.skuId) : null;
      // Ví dụ: GET /api/coupons?skuId=1054  →   skuIdFromQuery = 1054

      // 2. Nếu có skuId, lấy information của SKU để tìm ra categoryId tương ứng
      let skuCategoryId = null;
      if (skuIdFromQuery) {
        // Mình join thêm bảng Product để lấy ra product.categoryId
        const skuRecord = await Sku.findByPk(skuIdFromQuery, {
          include: {
            model: Product,
            as: 'product',
            attributes: ['categoryId']
          }
        });
        if (skuRecord && skuRecord.product) {
          skuCategoryId = skuRecord.product.categoryId;
        }
      }

      // 3. Lấy tất cả coupon đang active + nằm trong thời gian (startTime <= now <= endTime)
      const coupons = await Coupon.findAll({
        where: {
          isActive: true,
          [Op.and]: [
            { startTime: { [Op.lte]: now } },
            { endTime:   { [Op.gte]: now } }
          ]
        },
        include: [
          // Lấy bảng couponUser để kiểm tra nếu coupon là private
          { model: CouponUser,    as: 'users',      attributes: ['userId'],    paranoid: false },
          // Lấy bảng couponItem để biết coupon này áp cho những skuId nào
          { model: CouponItem,    as: 'products',   attributes: ['skuId'],      paranoid: false },
          // Lấy bảng couponCategory để biết coupon này áp cho những categoryId nào
          { model: CouponCategory,as: 'categories', attributes: ['categoryId'], paranoid: false }
        ],
        order: [['createdAt', 'DESC']],
        paranoid: false
      });

      // 4. Map lại từng coupon, tính toán isApplicable dựa trên:
      //    - Kiểm tra user nếu type = 'private'
      //    - Kiểm tra skuId nếu coupon có ràng buộc SKU
      //    - Kiểm tra categoryId nếu coupon có ràng buộc category
      const data = coupons.map(coupon => {
        // a) Nếu là private thì phải check userId có nằm trong coupon.users hay không
        let isApplicable = false;
        if (coupon.type === 'public') {
          isApplicable = true;
        } else if (coupon.type === 'private') {
          // Lấy mảng userId được phép
          const allowedUserIds = coupon.users?.map(u => u.userId) || [];
          if (allowedUserIds.includes(userId)) {
            isApplicable = true;
          } else {
            isApplicable = false;
          }
        }

        // Nếu đã là private mà user không đủ quyền, thẳng tiến return luôn với isApplicable=false
        if (!isApplicable) {
          return {
            id:              coupon.id,
            code:            coupon.code,
            title:           coupon.title,
            discountType:    coupon.discountType,
            discountValue:   coupon.discountValue,
            maxDiscount:     coupon.maxDiscountValue,
            minOrderAmount:  coupon.minOrderValue,
            expiryDate:      coupon.endTime,
            type:            coupon.type,
            isApplicable:    false
          };
        }

        // b) Nếu coupon.products (couponitem) có data, nghĩa là coupon chỉ áp cho những skuId này
        const allowedSkuIds = coupon.products?.map(p => p.skuId) || [];
        if (allowedSkuIds.length > 0) {
          // Nếu client không gửi skuIdFromQuery, hoặc skuIdFromQuery không nằm trong allowedSkuIds → false
          if (!skuIdFromQuery || !allowedSkuIds.includes(skuIdFromQuery)) {
            return {
              id:              coupon.id,
              code:            coupon.code,
              title:           coupon.title,
              discountType:    coupon.discountType,
              discountValue:   coupon.discountValue,
              maxDiscount:     coupon.maxDiscountValue,
              minOrderAmount:  coupon.minOrderValue,
              expiryDate:      coupon.endTime,
              type:            coupon.type,
              isApplicable:    false
            };
          }
        }

        // c) Nếu coupon.categories (couponcategory) có data, nghĩa là coupon chỉ áp cho các category này
        const allowedCategoryIds = coupon.categories?.map(c => c.categoryId) || [];
        if (allowedCategoryIds.length > 0) {
          // Nếu client không gửi skuCategoryId (hoặc category không khớp) → false
          if (!skuCategoryId || !allowedCategoryIds.includes(skuCategoryId)) {
            return {
              id:              coupon.id,
              code:            coupon.code,
              title:           coupon.title,
              discountType:    coupon.discountType,
              discountValue:   coupon.discountValue,
              maxDiscount:     coupon.maxDiscountValue,
              minOrderAmount:  coupon.minOrderValue,
              expiryDate:      coupon.endTime,
              type:            coupon.type,
              isApplicable:    false
            };
          }
        }

        // Nếu qua tất cả bước kiểm tra trên mà vẫn “true” → giữ nguyên isApplicable = true
        return {
          id:              coupon.id,
          code:            coupon.code,
          title:           coupon.title,
          discountType:    coupon.discountType,
          discountValue:   coupon.discountValue,
          maxDiscount:     coupon.maxDiscountValue,
          minOrderAmount:  coupon.minOrderValue,
          expiryDate:      coupon.endTime,
          type:            coupon.type,
          isApplicable:    true
        };
      });

      // Trả về cho frontend
      res.json({ data });
    } catch (err) {
      console.error("❌ Lỗi khi lấy danh sách mã giảm giá:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }
}

module.exports = CouponController;
