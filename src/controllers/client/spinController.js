// src/controllers/client/spinController.js
const {
    SpinReward,
    UserSpin,
    SpinHistory,
    Coupon,
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
                return res.status(401).json({ message: "Người dùng chưa được xác thực." });
            }
            const userId = req.user.id;
            const today = SpinController.getToday();
            let spin = await UserSpin.findOne({ where: { user_id: userId, spin_date: today } });

            if (!spin) {
                spin = await UserSpin.create({ user_id: userId, spin_date: today, spins_left: 1 });
            }

            return res.status(200).json({ spinsLeft: spin.spins_left });
        } catch (err) {
            console.error("getSpinStatus error:", err.message, err.stack);
            return res.status(500).json({ message: "Lỗi lấy lượt quay" });
        }
    }

    static async spin(req, res) {
        try {
            if (!req.user || !req.user.id) {
                return res.status(401).json({ message: "Người dùng chưa được xác thực." });
            }

            const userId = req.user.id;
            const today = SpinController.getToday();

            let spin = await UserSpin.findOne({ where: { user_id: userId, spin_date: today } });
            if (!spin) {
                spin = await UserSpin.create({ user_id: userId, spin_date: today, spins_left: 1 });
            }

            if (spin.spins_left <= 0) {
                return res.status(400).json({ message: "Hết lượt quay hôm nay" });
            }

            const rewards = await SpinReward.findAll({
                where: { isActive: true },
                include: [{ model: Coupon, as: "coupon", attributes: ["type"] }],
            });

            if (!rewards || rewards.length === 0) {
                return res.status(500).json({ message: "Không có phần thưởng khả dụng" });
            }

            const segments = rewards.flatMap((reward) => {
                const count = Math.round(reward.probability * 16);
                return Array(count).fill(reward);
            });

            if (segments.length === 0) {
                return res.status(500).json({ message: "Danh sách phần thưởng rỗng sau xử lý xác suất" });
            }

            const randomIndex = Math.floor(Math.random() * segments.length);
            const selectedId = segments[randomIndex].id;

            const selected = await SpinReward.findOne({
                where: { id: selectedId },
                include: [{ model: Coupon, as: "coupon", attributes: ["type"] }],
            });

            if (!selected) {
                return res.status(500).json({ message: "Không tìm thấy phần thưởng" });
            }

            await spin.decrement("spins_left");

            await SpinHistory.create({
                user_id: userId,
                reward_id: selected.id,
                reward_name: selected.name,
                reward_type: selected.coupon?.type || "text",
            });

            return res.status(200).json({
                reward: selected.name,
                rewardType: selected.coupon?.type || "text",
                index: randomIndex,
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
                where: { user_id: userId },
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