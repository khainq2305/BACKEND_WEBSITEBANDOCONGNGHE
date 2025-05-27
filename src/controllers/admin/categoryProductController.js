const Category = require("../../models/categoryModel");
const { Op } = require("sequelize");

class CategoryProductController {
  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      const search = req.query.search?.trim() || "";
      const isActive = req.query.isActive;
      const isDeleted = req.query.isDeleted === "true";

      const whereClause = {};

      
      if (isDeleted) {
        whereClause.deletedAt = { [Op.not]: null };
      } else {
        whereClause.deletedAt = null;
      }

      if (search) {
        whereClause.name = { [Op.like]: `%${search}%` };
      }

      if (isActive === "true") {
        whereClause.isActive = true;
      } else if (isActive === "false") {
        whereClause.isActive = false;
      }

      const { rows: data, count: total } = await Category.findAndCountAll({
        where: whereClause,
        limit,
        offset,
      order: [['sortOrder', 'ASC']], 

        paranoid: false,
      });

    
      const [all, active, inactive, trashed] = await Promise.all([
        Category.count({ where: { deletedAt: null }, paranoid: false }),
        Category.count({
          where: { isActive: true, deletedAt: null },
          paranoid: false,
        }),
        Category.count({
          where: { isActive: false, deletedAt: null },
          paranoid: false,
        }),
        Category.count({
          where: { deletedAt: { [Op.not]: null } },
          paranoid: false,
        }),
      ]);

      return res.status(200).json({
        data,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        counts: {
          all,
          active,
          inactive,
          trashed,
        },
      });
    } catch (error) {
      console.error("❌ Lỗi lấy danh sách danh mục:", error);
      res.status(500).json({
        message: "Không thể lấy danh sách danh mục",
        error: error.message,
      });
    }
  }

  static async getById(req, res) {
    try {
      const category = await Category.findByPk(req.params.id);
      if (!category) {
        return res.status(404).json({ message: "Không tìm thấy danh mục." });
      }
      res.status(200).json(category);
    } catch (err) {
      console.error("Lỗi lấy danh mục:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async create(req, res) {
    try {
      const {
        name,
        slug,
        description,
        parentId,
        isActive,
        orderIndex,
        isDefault,
      } = req.body;
      const thumbnail = req.file?.path;

      if (!thumbnail) {
        return res
          .status(400)
          .json({ field: "thumbnail", message: "Vui lòng chọn ảnh đại diện!" });
      }
      const newCategory = await Category.create({
        name,
        slug,
        description,
        parentId: parentId || null,
        isActive: isActive !== "false",
        orderIndex: Number(orderIndex) || 0,
        isDefault: isDefault === "true" || false,
        thumbnail,
      });

      res.status(201).json(newCategory);
    } catch (err) {
      console.error("❌ Lỗi tạo danh mục:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server!", error: err.message });
    }
  }

  static async update(req, res) {
    try {
      const category = await Category.findByPk(req.params.id);
      if (!category) {
        return res.status(404).json({ message: "Không tìm thấy danh mục." });
      }

      const {
        name,
        slug,
        description,
        parentId,
        isActive,
        orderIndex,
        isDefault,
      } = req.body;

      let thumbnail = category.thumbnail;

      if (req.file && req.file.path) {
        thumbnail = req.file.path;
      }

      await category.update({
        name,
        slug,
        description,
        parentId: parentId || null,
        isActive: isActive !== "false",
        orderIndex: Number(orderIndex) || 0,
        isDefault: isDefault === "true" || false,
        thumbnail,
      });

      res.status(200).json(category);
    } catch (err) {
      console.error("Lỗi cập nhật danh mục:", err);
      res.status(500).json({ message: "Lỗi server!", error: err.message });
    }
  }

  static async delete(req, res) {
    try {
      const category = await Category.findByPk(req.params.id);
      if (!category) {
        return res.status(404).json({ message: "Không tìm thấy danh mục." });
      }

      await category.destroy();
      res.status(200).json({ message: "Đã xóa danh mục thành công." });
    } catch (err) {
      console.error("Lỗi xóa danh mục:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async forceDeleteMany(req, res) {
    try {
      console.log("📥 Nhận body:", req.body);
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      // ✅ Kiểm tra xem có bản ghi nào tồn tại và đã bị soft delete chưa
      const toDelete = await Category.findAll({
        where: { id: ids },
        paranoid: false,
      });

      console.log("🔍 Bản ghi tìm thấy (bao gồm cả đã xoá mềm):");
      toDelete.forEach((item) => {
        console.log(`- ID: ${item.id}, deletedAt: ${item.deletedAt}`);
      });

      const deleted = await Category.destroy({
        where: { id: ids },
        force: true,
      });

      res.json({ message: `Đã xoá vĩnh viễn ${deleted} danh mục` });
    } catch (error) {
      console.error("❌ Lỗi xoá vĩnh viễn:", error);
      res.status(500).json({ message: "Lỗi server khi xoá vĩnh viễn", error });
    }
  }

  static async softDeleteMany(req, res) {
    try {
      const { ids } = req.body;
      console.log("🗑️ Danh sách cần xóa mềm:", ids); // ✅ LOG

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const deleted = await Category.destroy({
        where: { id: ids },
      });

      console.log(`✅ Đã soft delete ${deleted} danh mục`);

      res.json({ message: `Đã chuyển ${deleted} danh mục vào thùng rác` });
    } catch (error) {
      console.error("❌ Lỗi xoá mềm:", error);
      res.status(500).json({ message: "Lỗi server khi xoá mềm", error });
    }
  }

  static async restore(req, res) {
    console.log("📥 Đã vào route khôi phục danh mục");

    try {
      const id = req.params.id;
      console.log("🔍 Khôi phục ID:", id);

      const category = await Category.findByPk(id, { paranoid: false });

      if (!category) {
        console.log("⚠️ Không tìm thấy danh mục để khôi phục");
        return res.status(404).json({ message: "Không tìm thấy danh mục." });
      }

      await category.restore();
      res.json({ message: "✅ Khôi phục thành công!" });
    } catch (err) {
      console.error("❌ Lỗi khôi phục:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async restoreMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const restorePromises = ids.map((id) =>
        Category.restore({ where: { id }, paranoid: false })
      );

      await Promise.all(restorePromises);

      res.json({ message: `Đã khôi phục ${ids.length} danh mục` });
    } catch (error) {
      console.error("❌ Lỗi khôi phục danh mục:", error);
      res
        .status(500)
        .json({ message: "Lỗi server khi khôi phục danh mục", error });
    }
  }

  static async forceDelete(req, res) {
    try {
      const { id } = req.params;

      const category = await Category.findByPk(id, { paranoid: false });
      if (!category) {
        return res.status(404).json({ message: "Không tìm thấy danh mục." });
      }

      await category.destroy({ force: true });

      res.json({ message: "✅ Đã xoá vĩnh viễn danh mục." });
    } catch (err) {
      console.error("❌ Lỗi xoá vĩnh viễn:", err);
      res.status(500).json({ message: "Lỗi server!" });
    }
  }

  static async updateOrderIndex(req, res) {
    console.log("🛠️ Gọi tới API cập nhật thứ tự");

    const { ordered } = req.body;
    console.log("📦 Danh sách nhận:", ordered);
    try {
      const { ordered } = req.body;

      if (!Array.isArray(ordered)) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      }

      const updatePromises = ordered.map(({ id, orderIndex }) =>
        Category.update({ orderIndex }, { where: { id } })
      );

      await Promise.all(updatePromises);

      return res.json({ message: "✅ Cập nhật thứ tự thành công" });
    } catch (error) {
      console.error("❌ Lỗi updateOrderIndex:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật thứ tự", error });
    }
  }

  static async restoreAll(req, res) {
    try {
      const restored = await Category.restore({
        where: {
          deletedAt: { [Op.not]: null },
        },
      });

      res.json({
        message: `✅ Đã khôi phục tất cả danh mục (${restored})`,
      });
    } catch (error) {
      console.error("❌ Lỗi khôi phục tất cả:", error);
      res.status(500).json({
        message: "Lỗi server khi khôi phục tất cả danh mục",
        error,
      });
    }
  }

  static async forceDeleteAll(req, res) {
    try {
      const deleted = await Category.destroy({
        where: {
          deletedAt: { [Op.not]: null },
        },
        force: true,
      });

      res.json({
        message: `✅ Đã xoá vĩnh viễn tất cả danh mục trong thùng rác (${deleted})`,
      });
    } catch (error) {
      console.error("❌ Lỗi xoá vĩnh viễn tất cả:", error);
      res.status(500).json({
        message: "Lỗi server khi xoá vĩnh viễn tất cả danh mục",
        error,
      });
    }
  }
}

module.exports = CategoryProductController;
