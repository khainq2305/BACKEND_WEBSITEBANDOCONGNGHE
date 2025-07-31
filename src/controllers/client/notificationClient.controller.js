// src/controllers/client/notificationClient.controller.js
const { Notification, NotificationUser } = require("../../models");
const { Op } = require("sequelize");

const NotificationClientController = {
  async getForCurrentUser(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

    try {
      const notifications = await Notification.findAll({
        where: {
          isActive: true,
          [Op.or]: [{ startAt: null }, { startAt: { [Op.lte]: new Date() } }],
          [Op.or]: [
            { isGlobal: true },
            { "$notificationUsers.userId$": userId },
          ],
        },

        include: [
          {
            model: NotificationUser,
            as: "notificationUsers",
            required: false,
            where: { userId },
            attributes: ["isRead", "readAt"],
          },
        ],
        order: [
          ["startAt", "DESC"],
          ["createdAt", "DESC"],
        ],
      });

      const formatted = notifications.map((n) => {
        const noti = n.toJSON();
        const userLink = noti.notificationUsers?.[0];
        noti.isRead = userLink?.isRead === true;
        delete noti.notificationUsers;
        return noti;
      });

      return res.json(formatted);
    } catch (err) {
      console.error("Lỗi lấy thông báo client:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },
  // async getForCurrentUser(req, res) {
  //   const userId = req.user?.id;
  //   if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

  //   try {
  //     const now = new Date();

  //     // 🔹 Lấy thông báo cá nhân (NotificationUser + Notification)
  //     const personal = await Notification.findAll({
  //       where: {
  //         isActive: true,
  //         [Op.or]: [{ startAt: null }, { startAt: { [Op.lte]: now } }],
  //       },
  //       include: [
  //         {
  //           model: NotificationUser,
  //           as: "notificationUsers",
  //           required: true, // ✅ Quan trọng: chỉ lấy nếu có đúng userId
  //           where: { userId },
  //           attributes: ["isRead", "readAt"],
  //         },
  //       ],
  //       order: [
  //         ["startAt", "DESC"],
  //         ["createdAt", "DESC"],
  //       ],
  //     });

  //     // 🔹 Lấy thông báo toàn cục
  //     const global = await Notification.findAll({
  //       where: {
  //         isActive: true,
  //         isGlobal: true,
  //         [Op.or]: [{ startAt: null }, { startAt: { [Op.lte]: now } }],
  //       },
  //       order: [
  //         ["startAt", "DESC"],
  //         ["createdAt", "DESC"],
  //       ],
  //     });

  //     // 🔹 Gộp + xử lý kết quả
  //     const formatted = [
  //       ...personal.map((n) => {
  //         const json = n.toJSON();
  //         const link = json.notificationUsers?.[0];
  //         return {
  //           ...json,
  //           isRead: link?.isRead || false,
  //         };
  //       }),
  //       ...global.map((n) => ({
  //         ...n.toJSON(),
  //         isRead: false,
  //       })),
  //     ];

  //     return res.json(formatted);
  //   } catch (err) {
  //     console.error("Lỗi getForCurrentUser:", err);
  //     return res.status(500).json({ message: "Lỗi máy chủ" });
  //   }
  // },
  async markAsRead(req, res) {
    const userId = req.user?.id;
    const notificationId = req.params.id;

    if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

    try {
      const [record, created] = await NotificationUser.findOrCreate({
        where: { notificationId, userId },
        defaults: { isRead: true, readAt: new Date() },
      });

      if (!created && !record.isRead) {
        record.isRead = true;
        record.readAt = new Date();
        await record.save();
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("Lỗi đánh dấu đã đọc:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },
async markAllAsRead(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

  try {
    const notifications = await Notification.findAll({
      where: {
        isActive: true,
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [
          { isGlobal: true },
          { "$notificationUsers.userId$": userId },
        ],
      },
      include: [
        {
          model: NotificationUser,
          as: "notificationUsers",
          required: false,
          where: { userId },
          attributes: ["id", "isRead", "readAt"], // ✅ cần có id
        },
      ],
      order: [["startAt", "DESC"]],
    });

    console.log("📥 Tổng thông báo cần xử lý:", notifications.length);

    const toUpdate = [];
    const toInsert = [];

    for (const notif of notifications) {
      const link = notif.notificationUsers?.[0];

      if (link) {
        console.log(`🔎 Đã có NotificationUser ID=${link.id}, isRead=${link.isRead}`);
        if (!link.isRead) {
          toUpdate.push(link.id);
        }
      } else {
        console.log(`➕ Thêm mới notificationUser cho notificationId=${notif.id}`);
        toInsert.push({
          notificationId: notif.id,
          userId,
          isRead: true,
          readAt: new Date(),
        });
      }
    }

    console.log("✅ Sẽ insert mới:", toInsert.length, "records");
    console.log("♻️  Sẽ cập nhật đã đọc:", toUpdate.length, "records");

    if (toInsert.length > 0) {
      await NotificationUser.bulkCreate(toInsert);
    }

    if (toUpdate.length > 0) {
      await NotificationUser.update(
        { isRead: true, readAt: new Date() },
        { where: { id: toUpdate } }
      );
    }

    return res.json({ message: "Đã đánh dấu đã đọc tất cả" });
  } catch (err) {
    console.error("❌ Lỗi markAllAsRead:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

};

module.exports = NotificationClientController;
