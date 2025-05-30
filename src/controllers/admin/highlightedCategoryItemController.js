const { HighlightedCategoryItem, Category } = require("../../models");
const { Op, literal } = require("sequelize");
const slugify = require("../../utils/slugify");
const { sequelize } = require("../../models");
class HighlightedCategoryItemController {
  static async create(req, res) {
    const t = await sequelize.transaction();
    try {
      let baseSlug = slugify(req.body.customTitle || "");
      if (!baseSlug) {
        throw {
          status: 400,
          errors: [{ field: "customTitle", message: "Tiêu đề không hợp lệ" }],
        };
      }

      const existing = await HighlightedCategoryItem.findAll({
        where: { slug: { [Op.like]: `${baseSlug}%` } },
        attributes: ["slug"],
        transaction: t,
      });

      let slug = baseSlug;
      if (existing.length) {
        const suffixes = existing
          .map((it) => {
            const m = it.slug.match(new RegExp(`^${baseSlug}-(\\d+)$`));
            return m ? parseInt(m[1], 10) : null;
          })
          .filter((n) => n !== null);
        const next = suffixes.length ? Math.max(...suffixes) + 1 : 1;
        slug = `${baseSlug}-${next}`;
      }

      let sortOrder;
      if (req.body.sortOrder === undefined || req.body.sortOrder === "") {
        // Nếu không nhập gì → mặc định 0
        sortOrder = 0;

        // Kiểm tra đã có item sortOrder = 0 chưa
        const existedZero = await HighlightedCategoryItem.findOne({
          where: { sortOrder: 0 },
          transaction: t,
        });

        if (existedZero) {
          // Đẩy item cũ có sortOrder = 0 lên thành 1
          await HighlightedCategoryItem.update(
            { sortOrder: literal("sortOrder + 1") },
            {
              where: { sortOrder: { [Op.gte]: 0 } },
              transaction: t,
            }
          );
        }
      } else {
        // Nhập thủ công thì dùng giá trị người dùng
        sortOrder = parseInt(req.body.sortOrder, 10);

        await HighlightedCategoryItem.update(
          { sortOrder: literal("sortOrder + 1") },
          {
            where: { sortOrder: { [Op.gte]: sortOrder } },
            transaction: t,
          }
        );
      }

      const imageUrl = req.file?.filename;

      const item = await HighlightedCategoryItem.create(
        {
          ...req.body,
          slug,
          sortOrder,
          imageUrl,
          isActive: req.body.isActive === "true",
        },
        { transaction: t }
      );

      await t.commit();
      return res.status(201).json({ message: "Tạo thành công", data: item });
    } catch (err) {
      await t.rollback();
      console.error(err);
      if (err.status === 400)
        return res.status(400).json({ errors: err.errors });
      return res
        .status(500)
        .json({ message: "Lỗi server", error: err.message || err });
    }
  }

  static async list(req, res) {
  try {
    const { search = "", page = 1, limit = 10, isActive, deleted } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (search) {
      whereClause.customTitle = { [Op.like]: `%${search}%` };
    }

    // Lọc theo trạng thái hoạt động
    if (isActive === "true") {
      whereClause.isActive = true;
    } else if (isActive === "false") {
      whereClause.isActive = false;
    }

    // Nếu là thùng rác
    const isTrash = deleted === "true";

    const { rows, count } = await HighlightedCategoryItem.findAndCountAll({
      where: whereClause,
      include: {
        model: Category,
        as: "category",
        attributes: ["id", "name"],
        where: {
          isActive: true,
          isDefault: false,
  
        },
        required: false,
      },
      offset: +offset,
      limit: +limit,
      order: [["sortOrder", "ASC"]],
      paranoid: !isTrash, // lấy luôn deleted nếu là thùng rác
    });

    // Thống kê tab
    const [totalAll, totalActive, totalInactive, totalTrash] = await Promise.all([
      HighlightedCategoryItem.count({ paranoid: true }),
      HighlightedCategoryItem.count({ where: { isActive: true }, paranoid: true }),
      HighlightedCategoryItem.count({ where: { isActive: false }, paranoid: true }),

    ]);

    res.json({
      data: rows,
      pagination: {
        totalItems: count,
        currentPage: +page,
        totalPages: Math.ceil(count / limit),
        limit: +limit,
      },
      stats: {
        totalAll,
        totalActive,
        totalInactive,

      },
    });
  } catch (err) {
    console.error("❌ Lỗi list:", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
  }
}


  static async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const item = await HighlightedCategoryItem.findByPk(id, {
        transaction: t,
      });
      if (!item) return res.status(404).json({ message: "Không tìm thấy" });

      // Xử lý slug nếu đổi title
      if (req.body.customTitle && req.body.customTitle !== item.customTitle) {
        let baseSlug = slugify(req.body.customTitle);
        const existing = await HighlightedCategoryItem.findAll({
          where: { slug: { [Op.like]: `${baseSlug}%` }, id: { [Op.ne]: id } },
          attributes: ["slug"],
          transaction: t,
        });
        let slug = baseSlug;
        if (existing.length) {
          const suffix = existing
            .map((it) => {
              const m = it.slug.match(new RegExp(`^${baseSlug}-(\\d+)$`));
              return m ? +m[1] : null;
            })
            .filter((n) => n != null);
          slug = suffix.length
            ? `${baseSlug}-${Math.max(...suffix) + 1}`
            : `${baseSlug}-1`;
        }
        req.body.slug = slug;
      }

      // Xử lý sortOrder nếu đổi
      if (req.body.sortOrder && +req.body.sortOrder !== item.sortOrder) {
        const newOrder = +req.body.sortOrder;
        // đẩy +1 tất cả mục ≥ newOrder
        await HighlightedCategoryItem.update(
          { sortOrder: literal("sortOrder + 1") },
          {
            where: { sortOrder: { [Op.gte]: newOrder }, id: { [Op.ne]: id } },
            transaction: t,
          }
        );
      }

      await item.update(req.body, { transaction: t });
      await t.commit();
      return res.json({ message: "Cập nhật thành công", data: item });
    } catch (err) {
      await t.rollback();
      console.error(err);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: err.message });
    }
  }
  static async delete(req, res) {
    try {
      const { id } = req.params;
      const item = await HighlightedCategoryItem.findByPk(id);
      if (!item) return res.status(404).json({ message: "Không tìm thấy" });

      await item.destroy();
      res.json({ message: "✅ Đã xoá thành công" });
    } catch (err) {
      res.status(500).json({ message: "❌ Lỗi xoá", error: err.message });
    }
  }
  static async getById(req, res) {
    try {
      const item = await HighlightedCategoryItem.findByPk(req.params.id, {
        include: {
          model: Category,
          as: "category",
          attributes: ["id", "name"],
        },
      });
      if (!item) return res.status(404).json({ message: "Không tìm thấy" });
      res.json(item);
    } catch (err) {
      res
        .status(500)
        .json({ message: "❌ Lỗi lấy chi tiết", error: err.message });
    }
  }
  static async reorder(req, res) {
    const t = await sequelize.transaction();
    try {
      const { items } = req.body; // [{ id: 5, sortOrder: 1 }, { id: 2, sortOrder: 2 }, ...]

      if (!Array.isArray(items)) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      }

      // Duyệt và cập nhật từng mục
      for (const item of items) {
        await HighlightedCategoryItem.update(
          { sortOrder: item.sortOrder },
          { where: { id: item.id }, transaction: t }
        );
      }

      await t.commit();
      res.json({ message: "✅ Đã cập nhật thứ tự thành công" });
    } catch (err) {
      await t.rollback();
      console.error("❌ Lỗi reorder:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }
  static async deleteMany(req, res) {
    const t = await sequelize.transaction();
    try {
      const { ids } = req.body; // ví dụ: [3, 4, 7]

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      await HighlightedCategoryItem.destroy({
        where: { id: ids },
        transaction: t,
      });

      await t.commit();
      res.json({ message: "✅ Đã xoá các mục thành công" });
    } catch (err) {
      await t.rollback();
      console.error("❌ Lỗi xoá nhiều:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }
  static async getCategories(req, res) {
    try {
      const parents = await Category.findAll({
        attributes: ["id", "name", "parentId"],
        where: {
          deletedAt: null,
          isActive: true,
        },
        include: [
          {
            model: Category,
            as: "children",
            attributes: ["id", "name", "parentId"],
            where: {
              deletedAt: null,
              isActive: true,
            },
            required: false,
          },
        ],
        order: [["name", "ASC"]],
        paranoid: false,
      });

      res.json(parents);
    } catch (err) {
      console.error("❌ Lỗi lấy danh mục:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }
}

module.exports = HighlightedCategoryItemController;
