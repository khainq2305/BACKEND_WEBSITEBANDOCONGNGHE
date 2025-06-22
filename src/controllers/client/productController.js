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
    if (!includeInactive || includeInactive !== 'true') {
      whereClause.isActive = 1;
    }

    // --- BƯỚC 1: TRUY VẤN SẢN PHẨM VÀ LẤY KÈM GIÁ FLASH SALE NẾU CÓ ---
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
            'soldCount'
          ],
          [
            literal(`(
              SELECT AVG(r.rating)
              FROM reviews r
              INNER JOIN skus s ON s.id = r.skuId
              WHERE s.productId = Product.id
            )`),
            'averageRating'
          ],
          [
            literal(`(
              SELECT COUNT(r.id)
              FROM reviews r
              INNER JOIN skus s ON s.id = r.skuId
              WHERE s.productId = Product.id
            )`),
            'reviewCount'
          ]
        ]
      },
      include: [
        { model: Category, as: 'category' },
        { model: Brand, as: 'brand' },
        {
          model: Sku,
          as: 'skus',
          include: [
            {
              model: ProductMedia,
              as: 'ProductMedia',
              attributes: ['type', 'mediaUrl', 'sortOrder']
            },
            {
              model: SkuVariantValue,
              as: 'variantValues',
              include: [
                {
                  model: VariantValue,
                  as: 'variantValue',
                  attributes: ['id', 'value', 'imageUrl', 'colorCode'],
                  include: [
                    {
                      model: Variant,
                      as: 'variant',
                      attributes: ['id', 'name', 'type']
                    }
                  ]
                }
              ]
            },
            // ✅ JOIN FLASH SALE ITEM
            {
              model: FlashSaleItem,
              as: 'flashSaleSkus',
              required: false,
              include: [
                {
                  model: FlashSale,
                  as: 'flashSale',
                  where: {
                    isActive: 1,
                    startTime: { [Op.lte]: new Date() },
                    endTime: { [Op.gte]: new Date() }
                  },
                  required: true
                }
              ]
            }
          ]
        },
        {
          model: ProductInfo,
          as: 'productInfo',
          attributes: ['content']
        },
        {
          model: ProductSpec,
          as: 'specs',
          attributes: ['specKey', 'specValue', 'specGroup'],
          order: [['sortOrder', 'ASC']]
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ message: '❌ Không tìm thấy sản phẩm theo slug này!' });
    }

    // --- BƯỚC 2: CẬP NHẬT GIÁ FLASH SALE ---
    const productJson = product.toJSON();

    productJson.skus = productJson.skus.map(sku => {
      const activeFlashSaleItem = sku.flashSaleSkus?.[0];
      if (activeFlashSaleItem) {
        return {
          ...sku,
          originalPrice: sku.price,
          price: activeFlashSaleItem.salePrice,
          flashSaleInfo: {
            quantity: activeFlashSaleItem.quantity,
            endTime: activeFlashSaleItem.flashSale.endTime
          }
        };
      }
      return sku;
    });

    // --- TRẢ VỀ ---
    return res.status(200).json({ product: productJson });

  } catch (err) {
    console.error('🔥 Lỗi khi lấy chi tiết sản phẩm:', err);
    return res.status(500).json({ message: '⚠️ Lỗi server khi lấy chi tiết sản phẩm' });
  }
}


  /* controllers/ProductController.js */
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
    if (typeof brandNames === "string" && brandNames.trim()) {
      brandNames = brandNames.split(",");
    } else if (!Array.isArray(brandNames)) {
      brandNames = [];
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const productWhere = { isActive: 1, deletedAt: null };
    const skuWhere = {};
    if (slug) {
      const parentCat = await Category.findOne({
        where: { slug, isActive: 1 },
        attributes: ["id"],
      });
      if (!parentCat) {
        return res.status(404).json({ message: "Không tìm thấy danh mục" });
      }
      const childIds = await Category.findAll({
        where: { parentId: parentCat.id, isActive: 1 },
        attributes: ["id"],
      }).then(rows => rows.map(c => c.id));
      productWhere.categoryId = { [Op.in]: [parentCat.id, ...childIds] };
    }

    if (brandNames.length) {
      const brandIds = await Brand.findAll({
        where: { name: { [Op.in]: brandNames }, isActive: 1 },
        attributes: ["id"],
      }).then(rows => rows.map(b => b.id));
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
        "id", "name", "slug", "thumbnail", "badge",
        [fn("MIN", col("skus.price")), "min_price"],
        [fn("MAX", col("skus.originalPrice")), "max_price"],
      ],
      include: [{
        model: Sku,
        as: "skus",
        attributes: [],
        where: skuWhere,
        required: true,
      }],
      group: ["Product.id"],
      order,
      subQuery: false,
      limit: parseInt(limit, 10),
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

    const pageIds = rows.map(r => r.id);
    const details = await Product.findAll({
      where: { id: { [Op.in]: pageIds } },
      attributes: ["id", "name", "slug", "thumbnail", "badge"],
      include: [{
        model: Sku,
        as: "skus",
        attributes: ["id", "price", "originalPrice", "stock"],
        include: [
          {
            model: ProductMedia,
            as: "ProductMedia",
            attributes: ["mediaUrl"],
            separate: true,
            limit: 1
          },
          {
            model: FlashSaleItem,
            as: "flashSaleSkus",
            required: false,
            include: [{
              model: FlashSale,
              as: "flashSale",
              required: false,
              where: {
                isActive: true,
                startTime: { [Op.lte]: new Date() },
                endTime: { [Op.gte]: new Date() }
              }
            }]
          }
        ]
      }],
      order: [Sequelize.literal(`FIELD(Product.id, ${pageIds.join(",")})`)],
    });

    const formatted = details.map(prod => {
      const skus = (prod.skus || [])
        .map(sku => ({
          ...sku.get(),
          price: sku.price == null ? 0 : sku.price,
          originalPrice: sku.originalPrice == null ? 0 : sku.originalPrice,
        }))
        .sort((a, b) => {
          const aFlash = a.flashSaleSkus?.length > 0;
          const bFlash = b.flashSaleSkus?.length > 0;
          if (aFlash && !bFlash) return -1;
          if (!aFlash && bFlash) return 1;
          return (a.price || 0) - (b.price || 0);
        });

      const primary = skus[0] || {};
      let finalPrice = primary.price;
      let finalOldPrice = null;

      const totalStock = (prod.skus || []).reduce((sum, sku) => sum + (sku.stock || 0), 0);

      const activeFlashSaleItem = primary.flashSaleSkus?.[0];
      if (
        activeFlashSaleItem &&
        activeFlashSaleItem.flashSale &&
        activeFlashSaleItem.flashSale.isActive &&
        new Date(activeFlashSaleItem.flashSale.startTime) <= new Date() &&
        new Date(activeFlashSaleItem.flashSale.endTime) >= new Date() &&
        activeFlashSaleItem.salePrice > 0 &&
        activeFlashSaleItem.salePrice < primary.price
      ) {
        finalOldPrice = primary.price;
        finalPrice = activeFlashSaleItem.salePrice;
      } else {
        if ((primary.price === 0 || primary.price == null) && primary.originalPrice > 0) {
          finalPrice = primary.originalPrice;
          finalOldPrice = null;
        } else if (primary.price > 0 && primary.originalPrice > primary.price) {
          finalPrice = primary.price;
          finalOldPrice = primary.originalPrice;
        } else {
          finalPrice = primary.price;
          finalOldPrice = null;
        }
      }

      // ✅ Tính discount giống bên ProductCard
  let discount = null;

const parsedFinal = parseFloat(finalPrice);
const parsedOriginal = parseFloat(primary.originalPrice);
const parsedOld = parseFloat(finalOldPrice);

if (!isNaN(parsedFinal) && parsedFinal > 0) {
  let comparePrice = null;

  if (!isNaN(parsedOriginal) && parsedOriginal > parsedFinal) {
    comparePrice = parsedOriginal;
  } else if (!isNaN(parsedOld) && parsedOld > parsedFinal) {
    comparePrice = parsedOld;
  }

  if (!isNaN(comparePrice) && comparePrice > 0) {
    const raw = ((comparePrice - parsedFinal) / comparePrice) * 100;
    if (!isNaN(raw) && isFinite(raw)) {
      discount = Math.min(99, Math.max(1, Math.round(raw)));
    }
  }
}


      return {
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        thumbnail: prod.thumbnail,
        badge: prod.badge,
        image: primary.ProductMedia?.[0]?.mediaUrl || prod.thumbnail,
        price: finalPrice,
        oldPrice: finalOldPrice,
        originalPrice: primary.originalPrice,
        discount,
        inStock: totalStock > 0,
        skus
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

    const now = new Date();

    const products = await Product.findAll({
      where: whereClause,
      attributes: ["id", "name", "slug", "thumbnail", "badge"], // ✅ lấy badge từ bảng products
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Sku,
          as: "skus",
          attributes: ["price", "originalPrice", "id"],
          include: [
            {
              model: FlashSaleItem,
               as: "flashSaleSkus", // ✅ ĐÚNG ALIAS
              required: false,
              include: [
                {
                  model: FlashSale,
                  as: "flashSale",
                  required: true,
                 where: {
  startTime: { [Op.lte]: now },
  endTime: { [Op.gte]: now }
}

                },
              ],
            },
          ],
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
      const bestSku = validSkus.reduce((min, s) => {
        const flashPrice = s.flashSaleItem?.price ?? s.price;
        return flashPrice < (min.flashSaleItem?.price ?? min.price) ? s : min;
      }, validSkus[0]);

      const hasFlash = !!bestSku.flashSaleItem;
      const flashPrice = bestSku.flashSaleItem?.price;
      const regularPrice = bestSku.price;
      const originalPrice = bestSku.originalPrice;

      finalPrice = hasFlash ? flashPrice : regularPrice;
      finalOldPrice = originalPrice > finalPrice ? originalPrice : null;

    let discount = null;
const parsedOld = parseFloat(finalOldPrice);
const parsedNew = parseFloat(finalPrice);

if (
  !isNaN(parsedOld) &&
  !isNaN(parsedNew) &&
  parsedOld > parsedNew &&
  parsedOld > 0
) {
  discount = Math.round(((parsedOld - parsedNew) / parsedOld) * 100);
}

    }
  }

  return {
    id: productJson.id,
    name: productJson.name,
    slug: productJson.slug,
    image: productJson.thumbnail,
    price: finalPrice,
    oldPrice: finalOldPrice,
    discount,
    badge: productJson.badge || null,
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
