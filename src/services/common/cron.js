// src/cron/clearExpiredTokens.js
const cron = require("node-cron");
const { UserToken } = require("../../models");
const { Op } = require("sequelize");

// ✅ Cron Job: Dọn dẹp token đã hết hạn hoặc đã sử dụng
cron.schedule("*/1 * * * *", async () => {
  try {
    const now = new Date();
    const deletedTokens = await UserToken.destroy({
      where: {
        [Op.and]: [
          { expiresAt: { [Op.lte]: now } }, // Hết hạn
          {
            [Op.or]: [
              { usedAt: { [Op.ne]: null } }, // Đã sử dụng
              { lockedUntil: { [Op.lte]: now } }, // Đã khóa và hết thời gian khóa
            ],
          },
        ],
      },
    });

    console.log(`✅ [Cron Job] Đã dọn dẹp ${deletedTokens} token đã hết hạn hoặc đã sử dụng.`);
  } catch (err) {
    console.error("❌ [Cron Job] Lỗi khi dọn dẹp token:", err);
  }
});
