
const { Op } = require("sequelize");
const slugify = require("slugify");

const { Category,HighlightedCategoryItem, sequelize } = require("../../models");
class CategoryProductController {
    static async getAll(req, res) {
    try {
      const page = +req.query.page || 1;
      const limit = +req.query.limit || 10;
      const offset = (page - 1) * limit;

      const search = (req.query.search || "").trim();
      const isActiveQuery = req.query.isActive; 
      const isDeleted = req.query.isDeleted === "true";

      const baseWhere = {
        ...(search && { name: { [Op.like]: `%${search}%` } }),
      };

      const [allCount, activeCount, inactiveCount, trashedCount] = await Promise.all([
        Category.count({ where: { ...baseWhere, deletedAt: null }, paranoid: false }),
        Category.count({
          where: { ...baseWhere, deletedAt: null, isActive: true },
          paranoid: false,
        }),
        Category.count({
          where: { ...baseWhere, deletedAt: null, isActive: false },
          paranoid: false,
        }),
        Category.count({
          where: { ...baseWhere, deletedAt: { [Op.not]: null } },
          paranoid: false,
        }),
      ]);

      let pagedData;
      let totalItemsInView;

      if (isDeleted) {
        
        const whereTrashed = { ...baseWhere, deletedAt: { [Op.not]: null } };
        const { count, rows } = await Category.findAndCountAll({
          where: whereTrashed,
          order: [["name", "ASC"]],
          limit,
          offset,
          paranoid: false, 
         
        });
     
        pagedData = rows.map(item => ({
          ...item.get({ plain: true }), 
          label: item.name, 
          isActive: !!item.isActive, 
        }));
        totalItemsInView = count;
      } else {
       
        const whereActive = { ...baseWhere, deletedAt: null };
        if (isActiveQuery !== undefined) {
          whereActive.isActive = isActiveQuery === "true";
        }

        const allMatchingRows = await Category.findAll({
          where: whereActive,
          order: [["sortOrder", "ASC"]],
          paranoid: false, 
          raw: true,
        });

        const bucket = {};
        allMatchingRows.forEach((c) => {
          const p = c.parentId || 0;
          (bucket[p] = bucket[p] || []).push({ ...c, isActive: !!c.isActive });
        });

        const build = (pid = 0, lvl = 0) =>
          (bucket[pid] || []).flatMap((node) => [
            { ...node, label: `${"— ".repeat(lvl)}${node.name}` },
            ...build(node.id, lvl + 1),
          ]);

        const flattened = build();
        totalItemsInView = flattened.length;
        pagedData = flattened.slice(offset, offset + limit);
      }

      return res.json({
        data: pagedData,
        total: totalItemsInView, 
        currentPage: page,
        totalPages: Math.ceil(totalItemsInView / limit),
        counts: {
          all: allCount,
          active: activeCount,
          inactive: inactiveCount,
          trashed: trashedCount,
        },
      });
    } catch (err) {
      console.error("[getAll Categories] error:", err);
      return res.status(500).json({
        message: "Không thể lấy danh mục",
        error: err.message,
      });
    }
  }

  static async getById(req, res) {
    try {
      const category = await Category.findOne({
        where: { slug: req.params.id },
      });
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
      const { name, description, parentId, isActive, orderIndex, isDefault } =
        req.body;
      const thumbnail = req.file?.path;

      if (!thumbnail) {
        return res
          .status(400)
          .json({ field: "thumbnail", message: "Vui lòng chọn ảnh đại diện!" });
      }

      const rawName = (name || "").trim();
      if (!rawName) {
        return res.status(400).json({
          field: "name",
          message: "Tên danh mục không được để trống!",
        });
      }

      const slug = slugify(rawName, { lower: true, strict: true });

      let sortOrderToUse = Number(orderIndex);
      if (!sortOrderToUse && sortOrderToUse !== 0) {
        const maxCategory = await Category.findOne({
          order: [["sortOrder", "DESC"]],
          paranoid: false,
        });
        sortOrderToUse = maxCategory ? maxCategory.sortOrder + 1 : 1;
      } else {
        await Category.increment("sortOrder", {
          by: 1,
          where: {
            sortOrder: {
              [Op.gte]: sortOrderToUse,
            },
          },
        });
      }

      const newCategory = await Category.create({
        name: rawName,
        slug,
        description,
        parentId: parentId || null,
        isActive: isActive !== "false",
        sortOrder: sortOrderToUse,
        isDefault: isDefault === "true" || false,
        thumbnail,
      });

      return res.status(201).json(newCategory);
    } catch (err) {
      console.error("Lỗi tạo danh mục:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server!", error: err.message });
    }
  }
  static async softDelete(req, res) {
    try {
      let ids = [];

      
      if (req.params.id) {
        ids = [parseInt(req.params.id)];
      }

      
      if (Array.isArray(req.body.ids)) {
        ids = req.body.ids.map((id) => parseInt(id));
      }

      if (ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      
      const allCategories = await Category.findAll({
        paranoid: false,
        raw: true,
      });

      
      const map = {};
      for (const cat of allCategories) {
        const parent = cat.parentId || 0;
        if (!map[parent]) map[parent] = [];
        map[parent].push(cat);
      }

     
      const collectAllIds = (rootIds) => {
        const result = new Set(rootIds);
        const stack = [...rootIds];

        while (stack.length > 0) {
          const current = stack.pop();
          const children = map[current] || [];
          for (const child of children) {
            if (!result.has(child.id)) {
              result.add(child.id);
              stack.push(child.id);
            }
          }
        }

        return Array.from(result);
      };

      const finalIds = collectAllIds(ids);

      const deletedCount = await Category.destroy({
        where: { id: finalIds },
      });

      res.json({
        message: `Đã xóa mềm ${deletedCount} danh mục (gồm cả danh mục con nếu có)`,
        deletedCount,
      });
    } catch (error) {
      console.error("Lỗi khi xóa mềm:", error);
      res.status(500).json({ message: "Lỗi server khi xóa mềm", error });
    }
  }

  static async update(req, res) {
    let t;
    try {
      const categoryToUpdate = await Category.findOne({
        where: { slug: req.params.id },
      });

      if (!categoryToUpdate) {
        return res.status(404).json({ message: "Không tìm thấy danh mục." });
      }

      const { name, description, parentId, isActive, orderIndex, isDefault } = req.body;
      const originalIsActiveState = categoryToUpdate.isActive;

      const payloadToUpdate = {};

      if (name !== undefined) {
        const trimmedName = (name || "").trim();
        if (!trimmedName) {
          return res.status(400).json({
            field: "name",
            message: "Tên danh mục không được để trống!",
          });
        }
        payloadToUpdate.name = trimmedName;
        payloadToUpdate.slug = slugify(trimmedName, { lower: true, strict: true });

        if (payloadToUpdate.slug !== categoryToUpdate.slug || payloadToUpdate.name !== categoryToUpdate.name) {
            const existingConflict = await Category.findOne({
                where: {
                    [Op.and]: [
                        { id: { [Op.ne]: categoryToUpdate.id } },
                        { [Op.or]: [{ slug: payloadToUpdate.slug }, { name: payloadToUpdate.name }] }
                    ]
                },
                paranoid: false
            });
            if (existingConflict) {
                if (existingConflict.slug === payloadToUpdate.slug) {
                    return res.status(409).json({ field: 'name', message: `Slug "${payloadToUpdate.slug}" đã được sử dụng bởi danh mục khác.` });
                }
                if (existingConflict.name === payloadToUpdate.name) {
                    return res.status(409).json({ field: 'name', message: `Tên danh mục "${payloadToUpdate.name}" đã được sử dụng bởi danh mục khác.` });
                }
            }
        }
      }

      if (description !== undefined) payloadToUpdate.description = description;
      if (parentId !== undefined) payloadToUpdate.parentId = parentId || null;
      if (isActive !== undefined) payloadToUpdate.isActive = isActive !== "false";
      if (isDefault !== undefined) payloadToUpdate.isDefault = isDefault === "true" || false;
      
      if (req.file && req.file.path) {
        payloadToUpdate.thumbnail = req.file.path;
      }

      const newSortOrderRequested = (orderIndex !== undefined && orderIndex !== null && orderIndex !== '') 
                                      ? Number(orderIndex) 
                                      : null;

      t = await sequelize.transaction();

      if (newSortOrderRequested !== null && newSortOrderRequested !== categoryToUpdate.sortOrder) {
        const currentSortOrder = categoryToUpdate.sortOrder;
        
        if (newSortOrderRequested < currentSortOrder) {
            await Category.increment('sortOrder', {
                by: 1,
                where: {
                    id: { [Op.ne]: categoryToUpdate.id },
                    sortOrder: { [Op.gte]: newSortOrderRequested, [Op.lt]: currentSortOrder },
                },
                transaction: t,
            });
        } else {
            await Category.decrement('sortOrder', {
                by: 1,
                where: {
                    id: { [Op.ne]: categoryToUpdate.id },
                    sortOrder: { [Op.gt]: currentSortOrder, [Op.lte]: newSortOrderRequested },
                },
                transaction: t,
            });
        }
        payloadToUpdate.sortOrder = newSortOrderRequested;
      }
      
      if (Object.keys(payloadToUpdate).length > 0) {
        await categoryToUpdate.update(payloadToUpdate, { transaction: t });
      }

      await t.commit();

      const finalIsActiveState = categoryToUpdate.isActive;

      if (originalIsActiveState && !finalIsActiveState) {
        const allCategoriesRaw = await Category.findAll({ paranoid: false, raw: true });
        const map = {};
        allCategoriesRaw.forEach((cat) => {
          const pid = cat.parentId || 0;
          (map[pid] = map[pid] || []).push(cat);
        });

        const collectDescendantIds = (pId) => {
          const children = map[pId] || [];
          return children.flatMap((child) => [child.id, ...collectDescendantIds(child.id)]);
        };
        const descendantIds = collectDescendantIds(categoryToUpdate.id);

        if (descendantIds.length > 0) {
          await Category.update(
            { isActive: false },
            { where: { id: descendantIds } }
          );
        }
      }

      return res.status(200).json(categoryToUpdate);

    } catch (err) {
      if (t && !t.finished) {
          await t.rollback();
      }
      console.error("Lỗi cập nhật danh mục:", err);
      if (err.name === 'SequelizeUniqueConstraintError') {
        let fieldMessage = "Tên danh mục hoặc slug đã tồn tại.";
        if (err.fields) {
            if (err.fields.slug) fieldMessage = `Slug "${payloadToUpdate.slug || req.body.name}" đã tồn tại.`;
            if (err.fields.name) fieldMessage = `Tên danh mục "${req.body.name}" đã tồn tại.`;
        }
        return res.status(409).json({ 
           message: fieldMessage,
           field: err.fields && Object.keys(err.fields).length > 0 ? Object.keys(err.fields)[0] : 'name',
           error: err.message 
       });
      }
      return res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật danh mục!", error: err.message });
    }
  }

  static async forceDeleteMany(req, res) {
    const t = await Category.sequelize.transaction();
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        await t.rollback();
        return res.status(400).json({ message: "Danh sách ID không hợp lệ!" });
      }

      const categoriesToDelete = await Category.findAll({
        where: { id: ids },
        paranoid: false,
        transaction: t,
      });

      if (categoriesToDelete.length === 0) {
        await t.rollback();
        return res
          .status(404)
          .json({ message: "Không tìm thấy danh mục nào để xoá." });
      }

      const idSet = new Set(categoriesToDelete.map((cat) => cat.id));

      const allExistingCategories = await Category.findAll({
        paranoid: false,
        transaction: t,
      });
      const id2name = Object.fromEntries(
        allExistingCategories.map((c) => [c.id, c.name])
      );

      const conflictedChild = [];
      const prodConflict = [];
      const hlConflict = [];

      const parentChildMap = {};
      allExistingCategories.forEach((c) => {
        const p = c.parentId || 0;
        (parentChildMap[p] = parentChildMap[p] || []).push(c);
      });

      const collectAllDescendantIds = (parentId) => {
        const children = parentChildMap[parentId] || [];
        return children.reduce(
          (acc, child) =>
            acc.concat(child.id, collectAllDescendantIds(child.id)),
          []
        );
      };

      for (const cat of categoriesToDelete) {
        const childrenOfCat = parentChildMap[cat.id] || [];
        const childLeftBehind = childrenOfCat.filter(
          (child) => !idSet.has(child.id)
        );
        if (childLeftBehind.length > 0) {
          conflictedChild.push(cat.id);
        }

        const allDescendantsForProductCheck = [
          cat.id,
          ...collectAllDescendantIds(cat.id),
        ];
        const productCount = await require("../../models").Product.count({
          where: { categoryId: allDescendantsForProductCheck },

          transaction: t,
        });
        if (productCount > 0) {
          prodConflict.push(cat.id);
        }

        const highlightedItem = await HighlightedCategoryItem.findOne({
          where: { categoryId: cat.id },
          paranoid: false,
          transaction: t,
        });
        if (highlightedItem) {
          hlConflict.push(cat.id);
        }
      }

      if (conflictedChild.length || prodConflict.length || hlConflict.length) {
        await t.rollback();
        const details = {};
        if (conflictedChild.length)
          details.childConflict = conflictedChild.map((id) => ({
            id,
            name: id2name[id] || `ID ${id}`,
            reason: "Còn danh mục con không được chọn để xoá cùng",
          }));
        if (prodConflict.length)
          details.productConflict = prodConflict.map((id) => ({
            id,
            name: id2name[id] || `ID ${id}`,
            reason:
              "Đang chứa sản phẩm (hoặc danh mục con của nó chứa sản phẩm)",
          }));
        if (hlConflict.length)
          details.highlightedConflict = hlConflict.map((id) => ({
            id,
            name: id2name[id] || `ID ${id}`,
            reason: "Được gán nổi bật",
          }));
        return res.status(400).json({
          message: "Không thể xoá một số danh mục vì còn liên quan.",
          conflicts: details,
        });
      }

      const getDepth = (category, allCatsById, currentIdSet) => {
        let depth = 0;
        let currentParentId = category.parentId;
        while (currentParentId && currentIdSet.has(currentParentId)) {
          depth++;
          const parentCat = allCatsById[currentParentId];
          if (!parentCat) break;
          currentParentId = parentCat.parentId;
          if (depth > categoriesToDelete.length) break;
        }
        return depth;
      };

      const allCategoriesToDeleteById = Object.fromEntries(
        categoriesToDelete.map((cat) => [cat.id, cat])
      );

      const sortedCategories = [...categoriesToDelete].sort((a, b) => {
        const depthA = getDepth(a, allCategoriesToDeleteById, idSet);
        const depthB = getDepth(b, allCategoriesToDeleteById, idSet);
        if (depthA === depthB) {
          return 0;
        }
        return depthB - depthA;
      });

      const orderedIdsToDelete = sortedCategories.map((cat) => cat.id);

      let deletedCount = 0;
      for (const id of orderedIdsToDelete) {
        const count = await Category.destroy({
          where: { id: id },
          force: true,
          transaction: t,
        });
        deletedCount += count;
      }

      await t.commit();
      return res.json({
        message: `Đã xoá vĩnh viễn ${deletedCount} danh mục.`,
      });
    } catch (err) {
      await t.rollback();
      console.error("forceDeleteMany error:", err);

      if (err.name === "SequelizeForeignKeyConstraintError") {
        return res.status(400).json({
          message:
            "Lỗi ràng buộc khoá ngoại khi xoá danh mục. Có thể do thứ tự xoá hoặc dữ liệu không nhất quán.",
          details: {
            rawError: err.message,
            sql: err.sql,
          },
        });
      }
      return res
        .status(500)
        .json({ message: "Lỗi máy chủ khi xoá danh mục", error: err.message });
    }
  }

  static async forceDelete(req, res) {
    try {
      const { id } = req.params;
      const cat = await Category.findByPk(id, { paranoid: false });
      if (!cat)
        return res.status(404).json({ message: "Không tìm thấy danh mục." });

      const reasons = [];

      if (await Category.findOne({ where: { parentId: id }, paranoid: false }))
        reasons.push("có **danh mục con**");

      if (await cat.countProducts()) reasons.push("đang **chứa sản phẩm**");

      if (
        await HighlightedCategoryItem.findOne({
          where: { categoryId: id },
          paranoid: false,
        })
      )
        reasons.push("được **gán nổi bật**");

      // … bên trong static async forceDelete …
      if (reasons.length) {
        return res.status(400).json({
          message:
            `Không thể xoá “${cat.name}” vì ${reasons.join(", ")}.\n` +
            "Vui lòng xử lý xoá các mục liên quan rồi thử lại.",
        });
      }

      await Category.destroy({ where: { id }, force: true });
      return res.json({ message: "Xoá vĩnh viễn thành công." });
    } catch (err) {
      console.error("[forceDelete]", err);
      return res
        .status(500)
        .json({ message: "Lỗi khi xoá vĩnh viễn", error: err.message });
    }
  }

  static async softDeleteMany(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const allCategories = await Category.findAll({
        paranoid: false,
        raw: true,
      });

      const map = {};
      for (const cat of allCategories) {
        const parent = cat.parentId || 0;
        if (!map[parent]) map[parent] = [];
        map[parent].push(cat);
      }

      const collectAllIds = (parentIds) => {
        const result = new Set(parentIds);
        const stack = [...parentIds];

        while (stack.length > 0) {
          const current = stack.pop();
          const children = map[current] || [];
          for (const child of children) {
            if (!result.has(child.id)) {
              result.add(child.id);
              stack.push(child.id);
            }
          }
        }

        return Array.from(result);
      };

      const allToDeleteIds = collectAllIds(ids);

      const deleted = await Category.destroy({
        where: { id: allToDeleteIds },
      });

      console.log(`Đã soft delete ${deleted} danh mục (bao gồm con cháu)`);

      res.json({
        message: `Đã chuyển ${deleted} danh mục (và con cháu) vào thùng rác`,
      });
    } catch (error) {
      console.error("Lỗi xoá mềm:", error);
      res.status(500).json({ message: "Lỗi server khi xoá mềm", error });
    }
  }

  static async restore(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ message: "ID không hợp lệ" });

      const category = await Category.findByPk(id, { paranoid: false });
      if (!category)
        return res.status(404).json({ message: "Không tìm thấy danh mục." });

      const allCategories = await Category.findAll({
        paranoid: false,
        raw: true,
      });
      const idToCategory = Object.fromEntries(
        allCategories.map((c) => [c.id, c])
      );

      const parentIds = [];
      let current = category;
      while (current.parentId) {
        const parent = idToCategory[current.parentId];
        if (parent && parent.deletedAt !== null) {
          parentIds.push(parent.id);
          current = parent;
        } else break;
      }

      if (parentIds.length > 0) {
        await Promise.all(
          parentIds.map((pid) =>
            Category.restore({ where: { id: pid }, paranoid: false })
          )
        );
      }

      await category.restore();
      res.json({ message: "Khôi phục thành công (bao gồm cha nếu cần)" });
    } catch (err) {
      console.error("Lỗi khôi phục:", err);
      res.status(500).json({
        message: "Lỗi server khi khôi phục danh mục",
        error: err.message,
      });
    }
  }

  static async restoreMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const allCategories = await Category.findAll({
        paranoid: false,
        raw: true,
      });
      const idToCategory = Object.fromEntries(
        allCategories.map((cat) => [cat.id, cat])
      );

      const idsToRestore = new Set();

      for (const id of ids) {
        let current = idToCategory[id];
        if (!current) continue;
        idsToRestore.add(current.id);
        while (current.parentId) {
          const parent = idToCategory[current.parentId];
          if (parent && parent.deletedAt !== null) {
            idsToRestore.add(parent.id);
            current = parent;
          } else break;
        }
      }

      await Promise.all(
        [...idsToRestore].map((id) =>
          Category.restore({ where: { id }, paranoid: false })
        )
      );

      res.json({
        message: `Đã khôi phục ${ids.length} danh mục (và ${
          idsToRestore.size - ids.length
        } cha nếu cần)`,
      });
    } catch (error) {
      console.error("Lỗi khôi phục danh mục:", error);
      res
        .status(500)
        .json({ message: "Lỗi server khi khôi phục danh mục", error });
    }
  }

  static async updateOrderIndex(req, res) {
    const { ordered } = req.body;

    try {
      const { ordered } = req.body;

      if (!Array.isArray(ordered)) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      }

      const updatePromises = ordered.map(({ id, sortOrder }) =>
        Category.update({ sortOrder }, { where: { id } })
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

  static async restoreAll(req, res) {
    try {
      const restored = await Category.restore({
        where: {
          deletedAt: { [Op.not]: null },
        },
      });

      res.json({
        message: `Đã khôi phục tất cả danh mục (${restored})`,
      });
    } catch (error) {
      console.error("Lỗi khôi phục tất cả:", error);
      res.status(500).json({
        message: "Lỗi server khi khôi phục tất cả danh mục",
        error,
      });
    }
  }

  static async getAllNested(req, res) {
    try {
      const categories = await Category.findAll({
        where: { deletedAt: null },
        order: [["sortOrder", "ASC"]],
        raw: true,
      });

      const map = {};
      categories.forEach((cat) => {
        const parentId = cat.parentId || 0;
        if (!map[parentId]) map[parentId] = [];
        map[parentId].push(cat);
      });

      const buildTree = (parentId = 0, level = 0) => {
        return (map[parentId] || []).flatMap((cat) => {
          const children = buildTree(cat.id, level + 1);
          return [
            {
              ...cat,
              label: `${"│   ".repeat(level)}├── ${cat.name}`,

              value: cat.id,
            },
            ...children,
          ];
        });
      };

      const tree = buildTree();

      return res.status(200).json({ data: tree });
    } catch (error) {
      console.error("Lỗi getAllNested:", error);
      return res.status(500).json({
        message: "Không thể lấy danh mục dạng cây",
        error: error.message,
      });
    }
  }
}

module.exports = CategoryProductController;
