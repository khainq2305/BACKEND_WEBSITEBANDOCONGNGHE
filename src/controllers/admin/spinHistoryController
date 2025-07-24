const { Op } = require('sequelize');
const { SpinHistory, User, SpinReward, Coupon } = require('../../models');

const spinHistoryController = {
  async getAll(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      userId = '',
      rewardId = 'all',
      couponType = 'all'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = {};
    const includeOptions = [
      {
        model: User,
        as: 'user',
        attributes: ['fullName'],
        required: false,
      },
    ];

    if (search) {
      whereClause.rewardName = { [Op.like]: `%${search}%` };
    }

    if (userId) {
      const parsedUserId = parseInt(userId);
      if (isNaN(parsedUserId)) {
        return res.status(400).json({ message: 'ID người dùng không hợp lệ.' });
      }
      whereClause.userId = parsedUserId;
    }

    if (rewardId !== 'all') {
      if (rewardId === 'none_won') {
        whereClause.rewardId = { [Op.is]: null };
      } else {
        const parsedRewardId = parseInt(rewardId);
        if (isNaN(parsedRewardId)) {
          return res.status(400).json({ message: 'ID phần thưởng không hợp lệ.' });
        }
        whereClause.rewardId = parsedRewardId;
      }
    } else if (couponType !== 'all') {
      includeOptions.push({
        model: SpinReward,
        as: 'reward',
        required: true,
        include: [
          {
            model: Coupon,
            as: 'coupon',
            where: { type: couponType },
            required: true
          }
        ]
      });
    }

    const { rows, count } = await SpinHistory.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: includeOptions,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      total: count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
      counts: { all: count },
    });
  } catch (err) {
    console.error('Lỗi khi lấy danh sách lịch sử quay:', err);
    return res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}
,

  async getById(req, res) {
    try {
      const { id } = req.params;
      const history = await SpinHistory.findByPk(id);
      if (!history) {
        return res.status(404).json({ message: 'Không tìm thấy lịch sử quay.' });
      }
      return res.status(200).json(history);
    } catch (err) {
      console.error('Lỗi khi lấy lịch sử quay theo ID:', err);
      return res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  },
};

module.exports = spinHistoryController;
