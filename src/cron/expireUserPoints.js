const { Op } = require("sequelize");
const { UserPoint } = require("../models");

module.exports = async function expireUserPoints() {
  const now = new Date();

  // Lấy các điểm earn đã hết hạn, chưa bị trừ
  const expiringPoints = await UserPoint.findAll({
    where: {
      type: "earn",
      expiresAt: { [Op.lte]: now },
    },
  });

  let expiredCount = 0;

  for (const point of expiringPoints) {
  const existed = await UserPoint.findOne({
  where: {
    type: "expired",
    userId: point.userId,
    orderId: point.orderId,
    points: -point.points, // ✅ kiểm tra đúng chiều âm
  },
});


    if (existed) continue;

    await UserPoint.create({
      userId: point.userId,
      orderId: point.orderId,
      points: -point.points, // ✅ Trừ điểm
      type: "expired",
      sourceType: point.sourceType,
      description: "Điểm hết hạn tự động sau 1 năm",
    });

    expiredCount++;
  }

  console.log(`✔ Đã xử lý hết hạn ${expiredCount} điểm.`);
};
