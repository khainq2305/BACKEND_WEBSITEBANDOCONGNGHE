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
                return res.status(200).json({ spinsLeft: 0, message: "Người dùng chưa được xác thực." });
            }
            // 🚀 Cho quay vô hạn: luôn trả về số lớn
            return res.status(200).json({ spinsLeft: 9999 });
        } catch (err) {
            console.error("getSpinStatus error:", err.message, err.stack);
            return res.status(500).json({ message: "Lỗi lấy lượt quay" });
        }
    }

    static async spin(req, res) {
        try {
            const userId = req.user.id;

            // 🚀 Không check spinsLeft nữa → luôn cho quay
            // Bỏ đoạn giảm spinsLeft
            // if (spin.spinsLeft <= 0) { ... }

            const rewards = await SpinReward.findAll({
                where: { isActive: true },
                include: [{ model: Coupon, as: "coupon", attributes: ["type"] }],
                order: [["id", "ASC"]],
            });

            if (!rewards || rewards.length === 0) {
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
                return res.status(500).json({ message: "Lỗi hệ thống khi chọn phần thưởng" });
            }

            await SpinHistory.create({
                userId,
                rewardId: selectedReward.id,
                rewardName: selectedReward.name,
                rewardType: selectedReward.coupon?.type || "text",
            });

            if (selectedReward.couponId) {
                await CouponUser.create({
                    userId,
                    couponId: selectedReward.couponId,
                    used: false,
                    assignedAt: new Date(),
                });
            }

            return res.status(200).json({
                reward: selectedReward.name,
                rewardType: selectedReward.coupon?.type || "text",
                rewardId: selectedReward.id,
            });

        } catch (err) {
            console.error("spin error:", err.message, err.stack);
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
            });
            return res.status(200).json(history || []);
        } catch (err) {
            console.error("getHistory error:", err.message, err.stack);
            return res.status(200).json([]);
        }
    }
}

module.exports = SpinController;