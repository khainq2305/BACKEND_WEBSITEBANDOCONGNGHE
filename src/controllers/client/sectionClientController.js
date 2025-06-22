// controllers/SectionClientController.js

const {
  HomeSection,
  HomeSectionBanner,
  Product,
  Sku,
  Category,
  OrderItem,
  Order,
  FlashSaleItem,
  FlashSale
} = require("../../models");
const { Sequelize, Op } = require("sequelize");
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
          attributes: ["id", "imageUrl", "linkType", "linkValue", "sortOrder"],
          separate: true,
          order: [["sortOrder", "ASC"]],
        },
        {
          model: Category,
          as: "linkedCategories",
          attributes: ["id", "name", "slug"],
          through: { attributes: ["sortOrder"] },
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
            "badge",
          ],
          through: { attributes: ["sortOrder"] },
          include: [
            {
              model: Sku,
              as: "skus",
              required: false,
              attributes: ["id", "skuCode", "price", "originalPrice", "stock"],
              include: [
                {
                  model: FlashSaleItem,
                  as: "flashSaleSkus",
                  required: false,
                  include: [
                    {
                      model: FlashSale,
                      as: "flashSale",
                      required: false,
                      where: {
                        isActive: true,
                        startTime: { [Op.lte]: new Date() },
                        endTime: { [Op.gte]: new Date() },
                      },
                    },
                  ],
                },
                {
                  model: OrderItem,
             
                  required: false,
                  include: [
                    {
                      model: Order,
                      as: "order",
                      attributes: [],
                      where: { status: "completed" },
                      required: false,
                    },
                  ],
                },
              ],
            },
            {
              model: Category,
              as: "category",
              attributes: ["id", "name", "slug"],
            },
          ],
        },
      ],
    });

    // Xử lý JSON + tính soldCount
    const data = sections.map((sec) => {
      const section = sec.toJSON();

      if (Array.isArray(section.products)) {
        section.products = section.products.map((prod) => {
          // ✅ Tính tổng đã bán
          const soldCount = (prod.skus || []).reduce((total, sku) => {
            const skuSold = sku.orderItems?.reduce((sum, oi) => sum + (oi.quantity || 0), 0) || 0;
            return total + skuSold;
          }, 0);

          // ✅ build lại skus + xử lý flash sale
          const skus = (prod.skus || []).map((sku) => {
            const fsItem = sku.flashSaleSkus?.[0];
            if (fsItem && fsItem.flashSale) {
              return {
                ...sku,
                originalPrice: sku.originalPrice,
                price: fsItem.salePrice,
                flashSaleInfo: {
                  quantity: fsItem.quantity,
                  endTime: fsItem.flashSale.endTime,
                },
              };
            }
            return sku;
          });

          // ✅ sắp xếp SKU theo giá
          skus.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

          return {
            ...prod,
            skus,
            soldCount,
          };
        });

        section.products.sort((a, b) => {
          return (a.ProductHomeSection?.sortOrder || 0) - (b.ProductHomeSection?.sortOrder || 0);
        });
      }

      return section;
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error("[SectionClientController.getHomeSections]", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách section",
      error: error.message,
    });
  }
}

}

module.exports = SectionClientController;
