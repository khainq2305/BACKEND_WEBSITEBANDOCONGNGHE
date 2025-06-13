const {
  HomeSection,
  HomeSectionBanner,
  Product,
  Sku,
} = require("../../models");

const { Sequelize } = require("sequelize");
const { literal } = Sequelize;

class SectionClientController {
  static async getHomeSections(req, res) {
    try {
      const sections = await HomeSection.findAll({
        where: { isActive: true },
        order: [["orderIndex", "ASC"]],
        include: [
          {
            model: HomeSectionBanner,
            as: "banners",
            attributes: [
              "id",
              "imageUrl",
              "linkType",
              "linkValue",
              "sortOrder",
            ],
            separate: true,
            order: [["sortOrder", "ASC"]],
          },
          {
            model: Product,
            as: "products",
            required: false,
            attributes: [
              "id",
              "name",
              "slug",
              "thumbnail",

              [
                Sequelize.literal(`(
    SELECT SUM(oi.quantity)
    FROM orderitems AS oi
    JOIN skus AS s ON s.id = oi.skuId
    WHERE s.productId = products.id
  )`),
                "soldCount",
              ],
              [
                Sequelize.literal(`(
    SELECT AVG(r.rating)
    FROM reviews AS r
    JOIN skus AS s ON s.id = r.skuId
    WHERE s.productId = products.id
  )`),
                "averageRating",
              ],
            ],
            through: {
              attributes: ["sortOrder"],
            },
            include: [
              {
                model: Sku,
                as: "skus",
                required: false,
                attributes: [
                  "id",
                  "skuCode",
                  "price",
                  "originalPrice",
                  "stock",
                ],
              },
            ],
          },
        ],
      });

      for (const section of sections) {
        if (section.products) {
          for (const product of section.products) {
            if (product.skus && Array.isArray(product.skus)) {
              product.skus = product.skus.filter((sku) => sku.price !== null);

              product.skus.sort((a, b) => a.price - b.price);
            }
          }

          section.products.sort((a, b) => {
            return (
              (a.ProductHomeSection?.sortOrder || 0) -
              (b.ProductHomeSection?.sortOrder || 0)
            );
          });
        }
      }

      res.json({ success: true, data: sections });
    } catch (error) {
      console.error("[getHomeSections]", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy danh sách section",
        error: error.message,
      });
    }
  }
}

module.exports = SectionClientController;
