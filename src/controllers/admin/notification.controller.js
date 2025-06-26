const { Notification } = require("../../models");
const { NotificationUser } = require("../../models");
const { Op } = require("sequelize");

const NotificationController = {
  async create(req, res) {
    try {
      const {
        title,
        message,
        link,
        targetType,
        targetId,
        isGlobal = true,
        type,
        isActive = true,
        startAt,
        userIds,
        slug,
      } = req.body;

      const imageUrl = req.file?.path || "";
      // Kiểm tra trùng tiêu đề
      const existing = await Notification.findOne({ where: { title } });
      if (existing) {
        return res
          .status(400)
          .json({ message: "Tên thông báo này đã tồn tại" });
      }

      let notification;

      try {
        notification = await Notification.create({
          title,
          slug,
          message,
          imageUrl,
          link,
          targetType,
          targetId: targetId ? Number(targetId) : null,
          isGlobal: isGlobal === "true" || isGlobal === true,
          type,
          isActive: isActive === "true" || isActive === true,
          startAt: startAt ? new Date(startAt) : null,
        });
      } catch (err) {
        console.error("Lỗi khi tạo Notification:", err);
        return res
          .status(500)
          .json({ message: "Tạo Notification thất bại", error: err.message });
      }

      // Nếu là thông báo cho từng user
      if (isGlobal === "false" || isGlobal === false || isGlobal === "0") {
        let parsed = [];

        if (typeof userIds === "string") {
          try {
            parsed = JSON.parse(userIds);
          } catch (err) {
            console.error("userIds parse lỗi:", userIds);
            return res.status(400).json({ message: "userIds không hợp lệ" });
          }
        } else if (Array.isArray(userIds)) {
          parsed = userIds;
        }

        if (parsed.length > 0) {
          const inserts = parsed.map((userId) => ({
            notificationId: notification.id,
            userId,
            isRead: false,
          }));

          try {
            await NotificationUser.bulkCreate(inserts);
          } catch (err) {
            console.error("Lỗi khi tạo NotificationUser:", err);
            return res
              .status(500)
              .json({ message: "Tạo user nhận thông báo thất bại" });
          }
        }
      }

      return res
        .status(201)
        .json({ message: "Tạo thông báo thành công", data: notification });
    } catch (err) {
      console.error("Lỗi tạo thông báo:", err);
      return res
        .status(500)
        .json({ message: "Lỗi máy chủ", error: err.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        title,
        message,
        link,
        targetType,
        targetId,
        type,
        isActive,
        isGlobal,
        startAt,
        userIds,
        slug,
      } = req.body;

      const notification = await Notification.findByPk(id);
      const existing = await Notification.findOne({
        where: {
          title,
          id: { [Op.ne]: id },
        },
      });
      if (existing) {
        return res
          .status(400)
          .json({ message: "Tên thông báo này đã tồn tại" });
      }

      if (!notification)
        return res.status(404).json({ message: "Không tìm thấy thông báo" });

      const imageUrl = req.file?.path || notification.imageUrl;

      await notification.update({
        title,
        slug,
        message,
        imageUrl,
        link,
        targetType,
        targetId: targetId ? Number(targetId) : null,
        type,
        isActive: isActive === "true" || isActive === true,
        isGlobal: isGlobal === "true" || isGlobal === true,
        startAt: startAt ? new Date(startAt) : null,
      });

      // Cập nhật danh sách user nhận thông báo nếu isGlobal = false
      if (isGlobal === "false" || isGlobal === false || isGlobal === "0") {
        await NotificationUser.destroy({ where: { notificationId: id } });

        let parsed = [];

        if (typeof userIds === "string") {
          try {
            parsed = JSON.parse(userIds);
          } catch (err) {
            return res.status(400).json({ message: "userIds không hợp lệ" });
          }
        } else if (Array.isArray(userIds)) {
          parsed = userIds;
        }

        if (parsed.length > 0) {
          const inserts = parsed.map((userId) => ({
            notificationId: id,
            userId,
            isRead: false,
          }));
          await NotificationUser.bulkCreate(inserts);
        }
      }

      return res.json({ message: "Cập nhật thành công", data: notification });
    } catch (err) {
      console.error("Lỗi cập nhật:", err);
      return res
        .status(500)
        .json({ message: "Lỗi máy chủ", error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const { search = "", isActive, type } = req.query;

      const where = {};

      if (search) {
        where[Op.or] = [
          { title: { [Op.like]: `%${search}%` } },
          { message: { [Op.like]: `%${search}%` } },
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === "true";
      }

      if (type) {
        where.type = type;
      }

      const { rows, count } = await Notification.findAndCountAll({
        where,
        offset,
        limit,
        order: [["createdAt", "DESC"]],
      });

      const allCount = await Notification.count();
      const activeCount = await Notification.count({
        where: { isActive: true },
      });
      const hiddenCount = await Notification.count({
        where: { isActive: false },
      });

      return res.status(200).json({
        data: rows,
        total: count,
        counts: {
          all: allCount,
          active: activeCount,
          hidden: hiddenCount,
        },
      });
    } catch (err) {
      console.error("Lỗi getAll notification:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      const notification = await Notification.findByPk(id);

      if (!notification) {
        return res.status(404).json({ message: "Không tìm thấy thông báo" });
      }

      await notification.destroy();

      return res.json({ message: "Đã xoá thông báo thành công" });
    } catch (err) {
      console.error("Lỗi xoá thông báo:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  async getById(req, res) {
    const { id } = req.params;
    const notification = await Notification.findByPk(id);
    if (!notification)
      return res.status(404).json({ message: "Không tìm thấy thông báo" });

    return res.json(notification);
  },

  async deleteMany(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      await Notification.destroy({
        where: { id: ids },
        force: true,
      });

      return res.json({ message: "Đã xoá thành công" });
    } catch (error) {
      console.error("Lỗi xoá nhiều:", error);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  async getBySlug(req, res) {
    try {
      const { slug } = req.params;
      const notification = await Notification.findOne({ where: { slug } });

      if (!notification) {
        return res.status(404).json({ message: "Không tìm thấy thông báo" });
      }

      return res.json(notification);
    } catch (err) {
      console.error("Lỗi getBySlug:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },
};
module.exports = NotificationController;
