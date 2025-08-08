const { Op } = require('sequelize');
const { SpinReward, Coupon } = require('../../models');

class SpinRewardController {
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = {};

      if (search) {
        whereClause.name = { [Op.like]: `%${search}%` };
      }

      if (status === 'active') {
        whereClause.isActive = true;
      } else if (status === 'inactive') {
        whereClause.isActive = false;
      } else if (status !== 'all') {
        return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
      }

      const { rows: data, count: total } = await SpinReward.findAndCountAll({
        where: whereClause,
        include: [{ model: Coupon, as: 'coupon', attributes: ['code'] }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']],
      });

      // Đếm riêng từng trạng thái cho badge tab
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

  static async getById(req, res) {
    try {
      const reward = await SpinReward.findByPk(req.params.id, {
        attributes: ['id', 'name', 'couponId', 'probability', 'isActive'],
        include: [{ model: Coupon, as: 'coupon', attributes: ['code'] }],
      });

      if (!reward) return res.status(404).json({ message: 'Không tìm thấy phần thưởng' });
      return res.json({ data: reward });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }

  static async create(req, res) {
    try {
      const newItem = await SpinReward.create(req.body);
      return res.status(201).json({ message: 'Tạo thành công', data: newItem });
    } catch (error) {
      console.error('❌ Lỗi tạo phần thưởng:', error);
      return res.status(500).json({ message: 'Lỗi server khi tạo phần thưởng' });
    }
  }

  static async update(req, res) {
    try {
      const id = req.params.id;
      const item = await SpinReward.findByPk(id);
      if (!item) return res.status(404).json({ message: 'Không tìm thấy phần thưởng' });

      await item.update(req.body);
      return res.json({ message: 'Cập nhật thành công', data: item });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi server khi cập nhật phần thưởng' });
    }
  }

  static async remove(req, res) {
    try {
      const id = req.params.id;
      const item = await SpinReward.findByPk(id);
      if (!item) return res.status(404).json({ message: 'Không tìm thấy phần thưởng' });

      await item.destroy();
      return res.json({ message: 'Xoá thành công' });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi server khi xoá phần thưởng' });
    }
  }
}

module.exports = SpinRewardController;
