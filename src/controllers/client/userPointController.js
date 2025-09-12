// controllers/UserController.js
const { UserPoint, sequelize } = require('../../models');
const { QueryTypes } = require('sequelize');

class UserController {

static async getUserPoints(req, res) {
  try {
    const userId = req.user.id;

    // 👉 Tổng điểm khả dụng
    const [result] = await sequelize.query(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN type IN ('spend','expired') THEN -points
             ELSE points
           END
         ), 0) AS totalPoints
       FROM userpoints
       WHERE userId = :userId`,
      {
        type: QueryTypes.SELECT,
        replacements: { userId },
      }
    );

    const totalPoints = result.totalPoints || 0;

    // 👉 Điểm sắp hết hạn trong 7 ngày
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
      totalPoints,                               // điểm hiện tại còn dùng được
      expiringSoon: Number(expiringRow.expiringSoon || 0), // sắp hết hạn trong 7 ngày
      expireDate: expiringRow.expireDate || null           // ngày gần nhất bị hết hạn
    });
  } catch (err) {
    console.error("❌ Lỗi getUserPoints:", err);
    return res.status(500).json({ message: "Lỗi server" });
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

    // Thêm filter theo type
    const where = { userId };
    if (req.query.type && ['earn', 'spend', 'expired', 'refund'].includes(req.query.type)) {
      where.type = req.query.type;
    }

    const { count, rows } = await UserPoint.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true, // 👈 để count không bị nhân đôi khi join
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
