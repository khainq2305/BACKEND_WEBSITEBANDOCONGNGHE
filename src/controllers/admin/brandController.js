const { Op } = require("sequelize");
const { Brand, Product, Sku } = require("../../models");
const slugify = require("slugify");

class BrandController {
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = "", status = "all" } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = {};
      let paranoid = true;

      if (search) {
        whereClause.name = { [Op.like]: `%${search}%` };
      }

      switch (status) {
        case "published":
          whereClause = { ...whereClause, isActive: 1 };
          break;
        case "draft":
          whereClause = { ...whereClause, isActive: 0 };
          break;
        case "trash":
          paranoid = false;
          whereClause = { ...whereClause, deletedAt: { [Op.not]: null } };
          break;
        case "all":
          break;
        default:
          return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }

      // Lấy danh sách dữ liệu phân trang
      const { rows, count } = await Brand.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [["orderIndex", "ASC"]],
        paranoid,
      });

      // Lấy số lượng theo từng trạng thái (không phân trang)
      const [totalAll, totalPublished, totalDraft, totalTrash] =
        await Promise.all([
          Brand.count({}),
          Brand.count({ where: { isActive: 1 } }),
          Brand.count({ where: { isActive: 0 } }),
          Brand.count({
            where: { deletedAt: { [Op.not]: null } },
            paranoid: false,
          }),
        ]);

      return res.json({
        success: true,
        data: rows,
        total: count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        counts: {
          all: totalAll,
          published: totalPublished,
          draft: totalDraft,
          trash: totalTrash,
        },
      });
    } catch (error) {
      console.error("GET BRANDS ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy danh sách brand", error });
    }
  }

  static async getById(req, res) {
    try {
      const brand = await Brand.findOne({ where: { slug: req.params.slug } });
      if (!brand)
        return res.status(404).json({ message: "Không tìm thấy brand" });
      return res.json({ data: brand });
    } catch (error) {
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async update(req, res) {
    try {
      const brand = await Brand.findOne({ where: { slug: req.params.slug } });
      if (!brand) {
        return res.status(404).json({ message: "Không tìm thấy brand" });
      }

      const { name, description, isActive, orderIndex } = req.body;
      let logoUrl = brand.logoUrl;

      if (req.file?.path) {
        logoUrl = req.file.path;
      }

      const newSlug = slugify(name, { lower: true, strict: true });

      const newOrder = Number(orderIndex);
      const oldOrder = brand.orderIndex;

      if (!isNaN(newOrder) && newOrder !== oldOrder) {
        if (newOrder > oldOrder) {
          await Brand.increment("orderIndex", {
            by: -1,
            where: {
              orderIndex: { [Op.gt]: oldOrder, [Op.lte]: newOrder },
              id: { [Op.not]: brand.id },
            },
          });
        } else {
          await Brand.increment("orderIndex", {
            by: 1,
            where: {
              orderIndex: { [Op.gte]: newOrder, [Op.lt]: oldOrder },
              id: { [Op.not]: brand.id },
            },
          });
        }
        brand.orderIndex = newOrder;
      }

      await brand.update({
        name,
        slug: newSlug,
        description,
        logoUrl,
        isActive: Number(isActive) === 1 || isActive === true,
        orderIndex: brand.orderIndex,
      });

      return res.json({ message: "Cập nhật thành công", data: brand });
    } catch (error) {
      console.error("Lỗi cập nhật brand:", error);
      return res.status(500).json({
        message: "Lỗi server khi cập nhật brand",
        error: error.message,
      });
    }
  }

 static async create(req, res) {
  try {
    const { name, description, orderIndex } = req.body;
    const logoUrl = req.file?.path;
    let isActive = req.body.isActive;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        field: "name",
        message: "Tên thương hiệu là bắt buộc!",
      });
    }

    // Mặc định isActive = true nếu không gửi
    isActive = Number(isActive ?? 1) === 1;

    const slug = slugify(name, { lower: true, strict: true });

    let finalOrderIndex = Number(orderIndex);
    if (isNaN(finalOrderIndex)) {
      const maxOrder = (await Brand.max("orderIndex")) || 0;
      finalOrderIndex = maxOrder + 1;
    } else {
      // Nếu người dùng nhập orderIndex thì đẩy các mục >= xuống
      await Brand.increment("orderIndex", {
        by: 1,
        where: {
          orderIndex: {
            [Op.gte]: finalOrderIndex,
          },
        },
      });
    }

    const brand = await Brand.create({
      name,
      slug,
      description,
      logoUrl,
      isActive,
      orderIndex: finalOrderIndex,
    });

    return res.status(201).json({
      message: "Tạo thương hiệu thành công",
      data: brand,
    });
  } catch (error) {
    console.error("Lỗi tạo brand:", error);
    return res.status(500).json({
      message: "Lỗi server khi tạo thương hiệu",
      error: error.message,
    });
  }
}



  static async softDelete(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const brands = await Brand.findAll({ where: { id: ids } });
      const existingIds = brands.map((b) => b.id);

      await Brand.destroy({ where: { id: existingIds } });

      return res.json({
        message: `Đã xoá mềm ${existingIds.length} brand`,
        trashed: existingIds,
      });
    } catch (error) {
      console.error("Lỗi khi xoá mềm:", error);
      return res.status(500).json({ message: "Lỗi server khi xoá mềm", error });
    }
  }

  static async restore(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const brands = await Brand.findAll({
        where: { id: ids },
        paranoid: false,
      });
      const existingIds = brands.map((b) => b.id);
      const notFound = ids.filter((id) => !existingIds.includes(id));

      const toRestore = brands
        .filter((b) => b.deletedAt !== null)
        .map((b) => b.id);
      const notTrashed = brands
        .filter((b) => b.deletedAt === null)
        .map((b) => b.id);

      await Brand.restore({ where: { id: toRestore } });

      return res.json({
        message: `Đã khôi phục ${toRestore.length} brand`,
        restored: toRestore,
        notTrashed,
        notFound,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi server khi khôi phục", error });
    }
  }

  static async forceDelete(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const brands = await Brand.findAll({
        where: { id: ids },
        paranoid: false,
      });
      const foundIds = brands.map((b) => b.id);
      const notFound = ids.filter((id) => !foundIds.includes(id));

      const products = await Product.findAll({
        where: { brandId: foundIds },
        attributes: ["brandId"],
        group: ["brandId"],
        raw: true,
      });

      const conflictIds = products.map((p) => p.brandId);
      const allowDeleteIds = foundIds.filter((id) => !conflictIds.includes(id));

      if (allowDeleteIds.length === 0) {
        return res.status(400).json({
          message: "Không thể xoá do còn sản phẩm liên kết",
          conflictIds,
        });
      }

      const deletedCount = await Brand.destroy({
        where: { id: allowDeleteIds },
        force: true,
      });

      return res.json({
        message: `Đã xoá ${deletedCount} thương hiệu`,
        deleted: allowDeleteIds,
        conflictIds,
        notFound,
      });
    } catch (error) {
      console.error("Lỗi xoá vĩnh viễn:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  }

  static async updateOrderIndex(req, res) {
    try {
      const ordered = req.body;
      if (!Array.isArray(ordered)) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      }

      const updatePromises = ordered.map(({ id, orderIndex }) =>
        Brand.update({ orderIndex }, { where: { id } })
      );
      await Promise.all(updatePromises);

      return res.json({ message: "Cập nhật thứ tự thành công" });
    } catch (error) {
      console.error("Lỗi updateOrderIndex:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật thứ tự", error });
    }
  }
}

module.exports = BrandController;
