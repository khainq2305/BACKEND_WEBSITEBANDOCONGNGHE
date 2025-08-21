const { Op, Sequelize } = require('sequelize');
const { SpinReward, Coupon } = require('../../models');

class SpinRewardController {
  // 📌 Lấy danh sách phần thưởng
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = {};

      // 🔎 Tìm theo tên
      if (search) {
        whereClause.name = { [Op.like]: `%${search}%` };
      }

      // 📌 Lọc theo trạng thái
      if (status === 'active') {
        whereClause.isActive = true;
      } else if (status === 'inactive') {
        whereClause.isActive = false;
      } else if (status !== 'all') {
        return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
      }

      // 📌 Lấy danh sách reward (bao gồm cả coupon null hoặc hết hạn)
      const { rows: data, count: total } = await SpinReward.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Coupon,
            as: 'coupon',
            attributes: [
              'id',
              'code',
              'startTime',
              'endTime',
              'totalQuantity',
              'usedCount'
            ],
            required: false, // cho phép reward không có coupon
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']],
      });

      // 📊 Đếm riêng từng trạng thái cho badge tab
      const [totalAll, totalActive, totalInactive] = await Promise.all([
        SpinReward.count(),
        SpinReward.count({ where: { isActive: true } }),
        SpinReward.count({ where: { isActive: false } }),
      ]);

      return res.json({
        success: true,
        data,
        total,
        currentPage: Number(page),
        totalPages: Math.ceil(total / limit),
        counts: {
          all: totalAll,
          active: totalActive,
          inactive: totalInactive,
        },
      });
    } catch (error) {
      console.error('❌ Lỗi lấy danh sách phần thưởng:', error);
      return res.status(500).json({ message: 'Lỗi server', error });
    }
  }


  // 📌 Lấy 1 reward theo id
  static async getById(req, res) {
    try {
      const reward = await SpinReward.findByPk(req.params.id, {
        attributes: ['id', 'name', 'couponId', 'probability', 'isActive'],
        include: [
          {
            model: Coupon,
            as: 'coupon',
            attributes: [
              'id',
              'code',
              'startTime',
              'endTime',
              'totalQuantity',
              'usedCount'
            ]
          }
        ],
      });

      if (!reward) return res.status(404).json({ message: 'Không tìm thấy phần thưởng' });
      return res.json({ data: reward });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }

  // 📌 Tạo reward mới
  static async create(req, res) {
    try {
      const { probability, couponId } = req.body;

      // 1. Check probability range
      if (probability < 0 || probability > 100) {
        return res.status(400).json({ message: "Tỉ lệ phải nằm trong khoảng 0% - 100%" });
      }

      // 2. Tính tổng probability hiện có
      const total = await SpinReward.sum("probability");

      // 3. Nếu cộng thêm > 100 thì báo lỗi
      if ((total || 0) + probability > 100) {
        return res.status(400).json({
          message: `Tổng tỉ lệ hiện tại là ${total}%. Thêm ${probability}% sẽ vượt quá 100%. Hãy giảm tỉ lệ phần thưởng khác trước khi thêm mới.`
        });
      }

      // 4. Nếu có couponId → kiểm tra còn hạn & còn lượt
      if (couponId) {
        const now = new Date();
        const coupon = await Coupon.findByPk(couponId);

        if (!coupon) {
          return res.status(404).json({ message: "Không tìm thấy coupon" });
        }

        if (coupon.startTime && coupon.startTime > now) {
          return res.status(400).json({ message: "Coupon chưa đến thời gian bắt đầu" });
        }

        if (coupon.endTime && coupon.endTime <= now) {
          return res.status(400).json({ message: "Coupon đã hết hạn" });
        }

        if (coupon.usedCount >= coupon.totalQuantity) {
          return res.status(400).json({ message: "Coupon đã hết lượt sử dụng" });
        }
      }

      // 5. Tạo phần thưởng
      const newItem = await SpinReward.create(req.body);
      return res.status(201).json({ message: "Tạo thành công", data: newItem });
    } catch (error) {
      console.error("❌ Lỗi tạo phần thưởng:", error);
      return res.status(500).json({ message: "Lỗi server khi tạo phần thưởng" });
    }
  }

  // 📌 Cập nhật reward
  static async update(req, res) {
    try {
      const id = req.params.id;
      const item = await SpinReward.findByPk(id);
      if (!item) return res.status(404).json({ message: "Không tìm thấy phần thưởng" });

      const { probability, couponId } = req.body;

      // Kiểm tra range
      if (probability < 0 || probability > 100) {
        return res.status(400).json({ message: "Tỉ lệ phải nằm trong khoảng 0% - 100%" });
      }

      // Tính tổng trừ đi reward hiện tại
      const total = await SpinReward.sum("probability", {
        where: { id: { [Op.ne]: id } }
      });

      if ((total || 0) + probability > 100) {
        return res.status(400).json({
          message: `Tổng tỉ lệ hiện tại (không tính reward này) là ${total}%. Cập nhật ${probability}% sẽ vượt quá 100%.`
        });
      }

      // Nếu có couponId → kiểm tra còn hạn & còn lượt
      if (couponId) {
        const now = new Date();
        const coupon = await Coupon.findByPk(couponId);

        if (!coupon) {
          return res.status(404).json({ message: "Không tìm thấy coupon" });
        }

        if (coupon.startTime && coupon.startTime > now) {
          return res.status(400).json({ message: "Coupon chưa đến thời gian bắt đầu" });
        }

        if (coupon.endTime && coupon.endTime <= now) {
          return res.status(400).json({ message: "Coupon đã hết hạn" });
        }

        if (coupon.usedCount >= coupon.totalQuantity) {
          return res.status(400).json({ message: "Coupon đã hết lượt sử dụng" });
        }
      }

      await item.update(req.body);
      return res.json({ message: "Cập nhật thành công", data: item });
    } catch (error) {
      return res.status(500).json({ message: "Lỗi server khi cập nhật phần thưởng" });
    }
  }

  // 📌 Xoá reward
  static async remove(req, res) {
    try {
      const id = req.params.id;
      const item = await SpinReward.findByPk(id);
      if (!item) return res.status(404).json({ message: "Không tìm thấy phần thưởng" });

      await item.destroy();
      return res.json({ message: "Xoá thành công" });
    } catch (error) {
      return res.status(500).json({ message: "Lỗi server khi xoá phần thưởng" });
    }
  }
}

module.exports = SpinRewardController;
