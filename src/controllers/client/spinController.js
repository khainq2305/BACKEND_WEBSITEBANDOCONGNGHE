const {
    SpinReward,
    UserSpin,
    SpinHistory,
    Coupon,
    CouponUser,
} = require("../../models");
const { Op } = require("sequelize");
const generateCouponCode = require("../../utils/generateCouponCode");

class SpinController {
    static getToday() {
        return new Date().toISOString().split("T")[0];
    }

    // 📌 Lấy danh sách reward khả dụng
    static async getRewards(req, res) {
        try {
            const rewards = await SpinReward.findAll({
                where: { isActive: true },
                include: [{ model: Coupon, as: "coupon", attributes: ["type"] }],
                order: [["id", "ASC"]],
            });
            return res.status(200).json(rewards);
        } catch (err) {
            console.error("getRewards error:", err.message, err.stack);
            return res.status(500).json({ message: "Lỗi lấy phần thưởng" });
        }
    }

    // 📌 Lấy số lượt quay còn lại hôm nay
    static async getSpinStatus(req, res) {
        try {
            if (!req.user || !req.user.id) {
                return res.status(200).json({ spinsLeft: 0, message: "Người dùng chưa đăng nhập" });
            }

            const userId = req.user.id;
            const today = SpinController.getToday();

            const [spin] = await UserSpin.findOrCreate({
                where: { userId, spinDate: today },
                defaults: { spinsLeft: 3, spinDate: today },
            });

            return res.status(200).json({ spinsLeft: spin.spinsLeft });
        } catch (err) {
            console.error("getSpinStatus error:", err.message, err.stack);
            return res.status(500).json({ message: "Lỗi lấy lượt quay" });
        }
    }

    // 📌 Quay thưởng
    static async spin(req, res) {
        const t = await UserSpin.sequelize.transaction();
        try {
            if (!req.user || !req.user.id) {
                await t.rollback();
                return res.status(401).json({ message: "Bạn cần đăng nhập để quay." });
            }

            const userId = req.user.id;
            const today = SpinController.getToday();

            // Tạo record lượt quay trong ngày nếu chưa có
            const [spin] = await UserSpin.findOrCreate({
                where: { userId, spinDate: today },
                defaults: { spinsLeft: 3, spinDate: today },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (spin.spinsLeft <= 0) {
                await t.rollback();
                return res.status(429).json({ message: "Bạn đã hết 3 lượt quay miễn phí hôm nay." });
            }

            // Trừ lượt quay
            spin.spinsLeft -= 1;
            await spin.save({ transaction: t });

            // ==== chọn thưởng ====
            const rewards = await SpinReward.findAll({
                where: { isActive: true },
                include: [{ model: Coupon, as: "coupon", attributes: ["type"] }],
                order: [["id", "ASC"]],
                transaction: t,
                lock: t.LOCK.SHARE,
            });

            if (!rewards || rewards.length === 0) {
                await t.rollback();
                return res.status(500).json({ message: "Không có phần thưởng khả dụng" });
            }

            const totalProbability = rewards.reduce((sum, r) => sum + r.probability, 0);
            const randomNumber = Math.random() * totalProbability;
            let cumulativeProbability = 0;
            let selectedReward = null;

            for (const reward of rewards) {
                cumulativeProbability += reward.probability;
                if (randomNumber <= cumulativeProbability) {
                    selectedReward = reward;
                    break;
                }
            }

            if (!selectedReward) {
                await t.rollback();
                return res.status(500).json({ message: "Lỗi khi chọn phần thưởng" });
            }

            // Lưu lịch sử quay trước
            const history = await SpinHistory.create(
                {
                    userId,
                    rewardId: selectedReward.id,
                    rewardName: selectedReward.name,
                    rewardType: selectedReward.coupon?.type || "text",
                },
                { transaction: t }
            );

            let newCoupon = null;

            // Nếu reward có coupon gốc → clone coupon gốc và sinh mã mới
            if (selectedReward.couponId) {
                const baseCoupon = await Coupon.findByPk(selectedReward.couponId, { transaction: t });
                if (!baseCoupon) {
                    await t.rollback();
                    return res.status(404).json({ message: "Coupon gốc không tồn tại" });
                }

                // 🔹 Sinh code mới, đảm bảo không trùng
                let code;
                do {
                    code = generateCouponCode();
                } while (await Coupon.findOne({ where: { code }, transaction: t }));

                // 🔹 Thời gian hiệu lực: từ lúc quay → +7 ngày
                const startTime = new Date();
                const endTime = new Date();
                endTime.setDate(startTime.getDate() + 7);

                // 🔹 Tạo coupon mới usable (chỉ 1 lần)
                newCoupon = await Coupon.create(
                    {
                        code,
                        title: baseCoupon.title,
                        description: baseCoupon.description,
                        bannerUrl: baseCoupon.bannerUrl,
                        discountType: baseCoupon.discountType,
                        discountValue: baseCoupon.discountValue,
                        minOrderValue: baseCoupon.minOrderValue,
                        maxDiscountValue: baseCoupon.maxDiscountValue,
                        startTime,
                        endTime,
                        totalQuantity: 1,
                        usedCount: 0,
                        maxUsagePerUser: 1,
                        isActive: true,
                        type: baseCoupon.type,
                    },
                    { transaction: t }
                );

                // 🔹 Gán coupon cho user
                await CouponUser.create(
                    {
                        userId,
                        couponId: newCoupon.id,
                        used: false,
                        assignedAt: new Date(),
                    },
                    { transaction: t }
                );

                // 🔹 Cập nhật lịch sử với couponCode
                history.couponCode = newCoupon.code;
                await history.save({ transaction: t });
            }

            await t.commit();

            return res.status(200).json({
                reward: selectedReward.name,
                rewardType: selectedReward.coupon ? "coupon" : "text",
                rewardId: selectedReward.id,
                couponCode: newCoupon ? newCoupon.code : null,
            });
        } catch (err) {
            console.error("spin error:", err.message, err.stack);
            try {
                await t.rollback();
            } catch { }
            return res.status(500).json({ message: "Lỗi quay vòng" });
        }
    }


    // 📌 Lịch sử quay của user
    static async getHistory(req, res) {
        try {
            if (!req.user || !req.user.id) {
                return res.status(200).json([]);
            }
            const userId = req.user.id;

            const history = await SpinHistory.findAll({
                where: { userId },
                order: [["createdAt", "DESC"]],
                limit: 10,
            });

            // format lại dữ liệu trả về
            const formatted = history.map(h => ({
                id: h.id,
                rewardName: h.rewardName,
                createdAt: h.createdAt,
                couponCode: h.couponCode || null,
            }));

            return res.status(200).json(formatted);
        } catch (err) {
            console.error("getHistory error:", err.message, err.stack);
            return res.status(200).json([]);
        }
    }
}

module.exports = SpinController;
