const {
  FlashSale,
  FlashSaleItem,
  FlashSaleCategory,
  Sku,
  Category,
  Product,
} = require("../../models");
const { sequelize } = require("../../models");
const { Op } = require("sequelize");
const slugify = require("slugify");

function buildCategoryTree(flatList, parentId = null) {
  return flatList
    .filter((cat) => cat.parentId === parentId)
    .map((cat) => ({
      ...cat,
      children: buildCategoryTree(flatList, cat.id),
    }));
}
class FlashSaleController {
  static async list(req, res) {
    try {
      const { page = 1, limit = 10, tab = "all", search = "" } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};
      let paranoid = true;

      if (tab === "active") {
        whereClause.isActive = true;
        whereClause.deletedAt = null;
      } else if (tab === "inactive") {
        whereClause.isActive = false;
        whereClause.deletedAt = null;
      } else if (tab === "trash") {
        whereClause.deletedAt = { [Op.ne]: null };
        paranoid = false;
      }

      if (search) {
        whereClause.title = { [Op.like]: `%${search.trim()}%` };
      }

      const result = await FlashSale.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [["createdAt", "DESC"]],
        paranoid,
      });

      const [totalActive, totalInactive, totalTrash] = await Promise.all([
        FlashSale.count({ where: { isActive: true, deletedAt: null } }),
        FlashSale.count({ where: { isActive: false, deletedAt: null } }),
        FlashSale.count({
          where: { deletedAt: { [Op.ne]: null } },
          paranoid: false,
        }),
      ]);

      return res.json({
        count: result.count,
        rows: result.rows,
        totalActive,
        totalInactive,
        totalTrash,
      });
    } catch (err) {
      return res
        .status(500)
        .json({ message: "Server error", error: err.message });
    }
  }

  static async getById(req, res) {
    try {
      const { slug } = req.params;

      const flashSale = await FlashSale.findOne({
        where: { slug },
        include: [
          {
            model: FlashSaleItem,
            as: "flashSaleItems",
            include: [
              {
                model: Sku,
                as: "flashSaleSku",
                include: [
                  {
                    model: Product,
                    as: "product",
                  },
                ],
              },
            ],
          },
          {
            model: FlashSaleCategory,
            as: "categories",
            include: [
              {
                model: Category,
                as: "category",
              },
            ],
          },
        ],
      });

      if (!flashSale) {
        return res.status(404).json({ message: "Không tìm thấy Flash Sale" });
      }
      console.log("--- DỮ LIỆU TỪ DATABASE SERVER ---");
      console.log(JSON.stringify(flashSale, null, 2));
      console.log("-----------------------------------");
      // ====================================================

      res.json(flashSale);
    } catch (err) {
      console.error("Lỗi getById Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

static async update(req, res) {
  const t = await sequelize.transaction();
  try {
    const { slug } = req.params;

    const flashSale = await FlashSale.findOne({ where: { slug } });
    if (!flashSale) {
      return res.status(404).json({ message: "Không tìm thấy" });
    }

    const { title, description, startTime, endTime, isActive, bgColor } = req.body;
    const items = req.body.items ? JSON.parse(req.body.items) : [];
    const categories = req.body.categories ? JSON.parse(req.body.categories) : [];

    const updateData = {
      title,
      description,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      slug: slugify(title || "", {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g,
      }),
      isActive,
      bgColor,
    };

    if (req.file) {
      updateData.bannerUrl = req.file.path;
    }

    // 🔁 Xử lý thay đổi orderIndex nếu cần
    const newOrderIndex = parseInt(req.body.orderIndex);
    const currentOrderIndex = flashSale.orderIndex;

    if (!isNaN(newOrderIndex)) {
      const hasConflict = await FlashSale.findOne({
        where: { orderIndex: newOrderIndex, id: { [Op.ne]: flashSale.id } },
      });

      if (hasConflict || newOrderIndex !== currentOrderIndex) {
        if (newOrderIndex > currentOrderIndex) {
          await FlashSale.decrement("orderIndex", {
            by: 1,
            where: {
              orderIndex: {
                [Op.gt]: currentOrderIndex,
                [Op.lte]: newOrderIndex,
              },
            },
            transaction: t,
          });
        } else {
          await FlashSale.increment("orderIndex", {
            by: 1,
            where: {
              orderIndex: {
                [Op.gte]: newOrderIndex,
                [Op.lt]: currentOrderIndex,
              },
            },
            transaction: t,
          });
        }
        updateData.orderIndex = newOrderIndex;
      }
    }

    // 📝 Cập nhật flashSale chính
    await flashSale.update(updateData, { transaction: t });

    // 🔍 Lấy FlashSaleItem cũ để xử lý cập nhật
    const existingItems = await FlashSaleItem.findAll({
      where: { flashSaleId: flashSale.id },
      transaction: t,
    });
    const existingMap = new Map(existingItems.map(it => [it.skuId, it]));

    const incomingSkuIds = items.map(i => i.skuId || i.id);

    // 🧹 Xoá những item không còn nữa
    await FlashSaleItem.destroy({
      where: {
        flashSaleId: flashSale.id,
        skuId: { [Op.notIn]: incomingSkuIds },
      },
      transaction: t,
    });

    // 🔁 Cập nhật hoặc tạo mới các item
    for (const item of items) {
      const skuId = item.skuId || item.id;
      const incomingQty = parseInt(item.quantity);
      const oldItem = existingMap.get(skuId);

      if (oldItem) {
        const soldCount = Math.max(oldItem.originalQuantity - oldItem.quantity, 0);
        const newOriginalQuantity = Math.max(oldItem.originalQuantity, incomingQty + soldCount);

        await oldItem.update({
          salePrice: item.salePrice,
          quantity: incomingQty,
          originalQuantity: newOriginalQuantity,
          maxPerUser: item.maxPerUser,
          note: item.note || "",
        }, { transaction: t });
      } else {
        await FlashSaleItem.create({
          skuId,
          salePrice: item.salePrice,
          quantity: incomingQty,
          originalQuantity: parseInt(item.quantity),
          maxPerUser: item.maxPerUser,
          note: item.note || "",
          flashSaleId: flashSale.id,
        }, { transaction: t });
      }
    }

    // 🔁 Xoá hết & thêm lại categories
    await FlashSaleCategory.destroy({
      where: { flashSaleId: flashSale.id },
      transaction: t,
    });

    if (categories.length > 0) {
      const catData = categories.map(cat => ({
        categoryId: cat.categoryId,
        discountType: cat.discountType || "percent",
        discountValue: cat.discountValue,
        maxPerUser: cat.maxPerUser,
        flashSaleId: flashSale.id,
      }));
      await FlashSaleCategory.bulkCreate(catData, { transaction: t });
    }

    await t.commit();
    req.app.locals.io.emit("flash-sale-updated");

    res.json({ message: "Cập nhật thành công" });
  } catch (err) {
    await t.rollback();
    console.error("Lỗi cập nhật Flash Sale:", err);
    res.status(500).json({ message: "Lỗi server: " + err.message });
  }
}



  static async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const { title, description, startTime, endTime, isActive, bgColor } =
        req.body;

      const items = req.body.items ? JSON.parse(req.body.items) : [];
      const categories = req.body.categories
        ? JSON.parse(req.body.categories)
        : [];

      const bannerUrl = req.file ? req.file.path : null;

      const slug = slugify(title || "", {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g,
      });

      let finalOrderIndex = parseInt(req.body.orderIndex);
      if (isNaN(finalOrderIndex)) {
        finalOrderIndex = 0;
      }

      // Đẩy các mục đang có orderIndex >= finalOrderIndex xuống 1 bậc
      await FlashSale.increment("orderIndex", {
        by: 1,
        where: {
          orderIndex: {
            [Op.gte]: finalOrderIndex,
          },
        },
        transaction: t,
      });

      const flashSale = await FlashSale.create(
        {
          title,
          bannerUrl,
          startTime,
          endTime,
          slug,
          description,
          isActive,
          bgColor,
          orderIndex: finalOrderIndex,
        },
        { transaction: t }
      );

      if (items.length > 0) {
        const itemData = items.map((item) => ({
          skuId: item.skuId || item.id,
          salePrice: item.salePrice,
          quantity: item.quantity,
          originalQuantity: parseInt(item.quantity) || 0,

          maxPerUser: item.maxPerUser,
          note: item.note || "",
          flashSaleId: flashSale.id,
        }));
        await FlashSaleItem.bulkCreate(itemData, { transaction: t });
      }

      if (categories.length > 0) {
        const catData = categories.map((cat) => ({
          categoryId: cat.categoryId,
          discountType: cat.discountType || "percent",
          discountValue: cat.discountValue,
          maxPerUser: cat.maxPerUser,
          flashSaleId: flashSale.id,
        }));
        await FlashSaleCategory.bulkCreate(catData, { transaction: t });
      }

      await t.commit();
      req.app.locals.io.emit("flash-sale-updated");

      res.status(201).json({ message: "Tạo thành công", data: flashSale });
    } catch (err) {
      await t.rollback();
      console.error("Lỗi tạo Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server: " + err.message });
    }
  }

  static async forceDelete(req, res) {
    try {
      const flashSale = await FlashSale.findOne({
        where: { id: req.params.id },
        paranoid: false,
      });

      if (!flashSale) {
        return res.status(404).json({ message: "Không tìm thấy" });
      }

      await flashSale.destroy({ force: true });
      res.json({ message: "Đã xoá vĩnh viễn flash sale" });
    } catch (err) {
      console.error("Lỗi xoá vĩnh viễn Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async forceDeleteMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const deletedCount = await FlashSale.destroy({
        where: { id: { [Op.in]: ids } },
        force: true,
      });

      res.json({ message: `Đã xoá vĩnh viễn ${deletedCount} mục` });
    } catch (err) {
      console.error("Lỗi xoá vĩnh viễn nhiều Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async softDelete(req, res) {
    try {
      const flashSale = await FlashSale.findByPk(req.params.id);
      if (!flashSale)
        return res.status(404).json({ message: "Không tìm thấy" });

      await flashSale.destroy();
      res.json({ message: "Đã chuyển vào thùng rác" });
    } catch (err) {
      console.error("Lỗi xoá mềm Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
  static async softDeleteMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      await FlashSale.destroy({
        where: { id: { [Op.in]: ids } },
      });

      res.json({ message: `Đã xoá tạm thời ${ids.length} mục` });
    } catch (err) {
      console.error("Lỗi xoá mềm nhiều Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
  static async restore(req, res) {
    try {
      const flashSale = await FlashSale.findOne({
        where: { id: req.params.id },
        paranoid: false,
      });

      if (!flashSale || !flashSale.deletedAt) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy hoặc không bị xoá" });
      }

      await flashSale.restore();
      res.json({ message: "Đã khôi phục" });
    } catch (err) {
      console.error("Lỗi khôi phục Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
  static async restoreMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const list = await FlashSale.findAll({
        where: {
          id: { [Op.in]: ids },
          deletedAt: { [Op.not]: null },
        },
        paranoid: false,
      });

      for (const flashSale of list) {
        await flashSale.restore();
      }

      res.json({ message: `Đã khôi phục ${list.length} mục` });
    } catch (err) {
      console.error("Lỗi khôi phục nhiều Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async getAvailableSkus(req, res) {
    try {
      const skus = await Sku.findAll({
        where: {
          isActive: true,
          deletedAt: null,
        },
        include: [
          {
            model: Product,
            as: "product",
            attributes: ["name"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      const result = skus.map((sku) => ({
        id: sku.id,
        skuCode: sku.skuCode,
        productName: sku.product?.name ?? "",
        price: sku.price,
        originalPrice: sku.originalPrice,
        stock: sku.stock,
        label: `${sku.product?.name} - ${
          sku.skuCode
        } - ${sku.originalPrice?.toLocaleString("vi-VN")}đ`,
      }));

      res.json(result);
    } catch (err) {
      console.error("Lỗi lấy SKU:", err);
      res.status(500).json({ message: "Lỗi server khi lấy danh sách SKU" });
    }
  }

  static async getAvailableCategoriesWithTree(req, res) {
    try {
      const allCategories = await Category.findAll({
        where: {
          deletedAt: null,
          isActive: true,
          isDefault: false,
        },
        raw: true,
        order: [["sortOrder", "ASC"]],
      });

      const tree = buildCategoryTree(allCategories);
      return res.json(tree);
    } catch (err) {
      console.error("Lỗi lấy danh mục:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }
  static async updateOrder(req, res) {
    try {
      const { orderedIds } = req.body;

      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const updatePromises = orderedIds.map((id, index) => {
        return FlashSale.update({ orderIndex: index + 1 }, { where: { id } });
      });

      await Promise.all(updatePromises);

      req.app.locals.io.emit("flash-sale-reordered");

      res.json({ message: "Cập nhật thứ tự thành công" });
    } catch (err) {
      console.error("Lỗi cập nhật thứ tự Flash Sale:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = FlashSaleController;
