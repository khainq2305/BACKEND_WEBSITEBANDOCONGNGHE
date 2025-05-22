// src/cron/clearExpiredTokens.js
const cron = require("node-cron");
const { UserToken } = require("../../models");
const { Op } = require("sequelize");


cron.schedule("*/1 * * * *", async () => {
  try {
    const now = new Date();
    const deletedTokens = await UserToken.destroy({
      where: {
        [Op.and]: [
          { expiresAt: { [Op.lte]: now } },
          {
            [Op.or]: [
              { usedAt: { [Op.ne]: null } }, 
              { lockedUntil: { [Op.lte]: now } }, 
            ],
          },
        ],
      },
    });

    console.log(`[Cron Job] Đã dọn dẹp ${deletedTokens} token đã hết hạn hoặc đã sử dụng.`);
  } catch (err) {
    console.error("❌ [Cron Job] Lỗi khi dọn dẹp token:", err);
  }
});
