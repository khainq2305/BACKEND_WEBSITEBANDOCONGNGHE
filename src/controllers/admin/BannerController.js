// src/controllers/admin/bannerController.js
const {
  Banner,
  BannerCate,
  BannerItem,
  Category,
  Product,
} = require("../../models");
const { Op } = require("sequelize");
const slugify = require("slugify");
const bannerImageSizeMap = require("../../config/bannerImageSizeMap");

class BannerController {
  static async create(req, res) {
    const t = await Banner.sequelize.transaction();
    try {
      const {
        title,
        linkUrl,
        altText,
        type,
        displayOrder,
        startDate,
        endDate,
        isActive,
        categoryIds,
        productIds,
      } = req.body;

      if (!req.file || !req.file.path) {
        await t.rollback();
        return res.status(400).json({ message: "Vui lòng chọn ảnh banner" });
      }

      const imageUrl = req.file.path.startsWith("http")
        ? req.file.path
        : `/uploads/${req.file.filename}`;

      const slug = slugify(title || "", { lower: true, strict: true });

      if (!type) {
        await t.rollback();
        return res.status(400).json({ message: "Thiếu type của banner" });
      }

      const trimmedType = type.trim();

      let finalOrder = parseInt(displayOrder, 10);
      if (isNaN(finalOrder) || finalOrder < 1) {
        const maxOrder = await Banner.max("displayOrder", {
          where: { type: trimmedType },
          transaction: t,
        });
        finalOrder = (maxOrder || 0) + 1;
      } else {
        await Banner.increment(
          { displayOrder: 1 },
          {
            where: {
              type: trimmedType,
              displayOrder: {
                [Op.gte]: finalOrder,
              },
            },
            transaction: t,
          }
        );
      }

      const banner = await Banner.create(
        {
          title: title?.trim() || null,
          slug,
          linkUrl: linkUrl?.trim() || null,
          altText: altText?.trim() || null,
          type: trimmedType,
          displayOrder: finalOrder,
          startDate: startDate || null,
          endDate: endDate || null,
          isActive: isActive === "true" || isActive === true,
          imageUrl,
        },
        { transaction: t }
      );

      const parsedCategoryIds = JSON.parse(categoryIds || "[]");
      const parsedProductIds = JSON.parse(productIds || "[]");

      if (parsedCategoryIds.length > 0) {
        const categoryAssociations = parsedCategoryIds.map((id) => ({
          bannerId: banner.id,
          categoryId: id,
        }));
        await BannerCate.bulkCreate(categoryAssociations, { transaction: t });
      }

      if (parsedProductIds.length > 0) {
        const productAssociations = parsedProductIds.map((id) => ({
          bannerId: banner.id,
          productId: id,
        }));
        await BannerItem.bulkCreate(productAssociations, { transaction: t });
      }

      await t.commit();
      return res.status(201).json({
        message: "Tạo banner thành công",
        data: banner,
      });
    } catch (error) {
      await t.rollback();
      console.error("CREATE BANNER ERROR:", error);
      return res.status(500).json({
        message: "Lỗi server khi tạo banner",
        error: error.message,
      });
    }
  }

  static async update(req, res) {
    const t = await Banner.sequelize.transaction();
    try {
      const { slug } = req.params;

      const banner = await Banner.findOne({
        where: { slug },
        transaction: t,
        include: [
          { model: Category, as: "categories" },
          {
            model: BannerItem,
            as: "items",
            include: [{ model: Product, as: "product" }],
          },
        ],
      });

      if (!banner) {
        await t.rollback();
        return res.status(404).json({ message: "Không tìm thấy banner" });
      }

      const oldType = banner.type;
      const oldOrder = banner.displayOrder;

      if (req.file && req.file.path) {
        banner.imageUrl = req.file.path.startsWith("http")
          ? req.file.path
          : `/uploads/${req.file.filename}`;
      }

      const {
        title,
        linkUrl,
        altText,
        type,
        displayOrder,
        startDate,
        endDate,
        isActive,
        categoryIds,
        productIds,
      } = req.body;

      if (title !== undefined) {
        banner.title = title?.trim() || null;
        banner.slug = slugify(title || "", { lower: true, strict: true });
      }
      if (linkUrl !== undefined) banner.linkUrl = linkUrl?.trim() || null;
      if (altText !== undefined) banner.altText = altText?.trim() || null;
      if (type !== undefined) banner.type = type?.trim() || null;
      if (startDate !== undefined) banner.startDate = startDate || null;
      if (endDate !== undefined) banner.endDate = endDate || null;
      if (isActive !== undefined)
        banner.isActive = isActive === "true" || isActive === true;

      const newType = banner.type;
      const newOrder = parseInt(displayOrder, 10);

      if (
        (type !== undefined && newType !== oldType) ||
        (displayOrder !== undefined && newOrder !== oldOrder)
      ) {
        await Banner.decrement(
          { displayOrder: 1 },
          {
            where: {
              id: { [Op.ne]: banner.id },
              type: oldType,
              displayOrder: { [Op.gt]: oldOrder },
            },
            transaction: t,
          }
        );

        const finalOrder = isNaN(newOrder) || newOrder < 1 ? 1 : newOrder;

        await Banner.increment(
          { displayOrder: 1 },
          {
            where: {
              id: { [Op.ne]: banner.id },
              type: newType,
              displayOrder: { [Op.gte]: finalOrder },
            },
            transaction: t,
          }
        );

        banner.displayOrder = finalOrder;
      }

      const parsedCategoryIds = JSON.parse(categoryIds || "[]");
      await BannerCate.destroy({
        where: { bannerId: banner.id },
        transaction: t,
      });
      if (parsedCategoryIds.length > 0) {
        const categoryAssociations = parsedCategoryIds.map((id) => ({
          bannerId: banner.id,
          categoryId: id,
        }));
        await BannerCate.bulkCreate(categoryAssociations, { transaction: t });
      }

      const parsedProductIds = JSON.parse(productIds || "[]");
      await BannerItem.destroy({
        where: { bannerId: banner.id },
        transaction: t,
      });
      if (parsedProductIds.length > 0) {
        const productAssociations = parsedProductIds.map((id) => ({
          bannerId: banner.id,
          productId: id,
        }));
        await BannerItem.bulkCreate(productAssociations, { transaction: t });
      }

      await banner.save({ transaction: t });
      await t.commit();

      return res.json({ message: "Cập nhật banner thành công", data: banner });
    } catch (error) {
      await t.rollback();
      console.error("UPDATE BANNER BY SLUG ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi cập nhật banner", error: error.message });
    }
  }

  static async getAll(req, res) {
    try {
      const { type, isActive, search, page = 1, limit = 10 } = req.query;
      const whereClause = {};

      if (type) whereClause.type = type.trim();
      if (isActive !== undefined)
        whereClause.isActive = isActive === "1" || isActive === "true";
      if (search && search.trim() !== "") {
        const keyword = `%${search.trim()}%`;
        whereClause[Op.or] = [
          { title: { [Op.like]: keyword } },
          { altText: { [Op.like]: keyword } },
        ];
      }

      const offset = (Number(page) - 1) * Number(limit);
      const { rows: banners, count: totalItems } = await Banner.findAndCountAll(
        {
          where: whereClause,
          offset,
          limit: Number(limit),
          order: [["createdAt", "DESC"]],
        }
      );

      const bannersWithSize = banners.map((b) => ({
        ...b.toJSON(),
        imageSize: bannerImageSizeMap[b.type] || { width: 80, height: 80 },
      }));

      return res.json({
        data: bannersWithSize,
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
          currentPage: Number(page),
          limit: Number(limit),
        },
      });
    } catch (error) {
      console.error("GET BANNERS ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi lấy danh sách banner", error: error.message });
    }
  }

  static async getById(req, res) {
    try {
      const { slug } = req.params;

      const banner = await Banner.findOne({
        where: { slug },
        include: [
          {
            model: Category,
            as: "categories",
            attributes: ["id", "name"],
            through: { attributes: [] },
          },
          {
            model: BannerItem,
            as: "items",
            attributes: ["id"],
            include: [
              {
                model: Product,
                as: "product",
                attributes: ["id", "name", "thumbnail"],
              },
            ],
          },
        ],
      });

      if (!banner) {
        return res.status(404).json({ message: "Không tìm thấy banner" });
      }

      const data = banner.toJSON();

      data.categoryIds = data.categories.map((c) => c.id);

      return res.json({ data });
    } catch (error) {
      console.error("Lỗi lấy banner theo slug:", error);
      return res.status(500).json({
        message: "Lỗi lấy banner theo slug",
        error: error.message,
      });
    }
  }

  static async delete(req, res) {
    try {
      const banner = await Banner.findByPk(req.params.id);
      if (!banner) {
        return res.status(404).json({ message: "Không tìm thấy banner" });
      }
      await banner.destroy();
      return res.json({ message: "Xóa banner thành công" });
    } catch (error) {
      console.error("DELETE BANNER ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi xóa banner", error: error.message });
    }
  }

  static async forceDeleteMany(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách id không hợp lệ" });
      }

      
      const rowsDeleted = await Banner.destroy({
        where: { id: { [Op.in]: ids } },
        force: true,
      });

      return res.json({
        message: `Đã xoá vĩnh viễn ${rowsDeleted} banner`,
        rowsDeleted,
      });
    } catch (error) {
      console.error("FORCE DELETE MANY BANNERS ERROR:", error);
      return res.status(500).json({
        message: "Lỗi xoá nhiều banner",
        error: error.message,
      });
    }
  }
  static async updateOrder(req, res) {
    try {
      const { id } = req.params;
      const { displayOrder } = req.body;

      if (!displayOrder || isNaN(Number(displayOrder))) {
        return res
          .status(400)
          .json({ message: "Thứ tự hiển thị không hợp lệ" });
      }

      const banner = await Banner.findByPk(id);
      if (!banner) {
        return res.status(404).json({ message: "Không tìm thấy banner" });
      }

      banner.displayOrder = Number(displayOrder);
      await banner.save();

      return res.json({
        message: "Cập nhật thứ tự hiển thị thành công",
        data: banner,
      });
    } catch (error) {
      console.error("UPDATE DISPLAY ORDER ERROR:", error);
      return res.status(500).json({
        message: "Lỗi server khi cập nhật thứ tự",
        error: error.message,
      });
    }
  }
 static async getCategoriesForSelect(req, res) {
  try {
    const all = await Category.findAll({
      attributes: ["id", "name", "parentId", "slug"],
      where: { 
        isActive: true,
        deletedAt: null 
      },
      order: [["sortOrder", "ASC"]],
    });

    const parents = all.filter((c) => !c.parentId);
    const children = all.filter((c) => c.parentId);

    const nested = parents.map((parent) => {
      return {
        id: parent.id,
        name: parent.name,
        slug: parent.slug,
        children: children
          .filter((child) => child.parentId === parent.id)
          .map((child) => ({
            id: child.id,
            name: child.name,
            slug: child.slug,
          })),
      };
    });

    return res.json({ data: nested });
  } catch (error) {
    console.error("GET NESTED CATEGORIES ERROR:", error);
    return res.status(500).json({
      message: "Lỗi khi lấy danh sách danh mục cha - con",
      error: error.message,
    });
  }
}

  static async getProductsForSelect(req, res) {
  try {
    const products = await Product.findAll({
      attributes: ["id", "name"],
      where: { 
        isActive: true,
        deletedAt: null, 
      },
      order: [["name", "ASC"]],
    });
    return res.json({ data: products });
  } catch (error) {
    console.error("GET PRODUCTS FOR SELECT ERROR:", error);
    return res.status(500).json({
      message: "Lỗi khi lấy danh sách product",
      error: error.message,
    });
  }
}

}

module.exports = BannerController;
