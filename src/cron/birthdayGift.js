const cron = require("node-cron");
const { Op, Sequelize } = require("sequelize");
const {
  User,
  CouponUser,
  Notification,
  NotificationUser,
} = require("../models");

const sendEmail = require("../utils/sendEmail");
const BIRTHDAY_COUPON_ID = 29;

cron.schedule("* * * * *", async () => {
  try {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    const birthdayUsers = await User.findAll({
      where: {
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("DAY", Sequelize.col("dateOfBirth")),
            day
          ),
          Sequelize.where(
            Sequelize.fn("MONTH", Sequelize.col("dateOfBirth")),
            month
          ),

          {
            [Op.or]: [
              { receivedBirthdayVoucherYear: null },
              { receivedBirthdayVoucherYear: { [Op.ne]: year } },
            ],
          },
        ],
      },
    });

    if (!birthdayUsers.length) {
      return console.log("🎉 Không có user sinh nhật hôm nay.");
    }

    for (const user of birthdayUsers) {
      const { id: userId, email, fullName } = user;

      await CouponUser.create({
        userId,
        couponId: BIRTHDAY_COUPON_ID,
      });

      await user.update({ receivedBirthdayVoucherYear: year });

      const notification = await Notification.create({
        title: "🎁 Chúc mừng sinh nhật!",
        message:
          "Bạn đã nhận được một mã giảm giá đặc biệt nhân dịp sinh nhật 🎉",
        imageUrl: "https://example.com/birthday-banner.png",
        link: "/khuyen-mai",
        type: "promotion",
        slug: `birthday-voucher-${userId}-${Date.now()}`,
        isGlobal: false,
        targetType: "promotion",
        targetId: BIRTHDAY_COUPON_ID,
      });

      await NotificationUser.create({
        userId,
        notificationId: notification.id,
      });

      // Gửi email
      const html = `
        <h2>🎉 Chúc mừng sinh nhật ${fullName || "bạn"}!</h2>
        <p>Chúng tôi gửi tặng bạn một <b>mã giảm giá đặc biệt</b> nhân dịp sinh nhật.</p>
        <p>Hãy vào trang khuyến mãi để xem chi tiết và sử dụng nhé!</p>
        <a href="https://yourdomain.com/khuyen-mai" style="display: inline-block; background-color: #f472b6; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Xem ngay</a>
        <p>Chúc bạn một ngày sinh nhật thật vui vẻ!</p>
      `;

      if (email) {
        await sendEmail(
          email,
          "🎁 Mừng sinh nhật! Nhận ngay ưu đãi đặc biệt",
          html
        );
      }

      console.log(`🎉 Gửi thành công cho userId ${userId}`);
    }
  } catch (err) {
    console.error("❌ Lỗi cron birthdayGift:", err);
  }
});
