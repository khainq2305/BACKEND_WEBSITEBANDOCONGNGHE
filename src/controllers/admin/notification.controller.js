const { Notification } = require("../../models");
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
      } = req.body;

      const imageUrl = req.file?.path || "";

      const notification = await Notification.create({
        title,
        message,
        imageUrl,
        link,
        targetType,
        targetId,
        isGlobal,
        type,
        isActive,
        createdAt: new Date(),
      });

      return res
        .status(201)
        .json({ message: "Tạo thông báo thành công", data: notification });
    } catch (err) {
      console.error("🚨 Lỗi tạo thông báo:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },


  async getAll(req, res) {
    try {
      console.log("📥 QUERY:", req.query); 

      const { page = 1, limit = 10, search = "", isActive, type } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};

      
      if (search) {
        whereClause[Op.or] = [
          { title: { [Op.like]: `%${search}%` } },
          { message: { [Op.like]: `%${search}%` } },
        ];
      }

      if (isActive === "true") whereClause.isActive = true;
      else if (isActive === "false") whereClause.isActive = false;


      const allowedTypes = ["system", "promotion", "order", "news"];
      if (type && allowedTypes.includes(type)) {
        whereClause.type = type;
      }


      const { rows, count } = await Notification.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [
          ["orderIndex", "ASC"],
          ["createdAt", "DESC"],
        ],
        distinct: true,
      });

      return res.json({
        success: true,
        data: rows,
        total: count,
        currentPage: parseInt(page),
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách thông báo:", error);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },


  async update(req, res) {
    try {
      const { id } = req.params;
      const { title, message, link, targetType, targetId, type, isActive } =
        req.body;

      const notification = await Notification.findByPk(id);
      if (!notification)
        return res.status(404).json({ message: "Không tìm thấy thông báo" });

      const imageUrl = req.file?.path || notification.imageUrl;

      await notification.update({
        title,
        message,
        imageUrl,
        link,
        targetType,
        targetId,
        type,
        isActive,
      });

      return res.json({ message: "Cập nhật thành công", data: notification });
    } catch (err) {
      console.error("❌ Lỗi cập nhật:", err);
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


async updateOrderIndex(req, res) {
  try {
    const updates = req.body; 
    if (!Array.isArray(updates)) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }

    const promises = updates.map(({ id, orderIndex }) =>
      Notification.update({ orderIndex }, { where: { id } })
    );

    await Promise.all(promises);

    return res.json({ message: 'Cập nhật thứ tự thành công' });
  } catch (error) {
    console.error('Lỗi updateOrderIndex:', error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật thứ tự' });
  }
}


};

module.exports = NotificationController;
