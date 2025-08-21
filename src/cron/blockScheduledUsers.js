const { Op } = require('sequelize');
const User = require('../models/userModel');
// console.log('[CRON] Kiểm tra tài khoản cần khóa lúc', new Date().toLocaleTimeString());

const blockScheduledUsers = async () => {
  try {
    const now = new Date();

    const usersToBlock = await User.findAll({
      where: {
        scheduledBlockAt: {
          [Op.lte]: now
        },
        status: 1
      }
    });

    for (const user of usersToBlock) {
      await user.update({
        status: 0,
        scheduledBlockAt: null
      });

      console.log(`[CRON] Đã khóa tài khoản: ${user.email}`);
    }
  } catch (error) {
    console.error('❌ Cron job lỗi:', error);
  }
};

module.exports = blockScheduledUsers;
