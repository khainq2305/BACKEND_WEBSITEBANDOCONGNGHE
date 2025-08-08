// controllers/UserController.js
const { UserPoint, sequelize } = require('../../models');
const { QueryTypes } = require('sequelize');

class UserController {
  // Lấy tổng điểm
 static async getUserPoints(req, res) {
  try {
    const userId = req.user.id;

    // 1. Tổng điểm (đã loại trừ điểm hết hạn bằng expired record)
    const [result] = await sequelize.query(
      `SELECT
         SUM(
           CASE
             WHEN type = 'earn' THEN points
             WHEN type IN ('spend', 'expired') THEN -points
             ELSE 0
           END
         ) AS totalPoints
       FROM userpoints
       WHERE userId = :userId`,
      {
        type: QueryTypes.SELECT,
        replacements: { userId },
      }
    );
    const totalPoints = result.totalPoints || 0;

    // 2. Tổng điểm sẽ hết hạn trong 7 ngày tới
    const [expiringRow] = await sequelize.query(
      `SELECT
         COALESCE(SUM(points), 0) AS expiringSoon,
         MIN(DATE(expiresAt)) AS expireDate
       FROM userpoints
       WHERE userId = :userId
         AND type = 'earn'
         AND expiresAt IS NOT NULL
         AND expiresAt BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)`,
      {
        type: QueryTypes.SELECT,
        replacements: { userId },
      }
    );

    return res.json({
      totalPoints,
      expiringSoon: Number(expiringRow.expiringSoon || 0),
      expireDate: expiringRow.expireDate || null
    });
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

    const { UserPoint, Order } = require('../../models');

    const { count, rows } = await UserPoint.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: Order,
          as: 'order',
          attributes: ['orderCode'],
          required: false,
        },
      ],
    });

    const totalPages = Math.ceil(count / limit);

    return res.json({
      total: count,
      totalPages,
      page,
      pageSize: limit,
      history: rows.map(item => ({
        id: item.id,
        points: Math.abs(item.points),
        type: item.type,
        orderId: item.orderId,
        orderCode: item.order?.orderCode || null,
        sourceType: item.sourceType,
        description: item.description,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
      })),
    });
  } catch (err) {
    console.error('❌ Lỗi getPointHistory:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}


}

module.exports = UserController;
