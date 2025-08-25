// src/controllers/admin/spinHistoryController.js
const { Op } = require('sequelize');
const { SpinHistory, User, SpinReward } = require('../../models');

const spinHistoryController = {
  async getAll(req, res) {
  try {
  
    const {
      page = 1,
      limit = 10,
      search = '',
      userId = '',
      rewardId = 'all',
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
      {
        model: SpinReward,
        as: 'reward',
        attributes: ['name'],
        required: false,
      }
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

    // Lọc Đã Trúng và Không Trúng dựa trên rewardName, vì rewardId không đáng tin cậy
    if (rewardId === 'won') {
      whereClause.rewardName = { [Op.not]: 'CHÚC MAY MẮN' };
    } else if (rewardId === 'none_won') {
      whereClause.rewardName = 'CHÚC MAY MẮN';
    }
    
    const { rows, count } = await SpinHistory.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: includeOptions,
    });

    const [totalAll, totalWon, totalNoneWon] = await Promise.all([
      SpinHistory.count(),
      SpinHistory.count({ where: { rewardName: { [Op.not]: 'CHÚC MAY MẮN' } } }),
      SpinHistory.count({ where: { rewardName: 'CHÚC MAY MẮN' } }),
    ]);

    return res.status(200).json({
      success: true,
      data: rows,
      total: count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / parseInt(limit)),
      counts: { 
        all: totalAll,
        won: totalWon,
        none_won: totalNoneWon,
      },
    });
  } catch (err) {
    console.error('Lỗi khi lấy danh sách lịch sử quay:', err);
    return res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
},
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