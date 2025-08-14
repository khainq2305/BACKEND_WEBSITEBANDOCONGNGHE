const { Op } = require("sequelize");
const {
  Coupon,
  Role,
  CouponUser,
  CouponItem,
  SpinReward,
  User,
  Sku,
} = require("../../models");
const { sequelize } = require("../../models");

class CouponController {
  static async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const { userIds = [], productIds = [], ...couponData } = req.body;

      const coupon = await Coupon.create(couponData, { transaction: t });

      if (userIds.length > 0) {
        const userRecords = userIds.map((userId) => ({
          couponId: coupon.id,
          userId,
        }));
        await CouponUser.bulkCreate(userRecords, { transaction: t });
      }

      if (productIds.length > 0) {
        const productRecords = productIds.map((skuId) => ({
          couponId: coupon.id,
          skuId,
        }));
        await CouponItem.bulkCreate(productRecords, { transaction: t });
      }

      await t.commit();
      res
        .status(201)
        .json({ message: "Thêm mã giảm giá thành công", data: coupon });
    } catch (err) {
      await t.rollback();
      console.error("Lỗi tạo mã giảm giá:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async list(req, res) {
    try {
      const { search = "", status = "all", page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (search) {
        whereClause[Op.or] = [
          { code: { [Op.like]: `%${search}%` } },
          { title: { [Op.like]: `%${search}%` } },
        ];
      }

      if (status === "active") {
        whereClause.isActive = true;
      } else if (status === "inactive") {
        whereClause.isActive = false;
      } else if (status === "deleted") {
        whereClause.deletedAt = { [Op.not]: null };
      }

      const [result, totalCount, activeCount, inactiveCount, deletedCount] =
        await Promise.all([
          Coupon.findAndCountAll({
            where: whereClause,
            offset: parseInt(offset),
            limit: parseInt(limit),
            order: [["createdAt", "DESC"]],
            paranoid: status !== "deleted",
          }),
          Coupon.count(),
          Coupon.count({ where: { isActive: true } }),
          Coupon.count({ where: { isActive: false } }),
          Coupon.count({
            where: { deletedAt: { [Op.not]: null } },
            paranoid: false,
          }),
        ]);

      const { rows, count } = result;

      res.json({
        data: rows,
        pagination: {
          totalItems: count,
          currentPage: +page,
          totalPages: Math.ceil(count / limit),
          limit: +limit,
        },
        summary: {
          total: totalCount,
          active: activeCount,
          inactive: inactiveCount,
          deleted: deletedCount,
        },
      });
    } catch (err) {
      console.error(" Lỗi lấy danh sách mã giảm:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const coupon = await Coupon.findByPk(id);
      if (!coupon) {
        return res.status(404).json({ message: "Không tìm thấy mã giảm giá" });
      }

      const { userIds = [], productIds = [], ...couponData } = req.body;

      await coupon.update(couponData, { transaction: t });

      // Xử lý user
      const currentUsers = await CouponUser.findAll({
        where: { couponId: id },
        transaction: t,
      });
      const currentUserIds = currentUsers.map((u) => u.userId);

      const toDeleteUser = currentUserIds.filter(
        (uid) => !userIds.includes(uid)
      );
      const toAddUser = userIds.filter((uid) => !currentUserIds.includes(uid));

      if (toDeleteUser.length > 0) {
        await CouponUser.destroy({
          where: { couponId: id, userId: toDeleteUser },
          force: true,
          transaction: t,
        });
      }

      if (toAddUser.length > 0) {
        const newUsers = toAddUser.map((userId) => ({ couponId: id, userId }));
        await CouponUser.bulkCreate(newUsers, { transaction: t });
      }
      const currentItems = await CouponItem.findAll({
        where: { couponId: id },
        paranoid: false,
        transaction: t,
      });
      const currentItemIds = currentItems.map((i) => i.skuId);

      const toDeleteItem = currentItemIds.filter(
        (pid) => !productIds.includes(pid)
      );
      const toAddItem = productIds.filter(
        (pid) => !currentItemIds.includes(pid)
      );

      if (toDeleteItem.length > 0) {
        await CouponItem.destroy({
          where: { couponId: id, skuId: toDeleteItem },
          force: true,
          transaction: t,
        });
      }

      if (toAddItem.length > 0) {
        const newItems = toAddItem.map((skuId) => ({ couponId: id, skuId }));
        await CouponItem.bulkCreate(newItems, { transaction: t });
      }

      await t.commit();
      res.json({ message: "Cập nhật thành công", data: coupon });
    } catch (err) {
      await t.rollback();
      console.error("Lỗi cập nhật mã giảm:", err);
      res.status(500).json({ message: "Lỗi cập nhật", error: err.message });
    }
  }

  static async softDelete(req, res) {
    try {
      const { id } = req.params;
      const coupon = await Coupon.findByPk(id);
      if (!coupon)
        return res.status(404).json({ message: "Không tìm thấy mã giảm giá" });

      await coupon.destroy();
      res.json({ message: "Đã xoá tạm thời" });
    } catch (err) {
      res.status(500).json({ message: " Lỗi xoá mềm", error: err.message });
    }
  }

  static async softDeleteMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids))
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });

      await Coupon.destroy({
        where: { id: { [Op.in]: ids } },
      });

      res.json({ message: "Đã xoá tạm thời nhiều mã" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi xoá nhiều", error: err.message });
    }
  }

  static async restore(req, res) {
    try {
      const { id } = req.params;
      const coupon = await Coupon.findOne({ where: { id }, paranoid: false });
      if (!coupon || !coupon.deletedAt)
        return res
          .status(404)
          .json({ message: "Không tìm thấy hoặc không bị xoá" });

      await coupon.restore();
      res.json({ message: "Đã khôi phục" });
    } catch (err) {
      res.status(500).json({ message: " Lỗi khôi phục", error: err.message });
    }
  }

  static async restoreMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids))
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });

      const deletedCoupons = await Coupon.findAll({
        where: {
          id: { [Op.in]: ids },
          deletedAt: { [Op.not]: null },
        },
        paranoid: false,
      });

      for (const coupon of deletedCoupons) {
        await coupon.restore();
      }

      res.json({ message: "Đã khôi phục nhiều mã" });
    } catch (err) {
      res
        .status(500)
        .json({ message: " Lỗi khôi phục nhiều", error: err.message });
    }
  }

  static async forceDelete(req, res) {
    try {
      const { id } = req.params;
      const coupon = await Coupon.findOne({ where: { id }, paranoid: false });
      if (!coupon) {
        return res.status(404).json({ message: "Không tìm thấy mã giảm giá" });
      }

      const hasUsed = await CouponUser.findOne({
        where: { couponId: id, used: 1 },
      });
      if (hasUsed) {
        return res.status(400).json({
          message: "Không thể xoá mã giảm giá vì đã được sử dụng",
        });
      }

      await coupon.destroy({ force: true });
      res.json({ message: "Đã xoá vĩnh viễn" });
    } catch (err) {
      if (err.name === "SequelizeForeignKeyConstraintError") {
        return res.status(400).json({
          message: "Không thể xoá mã giảm giá vì đang được sử dụng",
        });
      }

      console.error("forceDelete error:", err);
      res.status(500).json({
        message: "Lỗi xoá vĩnh viễn",
        error: err.message,
      });
    }
  }

  static async forceDeleteMany(req, res) {
    const t = await sequelize.transaction();
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const usedCoupons = await CouponUser.findAll({
        where: {
          couponId: { [Op.in]: ids },
          used: 1,
        },
        attributes: ["couponId"],
        group: ["couponId"],
      });

      const usedCouponIds = usedCoupons.map((c) => c.couponId);

      if (usedCouponIds.length === ids.length) {
        return res.status(400).json({
          message: "Không thể xoá các mã giảm giá vì đã được sử dụng",
          usedCouponIds,
        });
      }

      const deletableIds = ids.filter((id) => !usedCouponIds.includes(id));

      if (deletableIds.length === 0) {
        return res.status(400).json({
          message: "Không có mã nào đủ điều kiện xoá",
        });
      }

      await CouponUser.destroy({
        where: { couponId: { [Op.in]: deletableIds } },
        force: true,
        transaction: t,
      });
      await CouponItem.destroy({
        where: { couponId: { [Op.in]: deletableIds } },
        force: true,
        transaction: t,
      });
      await SpinReward.destroy({
        where: { couponId: { [Op.in]: deletableIds } },
        force: true,
        transaction: t,
      });

      await Coupon.destroy({
        where: { id: { [Op.in]: deletableIds } },
        force: true,
        transaction: t,
      });

      await t.commit();

      let msg = `Đã xoá vĩnh viễn ${deletableIds.length} mã`;
      if (usedCouponIds.length > 0) {
        msg += `. ${usedCouponIds.length} mã đã bị bỏ qua vì đã được sử dụng`;
      }

      res.json({
        message: msg,
        deletedIds: deletableIds,
        skippedIds: usedCouponIds,
      });
    } catch (err) {
      await t.rollback();

      if (err.name === "SequelizeForeignKeyConstraintError") {
        return res.status(400).json({
          message: "Không thể xoá mã giảm giá vì đang được sử dụng",
        });
      }

      console.error("forceDeleteMany error:", err);
      res.status(500).json({
        message: "Lỗi xoá vĩnh viễn nhiều",
        error: err.message,
      });
    }
  }

  static async getUsers(req, res) {
    try {
      const list = await User.findAll({
        where: {
          deletedAt: {
            [Op.is]: null,
          },
        },
        include: [
          {
            model: Role,
            as: "roles",
            where: { key: "user" },
            attributes: [],
          },
        ],
        attributes: ["id", "email", "fullName"],
        order: [["fullName", "ASC"]],
      });

      res.json(list);
    } catch (err) {
      console.error("Lỗi getUsers:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async getProducts(req, res) {
    try {
      const list = await Sku.findAll({
        where: { deletedAt: null, isActive: true },
        attributes: ["id", "skuCode"],
        include: {
          model: require("../../models").Product,
          as: "product",
          attributes: ["name"],
          where: { deletedAt: null, isActive: true },
        },
        order: [["skuCode", "ASC"]],
      });

      res.json(
        list.map((sku) => ({
          id: sku.id,
          label: `${sku.skuCode} - ${sku.product?.name || ""}`,
        }))
      );
    } catch (err) {
      console.error("Lỗi getProducts:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;

      const coupon = await Coupon.findOne({
        where: { id },
        include: [
          {
            model: CouponUser,
            as: "users",
            attributes: ["userId"],
            paranoid: false,
          },
          {
            model: CouponItem,
            as: "products",
            attributes: ["skuId"],
            paranoid: false,
          },
        ],
        paranoid: false,
      });

      if (!coupon) {
        return res.status(404).json({ message: "Không tìm thấy mã giảm giá" });
      }

      res.json({
        ...coupon.toJSON(),
        userIds: coupon.users?.map((c) => c.userId) || [],
        productIds: coupon.products?.map((c) => c.skuId) || [],
      });
    } catch (err) {
      console.error("Lỗi getById:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }
}

module.exports = CouponController;
