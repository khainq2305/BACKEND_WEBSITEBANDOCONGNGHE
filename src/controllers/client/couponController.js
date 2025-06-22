// src/controllers/CouponController.js

const { Op } = require('sequelize');
const {
    Coupon,
    CouponUser,
    CouponItem,
    Sku,
    Product,
    Order // Đảm bảo Order model đã được import nếu bạn chưa có
} = require('../../models');

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
        isApplicable
    };
}

class CouponController {
    // ✅ Áp dụng mã giảm giá
    static async applyCoupon(req, res) {
        try {
            const userId = req.user.id;
            const { code, skuId, orderTotal } = req.body;

            if (!code || typeof code !== 'string') {
                return res.status(400).json({ message: 'Mã không hợp lệ' });
            }

            const coupon = await Coupon.findOne({
                where: { code: code.trim() },
                include: [
                    { model: CouponUser, as: 'users', attributes: ['userId'], paranoid: false },
                    { model: CouponItem, as: 'products', attributes: ['skuId'], paranoid: false }
                ],
                paranoid: false // Quan trọng để lấy được cả các coupon đã bị soft-delete
            });

            // 1. Kiểm tra sự tồn tại của coupon
            if (!coupon) {
                return res.status(404).json({ message: `Mã giảm giá "${code}" không tồn tại.` });
            }

            // 2. Kiểm tra thời gian (ưu tiên kiểm tra hết hạn/chưa áp dụng)
            const now = new Date();
            if (coupon.startTime && now < new Date(coupon.startTime)) {
                return res.status(400).json({ message: "Mã giảm giá chưa đến thời gian áp dụng." });
            }
            if (coupon.endTime && now > new Date(coupon.endTime)) {
                return res.status(400).json({ message: "Mã giảm giá đã hết hạn." });
            }

            // 3. Kiểm tra các trạng thái khác (sau khi đã kiểm tra thời gian)
            if (coupon.deletedAt) {
                 return res.status(400).json({ message: "Mã giảm giá đã bị xóa." });
            }
            if (!coupon.isActive) {
                return res.status(400).json({ message: "Mã giảm giá đang tạm ngưng." });
            }

            // 4. Kiểm tra giá trị đơn hàng tối thiểu
            if (coupon.minOrderValue && orderTotal < coupon.minOrderValue) {
                return res.status(400).json({
                    message: `Đơn hàng phải đạt tối thiểu ${coupon.minOrderValue.toLocaleString()}₫ để áp dụng mã.`
                });
            }

            // 5. Kiểm tra loại coupon (public/private) và quyền user
            if (coupon.type === 'private') {
                const allowedUserIds = coupon.users?.map(u => u.userId) || [];
                if (!allowedUserIds.includes(userId)) {
                    return res.status(403).json({ message: "Bạn không có quyền sử dụng mã này." });
                }
            }

            // 6. Kiểm tra giới hạn sản phẩm/SKU
            const allowedSkuIds = coupon.products?.map(p => p.skuId) || [];
            if (allowedSkuIds.length > 0) {
                if (!skuId || !allowedSkuIds.includes(skuId)) {
                    return res.status(403).json({ message: "Mã không áp dụng cho sản phẩm này." });
                }
            }

            // 7. Kiểm tra số lượng lượt sử dụng còn lại (totalQuantity)
            const totalQuantity = coupon.totalQuantity;
            if (totalQuantity !== null && totalQuantity > 0) {
                const usedCount = await Order.count({
                    where: {
                        couponId: coupon.id,
                        status: { [Op.notIn]: ['cancelled', 'failed'] } // chỉ tính đơn đã được dùng coupon và không bị hủy/thất bại
                    }
                });

                if (usedCount >= totalQuantity) {
                    return res.status(400).json({ message: "Mã giảm giá đã hết lượt sử dụng." });
                }
            }
            
            // 8. Tính giảm giá
// 8. Tính giảm giá
let discountAmount = 0;
if (coupon.discountType === 'percent') {
  discountAmount = (orderTotal * Number(coupon.discountValue)) / 100;
} else if (coupon.discountType === 'amount' || coupon.discountType === 'fixed') {
  discountAmount = Number(coupon.discountValue);
}

if (coupon.maxDiscountValue && discountAmount > Number(coupon.maxDiscountValue)) {
  discountAmount = Number(coupon.maxDiscountValue);
}


           
console.log('📥 applyCoupon debug:', {
  orderTotal,
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  maxDiscountValue: coupon.maxDiscountValue,
});

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

    // ✅ Lấy danh sách mã giảm giá khả dụng (giữ nguyên như trước)
    static async getAvailableCoupons(req, res) {
        try {
            const userId = req.user.id;
            const now = new Date();

            const skuIdFromQuery = req.query.skuId ? Number(req.query.skuId) : null;

            const coupons = await Coupon.findAll({
                where: {
                    isActive: true,
                    deletedAt: null, // Chỉ lấy những coupon chưa bị soft-delete
                    [Op.and]: [
                        { startTime: { [Op.lte]: now } },
                        { endTime: { [Op.gte]: now } }
                    ]
                },
                include: [
                    { model: CouponUser, as: 'users', attributes: ['userId'], paranoid: false },
                    { model: CouponItem, as: 'products', attributes: ['skuId'], paranoid: false }
                ],
                order: [['createdAt', 'DESC']],
                paranoid: false
            });

            const data = coupons.map(coupon => {
                let isApplicable = false;

                if (coupon.type === 'public') {
                    isApplicable = true;
                } else if (coupon.type === 'private') {
                    const allowedUserIds = coupon.users?.map(u => u.userId) || [];
                    if (allowedUserIds.includes(userId)) {
                        isApplicable = true;
                    }
                }

                if (!isApplicable) {
                    return formatCoupon(coupon, false);
                }

                const allowedSkuIds = coupon.products?.map(p => p.skuId) || [];
                if (allowedSkuIds.length > 0) {
                    if (!skuIdFromQuery || !allowedSkuIds.includes(skuIdFromQuery)) {
                        return formatCoupon(coupon, false);
                    }
                }
                
                // Việc kiểm tra totalQuantity chi tiết hơn sẽ diễn ra ở applyCoupon
                // Ở đây, ta chỉ đơn giản trả về true nếu các điều kiện trên thỏa mãn
                // vì đếm usedCount ở đây không hiệu quả cho danh sách.

                return formatCoupon(coupon, true);
            });

            return res.json({ data });

        } catch (err) {
            console.error("❌ Lỗi khi lấy danh sách mã giảm giá:", err);
            res.status(500).json({ message: "Lỗi server", error: err.message });
        }
    }

}

module.exports = CouponController;