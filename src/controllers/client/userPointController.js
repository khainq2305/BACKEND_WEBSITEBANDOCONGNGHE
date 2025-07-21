// controllers/UserController.js
const { UserPoint, sequelize } = require('../../models');
const { QueryTypes } = require('sequelize');

class UserController {
  // Lấy tổng điểm
  static async getUserPoints(req, res) {
    try {
      const userId = req.user.id;

      const [result] = await sequelize.query(
        `SELECT
           SUM(CASE WHEN type = 'earn' THEN points
                    WHEN type = 'spend' THEN -points
                    ELSE 0 END) AS totalPoints
         FROM userpoints
         WHERE userId = :userId`,
        {
          type: QueryTypes.SELECT,
          replacements: { userId },
        }
      );

      const totalPoints = result.totalPoints || 0;
      return res.json({ totalPoints });
    } catch (err) {
      console.error('❌ Lỗi getUserPoints:', err);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }

  // Lấy lịch sử điểm
  static async getPointHistory(req, res) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const { count, rows } = await UserPoint.findAndCountAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return res.json({
        total: count,
        page,
        pageSize: limit,
        history: rows,
      });
    } catch (err) {
      console.error('❌ Lỗi getPointHistory:', err);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = UserController;
