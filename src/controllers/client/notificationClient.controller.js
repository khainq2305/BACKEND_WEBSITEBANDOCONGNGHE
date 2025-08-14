// src/controllers/client/notificationClient.controller.js
const { Notification, NotificationUser } = require("../../models");
const { Op } = require("sequelize");

const NotificationClientController = {
  async  getForCurrentUser(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

  const role = req.user?.role === "admin" ? "admin" : "client";

  try {
    const notifications = await Notification.findAll({
      where: {
        isActive: true,
        [Op.and]: [
          { [Op.or]: [{ startAt: null }, { startAt: { [Op.lte]: new Date() } }] },
          {
            [Op.or]: [
              {
                [Op.and]: [
                  { isGlobal: true },
                  { targetRole: { [Op.in]: [role, null] } },
                ],
              },
              { "$notificationUsers.userId$": userId },
            ],
          },
        ],
      },
      include: [
        {
          model: NotificationUser,
          as: "notificationUsers",
          required: false,
          where: { userId },
          attributes: ["isRead", "readAt"]
        },
      ],
      order: [
        ["startAt", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    const formatted = notifications.map(n => {
      const obj = n.toJSON();
      obj.isRead = obj.notificationUsers?.[0]?.isRead === true;
      delete obj.notificationUsers;
      return obj;
    });

    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
}
,

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
          console.log(
            `🔎 Đã có NotificationUser ID=${link.id}, isRead=${link.isRead}`
          );
          if (!link.isRead) {
            toUpdate.push(link.id);
          }
        } else {
          console.log(
            `➕ Thêm mới notificationUser cho notificationId=${notif.id}`
          );
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
  },
};

module.exports = NotificationClientController;
