const cron = require('node-cron');
const { Op } = require('sequelize');
const { Post } = require('../../models');

// Chạy mỗi phút
cron.schedule('* * * * *', async () => {
    console.log('🕒 Cron chạy lúc:', new Date().toLocaleTimeString());
  try {
    const result = await Post.update(
      { status: 1 },
      {
        where: {
          status: 2,
          publishAt: { [Op.lte]: new Date() }
        }
      }
    );

    if (result[0] > 0) {
      console.log(`✅ Đã tự đăng ${result[0]} bài viết.`);
    }
  } catch (err) {
    console.error('❌ Lỗi khi tự đăng bài:', err);
  }
});
