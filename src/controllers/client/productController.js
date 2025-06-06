const { Op } = require("sequelize");

const {
  Product,
  Category,
  Brand,
  Sku,
  ProductMedia,
  SkuVariantValue,
  VariantValue,
  Variant,
} = require("../../models");

class ProductController {
  static async getProductDetailBySlug(req, res) {
    try {
      const { slug } = req.params;
      const { includeInactive } = req.query;


      const whereClause = { slug };
      if (!includeInactive || includeInactive !== "true") {
        whereClause.isActive = 1;
      }

      const product = await Product.findOne({
        where: whereClause,
        include: [
          { model: Category, as: "category" },
          { model: Brand, as: "brand" },
          {
            model: Sku,
            as: "skus",
            include: [
              {
                model: ProductMedia,
                as: "media",
                attributes: ["type", "mediaUrl", "sortOrder"],
              },
              {
                model: SkuVariantValue,
                as: "variantValues",
                include: [
                  {
                    model: VariantValue,
                    as: "variantValue",
                    include: [
                      {
                        model: Variant,
                        as: "variant",
                        attributes: ["id", "name", "type"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!product) {
        return res
          .status(404)
          .json({ message: "❌ Không tìm thấy sản phẩm theo slug này!" });
      }

      return res.status(200).json({ product });
    } catch (err) {
      console.error("🔥 Lỗi khi lấy chi tiết sản phẩm:", err);
      return res
        .status(500)
        .json({ message: "⚠️ Lỗi server khi lấy chi tiết sản phẩm" });
    }
  }
  static async getProductsByCategory(req, res) {
    try {
      const {
        slug,
        page = 1,
        limit = 20,
        stock,
        priceRange,
        sort = "popular",
      } = req.query;

      let brandNames = req.query.brand;

      if (typeof brandNames === "string" && brandNames !== "") {
        brandNames = brandNames.split(",");
      } else {
        brandNames = [];
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const whereClause = { isActive: 1, deletedAt: null };

      // 🔹 Lấy danh mục theo slug
      if (slug) {
        const parentCategory = await Category.findOne({
          where: { slug, isActive: 1, deletedAt: null },
        });
        if (!parentCategory) {
          return res.status(404).json({ message: "Không tìm thấy danh mục" });
        }

        const allCategories = await Category.findAll({
          where: { isActive: 1, deletedAt: null },
        });
        const subCategoryIds = allCategories
          .filter((cat) => cat.parentId === parentCategory.id)
          .map((cat) => cat.id);

        whereClause.categoryId = {
          [Op.in]: [parentCategory.id, ...subCategoryIds],
        };
      }

      // 🔹 Map brand name → brandId
      if (brandNames.length > 0) {
        const allBrands = await Brand.findAll({
          where: { isActive: true, deletedAt: null },
        });

        const matchedIds = allBrands
          .filter((b) => brandNames.includes(b.name))
          .map((b) => b.id);

        if (matchedIds.length > 0) {
          whereClause.brandId = { [Op.in]: matchedIds };
        }
      }

      // 🔹 Filter stock
      if (stock === "true") {
        whereClause["$skus.stock$"] = { [Op.gt]: 0 };
      }

      // 🔹 Filter price range
      if (priceRange) {
        const ranges = {
          "Dưới 10 Triệu": { [Op.lte]: 10000000 },
          "Từ 10 - 16 Triệu": { [Op.between]: [10000000, 16000000] },
          "Từ 16 - 22 Triệu": { [Op.between]: [16000000, 22000000] },
          "Trên 22 Triệu": { [Op.gt]: 22000000 },
        };
        if (ranges[priceRange]) {
          whereClause["$skus.price$"] = ranges[priceRange];
        }
      }

      // 🔹 Sắp xếp
      let orderClause = [["createdAt", "DESC"]];
      if (sort === "asc") orderClause = [["skus", "price", "ASC"]];
      else if (sort === "desc") orderClause = [["skus", "price", "DESC"]];

      // 🔹 Đếm tổng
      const totalItems = await Product.count({
        where: whereClause,
        include: [
          {
            model: Sku,
            as: "skus",
            attributes: [],
            required: true,
          },
        ],
        distinct: true,
        col: "id", // ✅ CHỈ GHI 'id' (không cần prefix model hay alias)
      });

      const shouldPaginate = totalItems > limit;

      const products = await Product.findAll({
        where: whereClause,
        order: orderClause,
        include: [
          {
            model: Sku,
            as: "skus",
            attributes: ["id", "price", "originalPrice", "stock"],
            include: [
              {
                model: ProductMedia,
                as: "media",
                attributes: ["mediaUrl", "sortOrder"],
                where: { sortOrder: 0 },
                required: false,
              },
            ],
            required: true,
          },
          { model: Category, as: "category", attributes: ["id", "name"] },
          { model: Brand, as: "brand", attributes: ["id", "name"] },
        ],
        subQuery: false, // 🟢 CẦN THÊM DÒNG NÀY
        ...(shouldPaginate && { limit: parseInt(limit), offset }),
      });

      res.json({
        products,
        totalItems,
        currentPage: shouldPaginate ? parseInt(page) : 1,
        totalPages: shouldPaginate
          ? Math.ceil(totalItems / parseInt(limit))
          : 1,
        paginationEnabled: shouldPaginate,
      });
    } catch (error) {
      console.error("❌ Lỗi lấy sản phẩm theo danh mục:", error);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = ProductController;
