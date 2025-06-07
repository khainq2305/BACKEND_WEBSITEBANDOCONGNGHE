const {
  VariantValue,
  Variant,
  SkuVariantValue,
  sequelize,
} = require("../../models");
const { Op } = require("sequelize");
const slugify = require("slugify");

class VariantValueController {
  static async getByVariant(req, res) {
    try {
      const { id } = req.params;
      const { deleted, search = "", page = 1, limit = 10 } = req.query;

      const isTrash = deleted === "true";
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      const variant = await Variant.findByPk(id);
      if (!variant) {
        return res.status(404).json({ message: "Không tìm thấy biến thể cha" });
      }

      const whereClause = {
        variantId: id,
        ...(search ? { value: { [Op.like]: `%${search}%` } } : {}),
      };

      if (isTrash) {
        whereClause.deletedAt = { [Op.ne]: null };
      } else {
      }

      const { rows, count } = await VariantValue.findAndCountAll({
        where: whereClause,
        order: [["sortOrder", "ASC"]],
        limit: parseInt(limit, 10),
        offset: offset,
        paranoid: !isTrash,
      });

      const totalAllCount = await VariantValue.count({
        where: { variantId: id },
        paranoid: true,
      });
      const totalActiveCount = await VariantValue.count({
        where: { variantId: id, isActive: true },
        paranoid: true,
      });
      const totalInactiveCount = await VariantValue.count({
        where: { variantId: id, isActive: false },
        paranoid: true,
      });
      const totalTrashCount = await VariantValue.count({
        where: { variantId: id, deletedAt: { [Op.ne]: null } },
        paranoid: false,
      });

      res.json({
        data: rows,
        variantName: variant.name,
        variantType: variant.type,
        total: count,
        counts: {
          all: totalAllCount,
          active: totalActiveCount,
          inactive: totalInactiveCount,
          trash: totalTrashCount,
        },
        currentPage: parseInt(page, 10),
        totalPages: Math.ceil(count / parseInt(limit, 10)),
      });
    } catch (err) {
      console.error("Lỗi lấy giá trị theo variant:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async create(req, res) {
    const t = await VariantValue.sequelize.transaction();
    try {
      const { variantId, value, sortOrder, isActive, colorCode } = req.body;
      let imageUrl = null;

    
      const variantExists = await Variant.findByPk(variantId, {
        transaction: t,
      });
      if (!variantExists) {
        await t.rollback();
        return res.status(404).json({ message: "Biến thể cha không tồn tại." });
      }

      if (!value || value.trim() === "") {
        await t.rollback();
        return res
          .status(400)
          .json({ field: "value", message: "Giá trị không được để trống." });
      }

    
      const existingValue = await VariantValue.findOne({
        where: {
          variantId,
          value: value.trim(),
        },
        paranoid: false, 
        transaction: t,
      });

      if (existingValue) {
        await t.rollback();
        let message = `Giá trị "${value.trim()}" đã tồn tại cho biến thể này.`;
        if (existingValue.deletedAt) {
          message += ` Nó đang ở trong thùng rác, bạn có thể khôi phục.`;
        }
        return res.status(409).json({ field: "value", message });
      }

        if (req.file) {

      imageUrl = req.file.path;
    }

      const slug = slugify(value.trim(), {
        lower: true,
        strict: true,
        trim: true,
      });
      const finalSortOrder = Number.isFinite(Number(sortOrder))
        ? Number(sortOrder)
        : 0;
      const finalIsActive =
        isActive === "true" ||
        isActive === true ||
        isActive === 1 ||
        isActive === "1";

 
      await VariantValue.increment("sortOrder", {
        by: 1,
        where: {
          variantId,
          sortOrder: {
            [Op.gte]: finalSortOrder,
          },
        },
        transaction: t,
      });

      const newValue = await VariantValue.create(
        {
          variantId,
          value: value.trim(),
          slug,
          sortOrder: finalSortOrder,
          isActive: finalIsActive,
          colorCode: colorCode || null,
          imageUrl,
        },
        { transaction: t }
      );

      await t.commit();
      res
        .status(201)
        .json({ message: "Tạo giá trị thành công", data: newValue });
    } catch (err) {
      await t.rollback();
      console.error("Lỗi tạo giá trị:", err);
      if (err.name === "SequelizeUniqueConstraintError") {
        return res
          .status(409)
          .json({ message: "Lỗi trùng lặp dữ liệu.", details: err.errors });
      }
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async update(req, res) {
    const t = await VariantValue.sequelize.transaction();
    try {
      const { id } = req.params; 
      const { value, sortOrder, isActive, colorCode } = req.body;

      const current = await VariantValue.findByPk(id, { transaction: t });
      if (!current) {
        await t.rollback();
        return res
          .status(404)
          .json({ message: "Không tìm thấy giá trị để cập nhật" });
      }

      const variantId = current.variantId; // Get variantId from the current item

      if (value !== undefined && (value === null || value.trim() === "")) {
        await t.rollback();
        return res
          .status(400)
          .json({ field: "value", message: "Giá trị không được để trống." });
      }

      // Check for duplicate value if value is being changed
      if (value !== undefined && value.trim() !== current.value) {
        const existingValue = await VariantValue.findOne({
          where: {
            variantId,
            value: value.trim(),
            id: { [Op.ne]: id }, // Exclude current item
          },
          paranoid: false,
          transaction: t,
        });
        if (existingValue) {
          await t.rollback();
          let message = `Giá trị "${value.trim()}" đã tồn tại cho biến thể này.`;
          if (existingValue.deletedAt) {
            message += ` Nó đang ở trong thùng rác.`;
          }
          return res.status(409).json({ field: "value", message });
        }
      }

      const updateData = {};

      if (value !== undefined) {
        updateData.value = value.trim();
        updateData.slug = slugify(value.trim(), {
          lower: true,
          strict: true,
          trim: true,
        });
      }

      if (isActive !== undefined) {
        updateData.isActive =
          isActive === "true" ||
          isActive === true ||
          isActive === "1" ||
          isActive === 1;
      }

      if (colorCode !== undefined) {
        updateData.colorCode = colorCode || null;
      }

      if (req.file) {
       updateData.imageUrl = req.file.path;
        // Consider deleting the old image if replaced
      }

      // Handle sortOrder change
      const newSortOrder =
        sortOrder !== undefined && Number.isFinite(Number(sortOrder))
          ? Number(sortOrder)
          : undefined;

      if (newSortOrder !== undefined && newSortOrder !== current.sortOrder) {
        const oldSortOrder = current.sortOrder;

        if (newSortOrder < oldSortOrder) {
          // Moving item up (to a smaller sortOrder index)
          // Increment sortOrder of items from newSortOrder to oldSortOrder-1
          await VariantValue.increment("sortOrder", {
            by: 1,
            where: {
              variantId,
              sortOrder: {
                [Op.gte]: newSortOrder,
                [Op.lt]: oldSortOrder,
              },
              id: { [Op.ne]: id },
            },
            transaction: t,
          });
        } else {
          // newSortOrder > oldSortOrder
          // Moving item down (to a larger sortOrder index)
          // Decrement sortOrder of items from oldSortOrder+1 to newSortOrder
          await VariantValue.increment("sortOrder", {
            by: -1,
            where: {
              variantId,
              sortOrder: {
                [Op.gt]: oldSortOrder,
                [Op.lte]: newSortOrder,
              },
              id: { [Op.ne]: id },
            },
            transaction: t,
          });
        }
        updateData.sortOrder = newSortOrder;
      } else if (newSortOrder !== undefined) {
        // sortOrder provided but same as current
        updateData.sortOrder = newSortOrder;
      }

      if (Object.keys(updateData).length === 0 && !req.file) {
        await t.rollback();
        return res
          .status(400)
          .json({
            message: "Không có thông tin nào được cung cấp để cập nhật.",
          });
      }

      const [updatedRowsCount] = await VariantValue.update(updateData, {
        where: { id },
        transaction: t,
      });

      if (updatedRowsCount === 0 && Object.keys(updateData).length > 0) {
        // This might happen if data is identical to existing, or if item was deleted concurrently
        // For now, we assume it's okay if some data was provided.
        // If you want to be stricter, you can check if updateData was actually different from current.
      }

      await t.commit();
      res.json({ message: "Cập nhật thành công" });
    } catch (err) {
      await t.rollback();
      console.error("Lỗi cập nhật giá trị biến thể:", err);
      if (err.name === "SequelizeUniqueConstraintError") {
        return res
          .status(409)
          .json({ message: "Lỗi trùng lặp dữ liệu.", details: err.errors });
      }
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async softDelete(req, res) {
    try {
      await VariantValue.destroy({ where: { id: req.params.id } });
      res.json({ message: "Đã chuyển vào thùng rác" });
    } catch (err) {
      console.error("Lỗi soft delete:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async forceDelete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;

      const isInUse = await SkuVariantValue.findOne({
        where: { variantValueId: id },
        transaction: t,
      });

      if (isInUse) {
        await t.rollback();
        const vv = await VariantValue.findByPk(id, {
          attributes: ["value"],
          raw: true,
          paranoid: false,
        });
        return res.status(409).json({
          message: `Giá trị "${
            vv?.value || "ID: " + id
          }" đang được sử dụng trong sản phẩm và không thể xóa vĩnh viễn.`,
        });
      }

      const result = await VariantValue.destroy({
        where: { id: id },
        force: true,
        transaction: t,
      });

      if (result === 0) {
        await t.rollback();
        return res
          .status(404)
          .json({ message: "Không tìm thấy giá trị để xoá vĩnh viễn." });
      }

      await t.commit();
      res.json({ message: "Đã xoá vĩnh viễn giá trị." });
    } catch (err) {
      await t.rollback();
      console.error("Lỗi force delete VariantValue:", err);
      res
        .status(500)
        .json({ message: "Lỗi server khi xóa giá trị", error: err.message });
    }
  }

  static async forceDeleteMany(req, res) {
    const t = await sequelize.transaction();
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        await t.rollback();
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const conflictingValueDetails = [];
      const idsActuallySafeToDelete = [];

      for (const valueId of ids) {
        const isInUse = await SkuVariantValue.findOne({
          where: { variantValueId: valueId },
          transaction: t,
        });
        if (isInUse) {
          const vv = await VariantValue.findByPk(valueId, {
            attributes: ["value"],
            raw: true,
            paranoid: false,
            transaction: t,
          });
          conflictingValueDetails.push(`"${vv?.value || "ID: " + valueId}"`);
        } else {
          idsActuallySafeToDelete.push(valueId);
        }
      }

      if (
        conflictingValueDetails.length > 0 &&
        idsActuallySafeToDelete.length === 0
      ) {
        await t.rollback();
        return res.status(409).json({
          message: `Không thể xoá. Các giá trị sau đang được sử dụng trong sản phẩm: ${conflictingValueDetails.join(
            ", "
          )}.`,
        });
      }

      let deletedCount = 0;
      if (idsActuallySafeToDelete.length > 0) {
        deletedCount = await VariantValue.destroy({
          where: { id: idsActuallySafeToDelete },
          force: true,
          transaction: t,
        });
      }

      await t.commit();

      if (conflictingValueDetails.length > 0) {
        return res.status(207).json({
          message: `Đã xoá vĩnh viễn ${deletedCount} giá trị. Tuy nhiên, các giá trị: ${conflictingValueDetails.join(
            ", "
          )} không thể xóa do đang được sử dụng.`,
          deletedCount,
          conflictingMessages: conflictingValueDetails,
        });
      }

      if (deletedCount === 0 && ids.length > 0) {
        return res
          .status(404)
          .json({
            message:
              "Không có giá trị nào phù hợp để xoá hoặc đã bị xoá trước đó.",
          });
      }

      res.json({ message: `Đã xoá vĩnh viễn ${deletedCount} giá trị.` });
    } catch (err) {
      await t.rollback();
      console.error("Lỗi forceDeleteMany VariantValues:", err);
      res
        .status(500)
        .json({
          message: "Lỗi server khi xóa nhiều giá trị",
          error: err.message,
        });
    }
  }

  static async restore(req, res) {
    try {
      await VariantValue.restore({ where: { id: req.params.id } });
      res.json({ message: "Khôi phục thành công" });
    } catch (err) {
      console.error("Lỗi khôi phục:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async deleteMany(req, res) {
    try {
      const { ids } = req.body;
      await VariantValue.destroy({ where: { id: ids } });
      res.json({ message: "Đã chuyển nhiều vào thùng rác" });
    } catch (err) {
      console.error("Lỗi deleteMany:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async restoreMany(req, res) {
    try {
      const { ids } = req.body;
      await VariantValue.restore({ where: { id: ids } });
      res.json({ message: "Đã khôi phục nhiều giá trị" });
    } catch (err) {
      console.error("Lỗi restoreMany:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async reorder(req, res) {
    try {
      const updates = req.body;

      const promises = updates.map((item) =>
        VariantValue.update(
          { sortOrder: item.sortOrder },
          { where: { id: item.id } }
        )
      );

      await Promise.all(promises);
      res.json({ message: "Cập nhật thứ tự thành công" });
    } catch (err) {
      console.error("Lỗi cập nhật sortOrder:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async createQuick(req, res) {
    try {
      const variantId = req.body.variantId || req.params.id;
      const { value } = req.body;

      if (!variantId || !value || !value.trim()) {
        return res.status(400).json({ message: "Thiếu variantId hoặc value" });
      }

      const slug = slugify(value, { lower: true, strict: true });

      const maxSort = await VariantValue.max("sortOrder", {
        where: { variantId },
      });

      const newValue = await VariantValue.create({
        variantId,
        value,
        slug,
        sortOrder: isNaN(maxSort) ? 0 : maxSort + 1,
        isActive: true,
      });

      res
        .status(201)
        .json({ message: "Tạo giá trị thành công", data: newValue });
    } catch (err) {
      console.error("Lỗi tạo giá trị nhanh:", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }
}

module.exports = VariantValueController;
