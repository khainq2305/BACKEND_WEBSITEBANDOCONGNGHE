const {
  Product,
  Category,
  Brand,
  Sku,
  ProductMedia,
  SkuVariantValue,
  VariantValue,
  Variant,
   Order,
  ProductInfo,
  ProductSpec,
  Review,
  FlashSaleCategory,
  OrderItem,
  FlashSaleItem,
  FlashSale, // ✅ THÊM 2 MODEL NÀY VÀO
} = require("../../models");

const { Sequelize, Op } = require("sequelize");
const { fn, col, literal } = Sequelize;

class ProductController {
  /* controllers/client/productController.js */
  // controllers/client/productController.js
  static async getProductDetailBySlug(req, res) {
    try {
      const { slug } = req.params;
      const { includeInactive } = req.query;

      
      const whereClause = { slug };
      if (!includeInactive || includeInactive !== "true")
        whereClause.isActive = 1;

      const product = await Product.findOne({
        where: whereClause,
        attributes: {
          include: [
            
            [
              literal(`(
              SELECT COALESCE(SUM(oi.quantity),0)
              FROM orderitems oi
              INNER JOIN skus s ON s.id = oi.skuId
              WHERE s.productId = Product.id
            )`),
              "soldCount",
            ],
            /* rating TB */
            [
              literal(`(
              SELECT AVG(r.rating)
              FROM reviews r
              INNER JOIN skus s ON s.id = r.skuId
              WHERE s.productId = Product.id
            )`),
              "averageRating",
            ],
            /* số đánh giá */
            [
              literal(`(
              SELECT COUNT(r.id)
              FROM reviews r
              INNER JOIN skus s ON s.id = r.skuId
              WHERE s.productId = Product.id
            )`),
              "reviewCount",
            ],
          ],
        },
        include: [
          {
            model: Category,
            as: "category",
            attributes: ["id", "name", "slug"],
          },
          { model: Brand, as: "brand", attributes: ["id", "name", "slug"] },

          /* ---------- SKU ---------- */
          {
            model: Sku,
            as: "skus",
            attributes: ["id", "skuCode", "price", "originalPrice", "stock"],
            include: [
              /* media chính của SKU */
              {
                model: ProductMedia,
                as: "ProductMedia",
                attributes: ["mediaUrl", "type", "sortOrder"],
                separate: true,
                order: [["sortOrder", "ASC"]],
              },
              /* giá trị thuộc tính (màu / dung lượng ...) */
              {
                model: SkuVariantValue,
                as: "variantValues",
                include: [
                  {
                    model: VariantValue,
                    as: "variantValue",
                    attributes: ["id", "value", "imageUrl", "colorCode"],
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
              /* Flash-sale đặt riêng cho SKU */
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
                    attributes: ["id", "endTime"],
                  },
                ],
              },
            ],
          },

          /* ---------- thông tin/spéc ---------- */
          { model: ProductInfo, as: "productInfo", attributes: ["content"] },
          {
            model: ProductSpec,
            as: "specs",
            attributes: ["specKey", "specValue", "specGroup"],
            order: [["sortOrder", "ASC"]],
          },
        ],
      });

      if (!product) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm!" });
      }

      /* -------------------- 2. Flash-sale theo Danh mục -------------------- */
      const now = new Date();
      let catDeal = null;

      const catFlash = await FlashSaleCategory.findOne({
        where: { categoryId: product.category.id },
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
        order: [["priority", "DESC"]],
      });

      if (catFlash) {
        catDeal = {
          discountType: catFlash.discountType, // 'percent' | 'amount'
          discountValue: catFlash.discountValue,
          endTime: catFlash.flashSale.endTime,
        };
      }

      /* -------------------- 3. Format & gắn salePrice -------------------- */
      const productJson = product.toJSON();

      productJson.skus = productJson.skus.map((sku) => {
        /* A. Flash-sale SKU riêng */
        const fsItem = sku.flashSaleSkus?.[0];
        if (fsItem) {
          return {
            ...sku,
            salePrice: fsItem.salePrice,
            originalPrice: sku.price,
            price: fsItem.salePrice,
            flashSaleInfo: {
              quantity: fsItem.quantity,
              endTime: fsItem.flashSale.endTime,
            },
          };
        }

        /* B. Flash-sale theo Danh mục */
        if (catDeal) {
          let tmpPrice = sku.price;
          if (catDeal.discountType === "percent") {
            tmpPrice = (tmpPrice * (100 - catDeal.discountValue)) / 100;
          } else {
            tmpPrice = tmpPrice - catDeal.discountValue;
          }
          tmpPrice = Math.max(0, Math.round(tmpPrice / 1_000) * 1_000);

          if (tmpPrice < sku.price) {
            return {
              ...sku,
              salePrice: tmpPrice,
              originalPrice: sku.price,
              price: tmpPrice,
              flashSaleInfo: { endTime: catDeal.endTime },
            };
          }
        }

        return { ...sku, salePrice: null };
      });

      return res.status(200).json({ product: productJson });
    } catch (err) {
      return res.status(500).json({ message: "Lỗi server" });
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
      if (typeof brandNames === "string" && brandNames.trim())
        brandNames = brandNames.split(",");
      else if (!Array.isArray(brandNames)) brandNames = [];

      const offset = (+page - 1) * +limit;

      const productWhere = { isActive: 1, deletedAt: null };
      const skuWhere = {};
      if (slug) {
        const parentCat = await Category.findOne({
          where: { slug, isActive: 1 },
          attributes: ["id"],
        });
        if (!parentCat)
          return res.status(404).json({ message: "Không tìm thấy danh mục" });

        const childIds = await Category.findAll({
          where: { parentId: parentCat.id, isActive: 1 },
          attributes: ["id"],
        }).then((r) => r.map((c) => c.id));

        productWhere.categoryId = { [Op.in]: [parentCat.id, ...childIds] };
      }

      if (brandNames.length) {
        const brandIds = await Brand.findAll({
          where: { name: { [Op.in]: brandNames }, isActive: 1 },
          attributes: ["id"],
        }).then((r) => r.map((b) => b.id));
        if (brandIds.length) productWhere.brandId = { [Op.in]: brandIds };
      }

      if (stock === "true") skuWhere.stock = { [Op.gt]: 0 };
      if (priceRange) {
        const ranges = {
          "Dưới 10 Triệu": { [Op.lte]: 10_000_000 },
          "Từ 10 - 16 Triệu": { [Op.between]: [10_000_000, 16_000_000] },
          "Từ 16 - 22 Triệu": { [Op.between]: [16_000_000, 22_000_000] },
          "Trên 22 Triệu": { [Op.gt]: 22_000_000 },
        };
        if (ranges[priceRange]) skuWhere.price = ranges[priceRange];
      }

      let order = [];
      if (sort === "popular") order = [["createdAt", "DESC"]];
      if (sort === "newest") order = [["createdAt", "DESC"]];
      if (sort === "asc") order = [[literal("min_price"), "ASC"]];
      if (sort === "desc") order = [[literal("max_price"), "DESC"]];

      const { count, rows } = await Product.findAndCountAll({
        where: productWhere,
        attributes: [
          "id",
          "name",
          "slug",
          "thumbnail",
           "badgeImage",  
          "badge",
          [fn("MIN", col("skus.price")), "min_price"],
          [fn("MAX", col("skus.originalPrice")), "max_price"],
        ],
        include: [
          {
            model: Sku,
            as: "skus",
            attributes: [],
            where: skuWhere,
            required: true,
          },
        ],
        group: ["Product.id"],
        order,
        subQuery: false,
        limit: +limit,
        offset,
      });

      if (!rows.length)
        return res.json({
          products: [],
          totalItems: 0,
          currentPage: +page,
          totalPages: 1,
          paginationEnabled: false,
        });

      const pageIds = rows.map((r) => r.id);

      const now = new Date();
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
        const stored = catDealMap.get(d.categoryId);
        if (!stored || d.priority > stored.priority) {
          catDealMap.set(d.categoryId, {
            discountType: d.discountType,
            discountValue: d.discountValue,
            priority: d.priority,
            endTime: d.flashSale.endTime,
          });
        }
      });

      const details = await Product.findAll({
        where: { id: { [Op.in]: pageIds } },
        attributes: ["id", "name", "slug", "thumbnail", "badge", "categoryId", ],
        include: [
          {
            model: Sku,
            as: "skus",
            attributes: ["id", "price", "originalPrice", "stock"],
            include: [
              {
                model: ProductMedia,
                as: "ProductMedia",
                attributes: ["mediaUrl"],
                separate: true,
                limit: 1,
              },
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
            ],
          },
        ],
        order: [Sequelize.literal(`FIELD(Product.id, ${pageIds.join(",")})`)],
      });

      const formatted = details.map((prod) => {
        const skus = (prod.skus || [])
          .map((sku) => ({
            ...sku.get(),
            price: +sku.price || 0,
            originalPrice: +sku.originalPrice || 0,
          }))
          .sort((a, b) => {
            const aFS = a.flashSaleSkus?.length > 0;
            const bFS = b.flashSaleSkus?.length > 0;
            if (aFS && !bFS) return -1;
            if (!aFS && bFS) return 1;
            return (+a.price || 0) - (+b.price || 0);
          });

        const primary = skus[0] || {};
        const catDeal = catDealMap.get(prod.categoryId);
        let finalPrice = primary.price;
        let finalOldPrice = null;

        const fsItem = primary.flashSaleSkus?.[0];
        if (
          fsItem?.flashSale &&
          fsItem.salePrice > 0 &&
          fsItem.salePrice < primary.price
        ) {
          finalOldPrice = primary.price;
          finalPrice = fsItem.salePrice;
          primary.salePrice = fsItem.salePrice;
        }

        if (finalPrice === primary.price && catDeal) {
          let tmp = primary.price;
          if (catDeal.discountType === "percent") {
            tmp = (primary.price * (100 - catDeal.discountValue)) / 100;
          } else {
            tmp = primary.price - catDeal.discountValue;
          }
          tmp = Math.max(0, Math.round(tmp / 1000) * 1000);
          if (tmp < finalPrice) {
            finalOldPrice = primary.price;
            finalPrice = tmp;
            primary.salePrice = tmp;
          }
        }

        if (!finalOldPrice && primary.originalPrice > finalPrice) {
          finalOldPrice = primary.originalPrice;
        }

        let discount = null;
        const oldForCalc = finalOldPrice || primary.originalPrice;
        if (oldForCalc > finalPrice && finalPrice > 0) {
          discount = Math.round(((oldForCalc - finalPrice) / oldForCalc) * 100);
          discount = Math.min(99, Math.max(1, discount));
        }

        const totalStock = (prod.skus || []).reduce(
          (s, x) => s + (+x.stock || 0),
          0
        );

        return {
          id: prod.id,
          name: prod.name,
          slug: prod.slug,
          thumbnail: prod.thumbnail,
          badge: prod.badge,
          image: primary.ProductMedia?.[0]?.mediaUrl || prod.thumbnail,
badgeImage: prod.badgeImage, 
          price: finalPrice,
          oldPrice: finalOldPrice,
          originalPrice: primary.originalPrice,
          discount,
          inStock: totalStock > 0,
          skus,
        };
      });

      res.json({
        products: formatted,
        totalItems: count.length,
        currentPage: +page,
        totalPages: Math.ceil(count.length / limit),
        paginationEnabled: count.length > limit,
      });
    } catch (err) {
      console.error("Lỗi getProductsByCategory:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  /* controllers/client/productController.js */

  // controllers/SectionClientController.js
static async getRelatedProducts(req, res) {
  try {
    const { categoryId, excludeId } = req.query;
    if (!categoryId)
      return res.status(400).json({ message: 'Cần cung cấp categoryId.' });

    const whereClause = {
      categoryId,
      isActive : 1,
      deletedAt: null,
    };
    if (excludeId) whereClause.id = { [Op.ne]: excludeId };

    const now = new Date();

    /* ===== lấy deal flash-sale theo category (nếu có) ===== */
    let catDeal = null;
    const catFlash = await FlashSaleCategory.findOne({
      where : { categoryId },
      include: [{
        model   : FlashSale,
        as      : 'flashSale',
        required: true,
        where   : {
          isActive : true,
          startTime: { [Op.lte]: now },
          endTime  : { [Op.gte]: now },
        },
        attributes: ['endTime'],
      }],
      order: [['priority', 'DESC']],
    });
    if (catFlash) {
      catDeal = {
        discountType : catFlash.discountType,
        discountValue: catFlash.discountValue,
        endTime      : catFlash.flashSale.endTime,
      };
    }

    /* ===== lấy product + sku + flashSale + orderItems ===== */
    const products = await Product.findAll({
      where : whereClause,
      order : [['createdAt', 'DESC']],
      attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage'],
      include: [{
        model      : Sku,
        as         : 'skus',
        attributes : ['id', 'price', 'originalPrice', 'stock'],
        include: [
          /* flashSale của SKU */
          {
            model   : FlashSaleItem,
            as      : 'flashSaleSkus',
            required: false,
            include : [{
              model   : FlashSale,
              as      : 'flashSale',
              required: true,
              where   : { startTime: { [Op.lte]: now }, endTime: { [Op.gte]: now } },
              attributes: [],
            }],
          },
          /* orderItems đã hoàn thành – để đếm sold */
          {
            model   : OrderItem,
            as      : 'OrderItems',
            required: false,              // lấy SKU kể cả khi chưa bán
            include : [{
              model   : Order,
              as      : 'order',
              attributes: [],
              required : true,            // chỉ giữ OrderItem có đơn thoả status
              where    : { status: { [Op.in]: ['completed', 'delivered'] } },
            }],
          },
        ],
      }],
    });

    /* ===== format ===== */
    const formattedProducts = products.map((prod) => {
      /* ---- soldCount của product ---- */
      const soldCount = (prod.skus || []).reduce((sum, sku) => {
        const sold = sku.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0;
        return sum + sold;
      }, 0);

      /* ---- tính giá rẻ nhất + discount ---- */
      const skuInfos = (prod.skus || []).map((sku) => {
        const basePrice = +sku.price || 0;

        /* flashSale SKU */
        const fsItem = sku.flashSaleSkus?.[0];
        let salePrice = basePrice;
        if (fsItem && fsItem.salePrice > 0 && fsItem.salePrice < basePrice) {
          salePrice = fsItem.salePrice;
        } else if (catDeal) {
          let tmp = basePrice;
          tmp = catDeal.discountType === 'percent'
            ? (basePrice * (100 - catDeal.discountValue)) / 100
            : basePrice - catDeal.discountValue;
          tmp = Math.max(0, Math.round(tmp / 1_000) * 1_000);
          if (tmp < salePrice) salePrice = tmp;
        }

        const oldPrice = salePrice < basePrice ? basePrice : null;
        let discount = null;
        if (oldPrice && oldPrice > 0) {
          discount = Math.round(((oldPrice - salePrice) / oldPrice) * 100);
          discount = Math.min(99, Math.max(1, discount));
        }

        return { salePrice, oldPrice, discount, sku };
      });

      const best = skuInfos.sort((a, b) => a.salePrice - b.salePrice)[0] || {};

      return {
        id       : prod.id,
        name     : prod.name,
        slug     : prod.slug,
        image    : prod.thumbnail,
        price    : best.salePrice ?? null,
        oldPrice : best.oldPrice ?? null,
        discount : best.discount ?? null,
        badge    : prod.badge ?? null,
        badgeImage: prod.badgeImage ?? null,
        rating   : 0,           // (có thể tính thêm nếu cần)
        soldCount,
        isFavorite: false,
        inStock  : (prod.skus || []).some((s) => (s.stock || 0) > 0),
      };
    });

    return res.status(200).json({ products: formattedProducts });
  } catch (err) {
    console.error('Lỗi getRelatedProducts:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

}

module.exports = ProductController;
