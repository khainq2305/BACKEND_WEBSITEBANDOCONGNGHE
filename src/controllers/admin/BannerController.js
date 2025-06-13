// src/controllers/admin/bannerController.js
const { Banner, Category, Product } = require("../../models");
const { Op } = require("sequelize");
const slugify = require("slugify");
const bannerImageSizeMap = require("../../config/bannerImageSizeMap");

class BannerController {
  static async create(req, res) {
    try {
      const {
        title,
        linkUrl,
        altText,
        type,
        displayOrder,
        startDate,
        endDate,
        categoryId, 
        productId, 
        isActive,
      } = req.body;

      if (!req.file || !req.file.path) {
        return res.status(400).json({ message: "Vui lòng chọn ảnh banner" });
      }

      const imageUrl = req.file.path.startsWith("http")
        ? req.file.path
        : `/uploads/${req.file.filename}`;

      const slug = slugify(title || "", { lower: true, strict: true });

      if (!type) {
        return res.status(400).json({ message: "Thiếu type của banner" });
      }

      const trimmedType = type.trim();

      let finalOrder = parseInt(displayOrder, 10);

   
      if (!finalOrder || isNaN(finalOrder) || finalOrder < 1) {
        const maxOrder = await Banner.max("displayOrder", {
          where: { type: trimmedType },
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
          }
        );
      }

      const banner = await Banner.create({
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
        categoryId: categoryId || null, 
        productId: productId || null, 
      });

      return res.status(201).json({
        message: "Tạo banner thành công",
        data: banner,
      });
    } catch (error) {
      console.error("CREATE BANNER ERROR:", error);
      return res.status(500).json({
        message: "Lỗi server khi tạo banner",
        error: error.message,
      });
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
          order: [
            ["type", "ASC"],
            ["displayOrder", "ASC"],
          ],
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

      const banner = await Banner.findOne({ where: { slug } });

      if (!banner) {
        return res.status(404).json({ message: "Không tìm thấy banner" });
      }

      return res.json({ data: banner });
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Lỗi lấy banner theo slug", error: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { slug } = req.params;

      const banner = await Banner.findOne({ where: { slug } });
      if (!banner) {
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
        categoryId,
        productId,
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
      if (categoryId !== undefined) banner.categoryId = categoryId || null;
      if (productId !== undefined) banner.productId = productId || null;

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
          }
        );

        banner.displayOrder = finalOrder;
      }

      await banner.save();

      return res.json({ message: "Cập nhật banner thành công", data: banner });
    } catch (error) {
      console.error("UPDATE BANNER BY SLUG ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi cập nhật banner", error: error.message });
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

      // force: true -> xoá hẳn (bỏ qua paranoid)
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
      return res
        .status(500)
        .json({
          message: "Lỗi server khi cập nhật thứ tự",
          error: error.message,
        });
    }
  }
  static async getCategoriesForSelect(req, res) {
    try {
      const all = await Category.findAll({
        attributes: ["id", "name", "parentId", "slug"],
        where: { isActive: true },
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
        where: { isActive: true },
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
