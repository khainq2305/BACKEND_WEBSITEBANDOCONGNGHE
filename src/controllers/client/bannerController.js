const { Op } = require("sequelize");
const { Banner, Product, Category } = require("../../models");

class bannerController {
  static async getByType(req, res) {
    try {
      const { type } = req.query;

      if (!type) {
        return res.status(400).json({ message: "Thiếu tham số type" });
      }

      const today = new Date();

      const banners = await Banner.findAll({
        where: {
          type: type.trim(),
          isActive: true,
          [Op.or]: [
            {
              startDate: null,
              endDate: null,
            },
            {
              startDate: { [Op.lte]: today },
              endDate: { [Op.gte]: today },
            },
            {
              startDate: { [Op.lte]: today },
              endDate: null,
            },
            {
              startDate: null,
              endDate: { [Op.gte]: today },
            },
          ],
        },
        order: [["displayOrder", "ASC"]],
      });

      return res.json({ data: banners });
    } catch (error) {
      console.error("LỖI LẤY BANNER CLIENT:", error);
      return res
        .status(500)
        .json({ message: "Lỗi lấy banner phía client", error: error.message });
    }
  }
  static async getCategoryBanner(req, res) {
    try {
      const { categoryId } = req.params;

      if (!categoryId) {
        return res.status(400).json({ message: "Thiếu categoryId" });
      }

      const today = new Date();

      const banners = await Banner.findAll({
        where: {
          type: "category-banner",
          isActive: true,
          [Op.or]: [
            { startDate: null, endDate: null },
            { startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } },
            { startDate: { [Op.lte]: today }, endDate: null },
            { startDate: null, endDate: { [Op.gte]: today } },
          ],
        },
        include: [
          {
            model: Category,
            as: "categories",
            attributes: ["id", "name"],
            through: { attributes: [] },
            where: { id: categoryId },
          },
        ],
        order: [["displayOrder", "ASC"]],
      });

      return res.json({ data: banners });
    } catch (error) {
      console.error("LỖI LẤY BANNER DANH MỤC:", error);
      return res.status(500).json({
        message: "Lỗi lấy banner danh mục",
        error: error.message,
      });
    }
  }

  static async getProductBanner(req, res) {
    try {
      const { productId } = req.params;
      if (!productId || isNaN(productId)) {
        return res.status(400).json({ message: "Thiếu productId" });
      }

      const today = new Date();

      const banners = await Banner.findAll({
        where: {
          type: "product-banner",
          isActive: true,
          [Op.or]: [
            { startDate: null, endDate: null },
            { startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } },
            { startDate: { [Op.lte]: today }, endDate: null },
            { startDate: null, endDate: { [Op.gte]: today } },
          ],
        },
        include: [
          {
            model: Product,
            as: "products",
            attributes: ["id", "name"],
            through: { attributes: [] },
            where: { id: Number(productId) },
            required: true,
          },
        ],
        order: [["displayOrder", "ASC"]],
      });

      return res.json({ data: banners });
    } catch (error) {
      console.error("LỖI LẤY BANNER SẢN PHẨM:", error);
      return res.status(500).json({
        message: "Lỗi lấy banner sản phẩm",
        error: error.message,
      });
    }
  }
}

module.exports = bannerController;
