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
  FlashSaleCategory,
  FlashSale,
} = require("../../models");
const { Sequelize, Op } = require("sequelize");
const { literal } = Sequelize;

class SectionClientController {
  static async getHomeSections(req, res) {
    try {
      const now = new Date();

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
            model: Category,
            as: "linkedCategories",
            attributes: ["id", "name", "slug"],
            through: { attributes: ["sortOrder"] },
          },
          {
            model: Product,
            as: "products",
            required: false,
            attributes: ["id", "name", "slug", "thumbnail", "badge"],
            through: { attributes: ["sortOrder"] },
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
                          startTime: { [Op.lte]: now },
                          endTime: { [Op.gte]: now },
                        },
                      },
                    ],
                  },
                  {
                    model: OrderItem,
                    as: "OrderItems",
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

      const activeCatDeals = await FlashSaleCategory.findAll({
        include: [
          {
            model: FlashSale,
            as: "flashSale",
            attributes: ["endTime"],
            where: {
              isActive: true,
              startTime: { [Op.lte]: now },
              endTime: { [Op.gte]: now },
            },
          },
        ],
      });

      const catDealMap = new Map();
      activeCatDeals.forEach((d) => {
        const has = catDealMap.get(d.categoryId);
        if (!has || d.priority > has.priority) {
          catDealMap.set(d.categoryId, {
            discountType: d.discountType,
            discountValue: d.discountValue,
            priority: d.priority,
            endTime: d.flashSale.endTime,
          });
        }
      });

      const data = sections.map((sec) => {
        const section = sec.toJSON();

        section.products = (section.products || []).map((prod) => {
          const soldCount = (prod.skus || []).reduce((t, sku) => {
            const sold =
              sku.orderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0;
            return t + sold;
          }, 0);

          const skus = (prod.skus || []).map((sku) => {
            const fsItem = sku.flashSaleSkus?.[0];
            if (fsItem && fsItem.flashSale) {
              return {
                ...sku,
                originalPrice: sku.originalPrice,
                price: fsItem.salePrice,
                salePrice: fsItem.salePrice,
                flashSaleInfo: {
                  quantity: fsItem.quantity,
                  endTime: fsItem.flashSale.endTime,
                },
              };
            }

            const deal = catDealMap.get(prod.category?.id);
            if (deal) {
              let newPrice = sku.price;
              if (deal.discountType === "percent") {
                newPrice = (sku.price * (100 - deal.discountValue)) / 100;
              } else {
                newPrice = sku.price - deal.discountValue;
              }
              newPrice = Math.max(0, Math.round(newPrice / 1000) * 1000);

              return {
                ...sku,
                originalPrice: sku.originalPrice,
                price: newPrice,
                salePrice: newPrice,
                flashSaleInfo: { endTime: deal.endTime },
                discountApplied: {
                  type: deal.discountType,
                  value: deal.discountValue,
                },
              };
            }

            return sku;
          });

          skus.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

          return { ...prod, skus, soldCount };
        });

        section.products.sort(
          (a, b) =>
            (a.ProductHomeSection?.sortOrder || 0) -
            (b.ProductHomeSection?.sortOrder || 0)
        );

        return section;
      });

      return res.json({ success: true, data });
    } catch (err) {
      console.error("[SectionClientController.getHomeSections]", err);
      return res
        .status(500)
        .json({
          success: false,
          message: "Lỗi server khi lấy danh sách section",
          error: err.message,
        });
    }
  }
}

module.exports = SectionClientController;
