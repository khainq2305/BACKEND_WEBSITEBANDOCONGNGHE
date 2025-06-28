const {
  ProductView,
  Product,
  Category,
  FlashSaleCategory,
  Brand,
  Sku,
  FlashSaleItem,
  FlashSale,
} = require("../../models");
const { Op, fn, col } = require("sequelize");

class ProductViewController {
  static async addView(req, res) {
    try {
      const { productId } = req.body;

      if (!productId) {
        return res.status(400).json({ message: "Thiếu productId" });
      }

      await ProductView.create({
        userId: null,
        productId,
      });

      return res
        .status(201)
        .json({ message: "Đã ghi nhận lượt xem (ẩn danh)" });
    } catch (err) {
      console.error("Lỗi khi thêm lượt xem ẩn danh:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async getByIds(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || !ids.length) {
        return res.status(400).json({ message: "Danh sách ids không hợp lệ" });
      }

      const products = await Product.findAll({
        where: { id: { [Op.in]: ids }, isActive: 1, deletedAt: null },
        attributes: ["id", "name", "slug", "thumbnail", "categoryId"],
        include: [
          { model: Brand, as: "brand", attributes: ["id", "name"] },
          { model: Category, as: "category", attributes: ["id", "name"] },
          {
            model: Sku,
            as: "skus",
            attributes: ["id", "price", "originalPrice", "stock"],
            include: [
              {
                model: FlashSaleItem,
                as: "flashSaleSkus",
                required: false,
                include: [
                  {
                    model: FlashSale,
                    as: "flashSale",
                    required: true,
                    where: {
                      isActive: true,
                      startTime: { [Op.lte]: new Date() },
                      endTime: { [Op.gte]: new Date() },
                    },
                    attributes: ["endTime"],
                  },
                ],
              },
            ],
          },
        ],
      });

      const now = new Date();
      const catIds = [...new Set(products.map((p) => p.categoryId))];
      const catDeals = await FlashSaleCategory.findAll({
        where: { categoryId: { [Op.in]: catIds } },
        include: [
          {
            model: FlashSale,
            as: "flashSale",
            required: true,
            where: {
              isActive: true,
              startTime: { [Op.lte]: now },
              endTime: { [Op.gte]: now },
            },
            attributes: ["endTime"],
          },
        ],
      });

      const catDealMap = new Map();
      catDeals.forEach((d) => {
        const stored = catDealMap.get(d.categoryId);
        if (!stored || d.priority > stored.priority) {
          catDealMap.set(d.categoryId, {
            discountType: d.discountType,
            discountValue: d.discountValue,
            endTime: d.flashSale.endTime,
          });
        }
      });

      const result = ids
        .map((id) => products.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => {
          const pj = p.toJSON();
          const skus = pj.skus || [];

          const best =
            skus.find((s) => s.flashSaleSkus?.length) || skus[0] || {};
          let price = 0;
          let originalPrice = 0;
          let flashSaleInfo = null;

          const fsItem = best.flashSaleSkus?.[0];
          if (fsItem) {
            price = +fsItem.salePrice || 0;
            originalPrice = +best.originalPrice || 0;
            flashSaleInfo = { endTime: fsItem.flashSale.endTime };
          } else {
            const catDeal = catDealMap.get(pj.categoryId);
            if (catDeal && best.price != null) {
              let tmp = +best.price;
              if (catDeal.discountType === "percent") {
                tmp = (tmp * (100 - catDeal.discountValue)) / 100;
              } else {
                tmp = tmp - catDeal.discountValue;
              }
              tmp = Math.max(0, Math.round(tmp / 1_000) * 1_000);

              if (tmp < +best.price) {
                price = tmp;
                originalPrice = +best.price || +best.originalPrice || 0;
                flashSaleInfo = { endTime: catDeal.endTime };
              }
            }

            if (!price) {
              if (best.price != null) {
                price = +best.price || 0;
                originalPrice = +best.originalPrice || 0;
              } else {
                price = +best.originalPrice || 0;
                originalPrice = 0;
              }
            }
          }

          return {
            id: pj.id,
            name: pj.name,
            slug: pj.slug,
            thumbnail: pj.thumbnail,
            brand: pj.brand,
            category: pj.category,
            price,
            originalPrice,
            inStock: (best.stock || 0) > 0,
            flashSaleInfo,
          };
        });

      return res.json({ products: result });
    } catch (err) {
      console.error("Lỗi getByIds:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async getTopViewedProducts(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;

      const topViewed = await Product.findAll({
        attributes: {
          include: [[fn("COUNT", col("views.id")), "viewCount"]],
        },
        include: [
          {
            model: ProductView,
            as: "views",
            attributes: [],
          },
          { model: Brand, as: "brand", attributes: ["id", "name"] },
          { model: Category, as: "category", attributes: ["id", "name"] },
        ],
        group: ["Product.id", "brand.id", "category.id"],
        order: [[fn("COUNT", col("views.id")), "DESC"]],
        limit,
      });

      res.json({ products: topViewed });
    } catch (err) {
      console.error("Lỗi khi lấy top sản phẩm được xem nhiều:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = ProductViewController;
