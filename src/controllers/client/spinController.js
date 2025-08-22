// src/controllers/client/spinController.js
const {
    SpinReward,
    UserSpin,
    SpinHistory,
    Coupon,
    CouponUser,
} = require("../../models");
const { Op } = require("sequelize");

class SpinController {
    static getToday() {
        return new Date().toISOString().split("T")[0];
    }

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


    static async getSpinStatus(req, res) {
        try {
            if (!req.user || !req.user.id) {
                return res.status(200).json({ spinsLeft: 0, message: "Người dùng chưa đăng nhập" });
            }

            const userId = req.user.id;
            const today = SpinController.getToday();

            // Tạo record nếu chưa có
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

    // ===== SPIN =====
    static async spin(req, res) {
        const t = await UserSpin.sequelize.transaction();
        try {
            if (!req.user || !req.user.id) {
                await t.rollback();
                return res.status(401).json({ message: "Bạn cần đăng nhập để quay." });
            }

            const userId = req.user.id;
            const today = SpinController.getToday();

            // Lấy/tạo lượt quay trong ngày
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

            // Lưu lịch sử quay
            await SpinHistory.create(
                {
                    userId,
                    rewardId: selectedReward.id,
                    rewardName: selectedReward.name,
                    rewardType: selectedReward.coupon?.type || "text",
                },
                { transaction: t }
            );

            // Nếu có coupon thì tặng cho user
            if (selectedReward.couponId) {
                await CouponUser.create(
                    {
                        userId,
                        couponId: selectedReward.couponId,
                        used: false,
                        assignedAt: new Date(),
                    },
                    { transaction: t }
                );
            }

            await t.commit();

            return res.status(200).json({
                reward: selectedReward.name,
                rewardType: selectedReward.coupon?.type || "text",
                rewardId: selectedReward.id,
            });
        } catch (err) {
            console.error("spin error:", err.message, err.stack);
            try {
                await t.rollback();
            } catch { }
            return res.status(500).json({ message: "Lỗi quay vòng" });
        }
    }





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
                include: [
                    {
                        model: SpinReward,
                        as: "reward",
                        include: [
                            { model: Coupon, as: "coupon", attributes: ["code"] }
                        ]
                    }
                ]
            });

            // format lại dữ liệu trả về
            const formatted = history.map(h => ({
                id: h.id,
                rewardName: h.rewardName,
                createdAt: h.createdAt,
                couponCode: h.reward?.coupon?.code || null
            }));

            return res.status(200).json(formatted);
        } catch (err) {
            console.error("getHistory error:", err.message, err.stack);
            return res.status(200).json([]);
        }
    }

}

module.exports = SpinController;