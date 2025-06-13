const {
  Product,
  Category,
  Brand,
  Sku,
  ProductMedia,
  SkuVariantValue,
  VariantValue,
  Variant,
  ProductInfo,
  ProductSpec,
  Review,
  OrderItem,
  FlashSaleItem,
  FlashSale, // ✅ THÊM 2 MODEL NÀY VÀO
} = require("../../models");

const { Sequelize, Op } = require("sequelize");
const { fn, col, literal } = Sequelize;

class ProductController {
  static async getProductDetailBySlug(req, res) {
    try {
      const { slug } = req.params;
      const { includeInactive } = req.query;

      console.log("📌 [GET PRODUCT DETAIL] Slug nhận vào:", slug);

      const whereClause = { slug };
      if (!includeInactive || includeInactive !== "true") {
        whereClause.isActive = 1;
      }

      const product = await Product.findOne({
        where: whereClause,
        attributes: {
          include: [
            [
              literal(`(
              SELECT SUM(oi.quantity)
              FROM orderitems oi
              INNER JOIN skus s ON s.id = oi.skuId
              WHERE s.productId = Product.id
            )`),
              "soldCount",
            ],
            [
              literal(`(
              SELECT AVG(r.rating)
              FROM reviews r
              INNER JOIN skus s ON s.id = r.skuId
              WHERE s.productId = Product.id
            )`),
              "averageRating",
            ],
          ],
        },
        include: [
          { model: Category, as: "category" },
          { model: Brand, as: "brand" },
          {
            model: Sku,
            as: "skus",
            include: [
              {
                model: ProductMedia,
                as: "ProductMedia",
                attributes: ["type", "mediaUrl", "sortOrder"],
              },
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
            ],
          },
          {
            model: ProductInfo,
            as: "productInfo",
            attributes: ["content"],
          },
          {
            model: ProductSpec,
            as: "specs",
            attributes: ["specKey", "specValue", "specGroup"],
            order: [["sortOrder", "ASC"]],
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
  // static async getProductDetailBySlug(req, res) {
  //     try {
  //       const { slug } = req.params;
  //       const { includeInactive } = req.query;

  //       console.log("📌 [GET PRODUCT DETAIL] Slug nhận vào:", slug);

  //       const whereClause = { slug };
  //       if (!includeInactive || includeInactive !== 'true') {
  //         whereClause.isActive = 1;
  //       }

  //       // --- BƯỚC 1: TRUY VẤN SẢN PHẨM VÀ LẤY KÈM GIÁ FLASH SALE NẾU CÓ ---
  //       const product = await Product.findOne({
  //         where: whereClause,
  //         attributes: {
  //           include: [
  //             [
  //               literal(`(
  //                 SELECT SUM(oi.quantity)
  //                 FROM orderitems oi
  //                 INNER JOIN skus s ON s.id = oi.skuId
  //                 WHERE s.productId = Product.id
  //               )`),
  //               'soldCount'
  //             ],
  //             [
  //               literal(`(
  //                 SELECT AVG(r.rating)
  //                 FROM reviews r
  //                 INNER JOIN skus s ON s.id = r.skuId
  //                 WHERE s.productId = Product.id
  //               )`),
  //               'averageRating'
  //             ]
  //           ]
  //         },
  //         include: [
  //           { model: Category, as: 'category' },
  //           { model: Brand, as: 'brand' },
  //           {
  //             model: Sku,
  //             as: 'skus',
  //             include: [
  //               {
  //                 model: ProductMedia,
  //                 as: 'ProductMedia',
  //                 attributes: ['type', 'mediaUrl', 'sortOrder']
  //               },
  //               {
  //                 model: SkuVariantValue,
  //                 as: 'variantValues',
  //                 include: [
  //                   {
  //                     model: VariantValue,
  //                     as: 'variantValue',
  //                     attributes: ['id', 'value', 'imageUrl', 'colorCode'],
  //                     include: [
  //                       {
  //                         model: Variant,
  //                         as: 'variant',
  //                         attributes: ['id', 'name', 'type']
  //                       }
  //                     ]
  //                   }
  //                 ]
  //               },
  //               // ✅ Lấy kèm thông tin Flash Sale đang hoạt động
  //               {
  //                 model: FlashSaleItem,
  //                 as: 'flashSaleSkus', // Dùng alias đã định nghĩa trong index.js
  //                 required: false,     // LEFT JOIN
  //                 include: [
  //                   {
  //                     model: FlashSale,
  //                     as: 'flashSale', // Dùng alias đã định nghĩa trong index.js
  //                     where: {
  //                       isActive: 1,
  //                       startTime: { [Op.lte]: new Date() },
  //                       endTime: { [Op.gte]: new Date() }
  //                     },
  //                     required: true // INNER JOIN giữa FlashSaleItem và FlashSale
  //                   }
  //                 ]
  //               }
  //             ]
  //           },
  //           {
  //             model: ProductInfo,
  //             as: 'productInfo',
  //             attributes: ['content']
  //           },
  //           {
  //             model: ProductSpec,
  //             as: 'specs',
  //             attributes: ['specKey', 'specValue', 'specGroup'],
  //             order: [['sortOrder', 'ASC']]
  //           }
  //         ]
  //       });

  //       if (!product) {
  //         return res.status(404).json({ message: '❌ Không tìm thấy sản phẩm theo slug này!' });
  //       }

  //       // --- BƯỚC 2: XỬ LÝ DỮ LIỆU ĐỂ ÁP DỤNG GIÁ FLASH SALE VÀO KẾT QUẢ TRẢ VỀ ---
  //       const productJson = product.toJSON();

  //       productJson.skus = productJson.skus.map(sku => {
  //         // Tìm xem SKU này có trong chương trình flash sale nào không
  //         const activeFlashSaleItem = sku.flashSaleSkus?.[0]; // Lấy item đầu tiên nếu có

  //         if (activeFlashSaleItem) {
  //           // Nếu có, tạo một bản ghi SKU mới với giá đã được cập nhật
  //           return {
  //             ...sku,
  //             originalPrice: sku.price, // Giá gốc của SKU sẽ được gán cho originalPrice
  //             price: activeFlashSaleItem.salePrice, // Giá khuyến mãi sẽ được gán cho price
  //             // Thêm thông tin về flash sale nếu cần thiết cho frontend
  //             flashSaleInfo: {
  //               quantity: activeFlashSaleItem.quantity,
  //               endTime: activeFlashSaleItem.flashSale.endTime
  //             }
  //           };
  //         }

  //         // Nếu không có flash sale, trả về SKU như bình thường
  //         return sku;
  //       });

  //       // --- BƯỚC 3: TRẢ VỀ KẾT QUẢ ĐÃ ĐƯỢC XỬ LÝ ---
  //       return res.status(200).json({ product: productJson });

  //     } catch (err) {
  //       console.error('🔥 Lỗi khi lấy chi tiết sản phẩm:', err);
  //       return res.status(500).json({ message: '⚠️ Lỗi server khi lấy chi tiết sản phẩm' });
  //     }
  //   }
  /* controllers/ProductController.js */
  static async getProductsByCategory(req, res) {
    try {
      /** ------------------ 1. LẤY & XỬ LÝ QUERY ------------------ */
      const {
        slug, // slug danh mục cha
        page = 1,
        limit = 20,
        stock, // "true" => chỉ lấy sku còn hàng
        priceRange, // chuỗi phạm vi giá
        sort = "popular", // popular | newest | asc | desc
      } = req.query;

      // brand có thể là chuỗi "Samsung,Apple" hoặc mảng
      let brandNames = req.query.brand;
      if (typeof brandNames === "string" && brandNames.trim()) {
        brandNames = brandNames.split(",");
      } else if (!Array.isArray(brandNames)) {
        brandNames = [];
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);

      /********** 2. XÂY WHERE CLAUSE CHO PRODUCT & SKU **********/
      const productWhere = { isActive: 1, deletedAt: null };
      const skuWhere = {};

      /* 2.1. Lọc theo danh mục + con */
      if (slug) {
        const parentCat = await Category.findOne({
          where: { slug, isActive: 1 },
          attributes: ["id"],
        });
        if (!parentCat)
          return res.status(404).json({ message: "Không tìm thấy danh mục" });

        // lấy id con (chỉ 1 cấp – đủ cho shop dạng phone/laptop…)
        const childIds = await Category.findAll({
          where: { parentId: parentCat.id, isActive: 1 },
          attributes: ["id"],
        }).then((rows) => rows.map((c) => c.id));

        productWhere.categoryId = { [Op.in]: [parentCat.id, ...childIds] };
      }

      /* 2.2. Lọc brand */
      if (brandNames.length > 0) {
        const brandIds = await Brand.findAll({
          where: { name: { [Op.in]: brandNames }, isActive: 1 },
          attributes: ["id"],
        }).then((rows) => rows.map((b) => b.id));

        if (brandIds.length) productWhere.brandId = { [Op.in]: brandIds };
      }

      /* 2.3. Lọc tồn kho & giá */
      if (stock === "true") skuWhere.stock = { [Op.gt]: 0 };

      if (priceRange) {
        // mapping nhãn → điều kiện
        const ranges = {
          "Dưới 10 Triệu": { [Op.lte]: 10_000_000 },
          "Từ 10 - 16 Triệu": { [Op.between]: [10_000_000, 16_000_000] },
          "Từ 16 - 22 Triệu": { [Op.between]: [16_000_000, 22_000_000] },
          "Trên 22 Triệu": { [Op.gt]: 22_000_000 },
        };
        if (ranges[priceRange]) skuWhere.price = ranges[priceRange];
      }

      /********** 3. SẮP XẾP **********/
      let order = [["soldCount", "DESC"]]; // popular
      if (sort === "newest") order = [["createdAt", "DESC"]];
      if (sort === "asc") order = [[literal("min_price"), "ASC"]];
      if (sort === "desc") order = [[literal("max_price"), "DESC"]];

      /********** 4. QUERY CHÍNH – GOM MỘT LẦN **********/
      const { count, rows } = await Product.findAndCountAll({
        where: productWhere,
        attributes: [
          "id",
          "name",
          "slug",
          "thumbnail",
          [fn("SUM", col("skus->OrderItems.quantity")), "soldCount"],
          [fn("AVG", col("skus->reviews.rating")), "averageRating"],
          [fn("MIN", col("skus.price")), "min_price"],
          [fn("MAX", col("skus.originalPrice")), "max_original_price"],
        ],
        include: [
          {
            model: Sku,
            as: "skus",
            attributes: [],
            where: skuWhere,
            required: true, // inner join
            include: [
              { model: OrderItem, as: "OrderItems", attributes: [] },
              { model: Review, as: "reviews", attributes: [] },
            ],
          },
        ],
        group: ["Product.id"],
        order,
        subQuery: false,
        limit: parseInt(limit),
        offset,
      });

      if (!rows.length) {
        return res.json({
          products: [],
          totalItems: 0,
          currentPage: +page,
          totalPages: 1,
          paginationEnabled: false,
        });
      }
      const pageIds = rows.map((r) => r.id);
      const details = await Product.findAll({
        where: { id: { [Op.in]: pageIds } },
        attributes: ["id", "name", "slug", "thumbnail"],
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
            ],
          },
        ],

        order: [Sequelize.literal(`FIELD(Product.id, ${pageIds.join(",")})`)],
      });

      const formatted = details.map((p) => {
        const primarySku = p.skus?.[0] || {};
        const price = primarySku.price ?? null;
        const original = primarySku.originalPrice ?? null;

        let displayPrice = null;
        let displayOld = null;
        let discount = null;

        if (price && price > 0) {
          displayPrice = price;
          if (original && original > price) {
            displayOld = original;
            discount = Math.round(((original - price) / original) * 100);
          }
        } else if (original) {
          displayPrice = original;
        }

        const agg = rows.find((r) => r.id === p.id);
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          thumbnail: p.thumbnail,
          image: primarySku.ProductMedia?.[0]?.mediaUrl || p.thumbnail,
          price: displayPrice,
          originalPrice: displayOld,
          discount,
          soldCount: parseInt(agg.get("soldCount") || 0, 10),
          averageRating: parseFloat(agg.get("averageRating") || 0).toFixed(1),
          inStock: primarySku.stock > 0,
          skus: p.skus,
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
      console.error("Lỗi lấy sản phẩm theo danh mục:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
  static async getRelatedProducts(req, res) {
    try {
      const { categoryId, excludeId } = req.query;

      if (!categoryId) {
        return res.status(400).json({ message: "Cần cung cấp categoryId." });
      }

      const whereClause = {
        categoryId,
        isActive: 1,
        deletedAt: null,
      };

      if (excludeId) {
        whereClause.id = { [Op.ne]: excludeId };
      }

      const products = await Product.findAll({
        where: whereClause,
        attributes: ["id", "name", "slug", "thumbnail"],
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: Sku,
            as: "skus",
            attributes: ["price", "originalPrice"],
          },
        ],
      });

      const formattedProducts = products.map((p) => {
        const productJson = p.toJSON();
        let finalPrice = null;
        let finalOldPrice = null;
        let discount = null;

        if (productJson.skus?.length > 0) {
          const validSkus = productJson.skus.filter((s) => s.price > 0);
          if (validSkus.length > 0) {
            const bestSku = validSkus.reduce(
              (min, s) => (s.price < min.price ? s : min),
              validSkus[0]
            );
            finalPrice = bestSku.price;
            if (
              bestSku.originalPrice &&
              bestSku.originalPrice > bestSku.price
            ) {
              finalOldPrice = bestSku.originalPrice;
            }
          } else {
            finalPrice = productJson.skus[0].originalPrice || null;
          }
        }

        if (finalOldPrice && finalPrice) {
          discount = Math.round(
            ((finalOldPrice - finalPrice) / finalOldPrice) * 100
          );
        }

        return {
          id: productJson.id,
          name: productJson.name,
          slug: productJson.slug,
          image: productJson.thumbnail,
          price: finalPrice,
          oldPrice: finalOldPrice,

          discount,
          rating: 0,
          soldCount: 0,
          isFavorite: false,
          inStock: true,
        };
      });

      res.status(200).json({ products: formattedProducts });
    } catch (err) {
      console.error("Lỗi khi lấy sản phẩm tương tự:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = ProductController;
