const {
    ProductView,
    Product,
    Category,
    FlashSaleCategory,
    Brand,
    Review,
    Sku,
    FlashSaleItem,
    FlashSale,
    Order,
    OrderItem,
    ProductMedia // Đảm bảo đã import
} = require("../../models");
const { Op, fn, col, Sequelize } = require("sequelize");
const { literal } = Sequelize;

// Import the helper function
const { processSkuPrices } = require('../../helpers/priceHelper'); // Điều chỉnh đường dẫn nếu cần

class ProductViewController {
    static async addView(req, res) {
        try {
            const { productId } = req.body;

            if (!productId) {
                return res.status(400).json({ message: 'Thiếu productId' });
            }

            if (!req.user || !req.user.id) {
                return res.status(403).json({ message: 'Cần đăng nhập để ghi nhận lượt xem' });
            }

            await ProductView.create({
                userId: req.user.id,
                productId,
            });

            return res.status(201).json({ message: 'Đã ghi nhận lượt xem' });
        } catch (err) {
            console.error('Lỗi khi thêm lượt xem:', err);
            res.status(500).json({ message: 'Lỗi server' });
        }
    }

    static async getByIds(req, res) {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) || !ids.length) {
                return res.status(400).json({ message: "Danh sách ids không hợp lệ" });
            }

            const now = new Date();

            // LẤY TẤT CẢ DỮ LIỆU FLASH SALE ĐANG HOẠT ĐỘNG TRƯỚC VỚI CÁC THÔNG TIN CẦN THIẾT
            const allActiveFlashSales = await FlashSale.findAll({
                where: {
                    isActive: true,
                    deletedAt: null,
                    startTime: { [Op.lte]: now },
                    endTime: { [Op.gte]: now },
                },
                include: [
                    {
                        model: FlashSaleItem,
                        as: 'flashSaleItems',
                        required: false,
                        // === ĐIỀU CHỈNH QUAN TRỌNG TẠI ĐÂY ===
                        attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser',
                            [
                                // Tính soldQuantity cụ thể cho FlashSaleItem này
                                Sequelize.literal(`(
                                    SELECT COALESCE(SUM(oi.quantity), 0)
                                    FROM orderitems oi
                                    INNER JOIN orders o ON oi.orderId = o.id
                                    WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                                    AND oi.skuId = flashSaleItems.skuId
                                    AND o.status IN ('completed', 'delivered')
                                )`),
                                'soldQuantityForFlashSaleItem' // Đặt tên alias rõ ràng
                            ]
                        ],
                        // ======================================
                        include: [{
                            model: Sku,
                            as: 'sku',
                            attributes: ['id', 'skuCode', 'price', 'originalPrice', 'stock', 'productId'],
                            include: [
                                { model: Product, as: 'product', attributes: ['categoryId'] } // Cần categoryId của Product
                            ]
                        }],
                    },
                    {
                        model: FlashSaleCategory,
                        as: 'categories',
                        required: false,
                        include: [{
                            model: FlashSale,
                            as: 'flashSale',
                            attributes: ['endTime'],
                            required: false
                        }]
                    }
                ]
            });

            const allActiveFlashSaleItemsMap = new Map();
            const allActiveCategoryDealsMap = new Map();

            allActiveFlashSales.forEach(saleEvent => {
                const saleEndTime = saleEvent.endTime;
                const saleId = saleEvent.id;

                (saleEvent.flashSaleItems || []).forEach(fsi => {
                    const sku = fsi.sku;
                    if (!sku) return;
                    const skuId = sku.id;
                    const flashItemSalePrice = parseFloat(fsi.salePrice);
                    // Lấy soldQuantity đã được tính từ truy vấn
                    const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0); 
                    const flashLimit = fsi.quantity;

                    // Kiểm tra xem FlashSaleItem này đã hết suất chưa
                    const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

                    // Chỉ xem xét FlashSaleItem nếu nó chưa hết suất
                    if (!isSoldOutForThisItem) {
                        // So sánh để tìm FlashSaleItem có giá thấp nhất cho SKU này trên toàn hệ thống
                        if (!allActiveFlashSaleItemsMap.has(skuId) || flashItemSalePrice < allActiveFlashSaleItemsMap.get(skuId).salePrice) {
                            allActiveFlashSaleItemsMap.set(skuId, {
                                salePrice: flashItemSalePrice,
                                quantity: flashLimit,
                                soldQuantity: soldForThisItem, // Truyền soldQuantity vào map
                                maxPerUser: fsi.maxPerUser,
                                flashSaleId: saleId,
                                flashSaleEndTime: saleEndTime
                            });
                        }
                    }
                });

                (saleEvent.categories || []).forEach(fsc => {
                    const categoryId = fsc.categoryId;
                    if (!allActiveCategoryDealsMap.has(categoryId)) {
                        allActiveCategoryDealsMap.set(categoryId, []);
                    }
                    allActiveCategoryDealsMap.get(categoryId).push({
                        discountType: fsc.discountType,
                        discountValue: fsc.discountValue,
                        priority: fsc.priority,
                        endTime: saleEndTime,
                        flashSaleId: saleId,
                        flashSaleCategoryId: fsc.id
                    });
                });
            });
            // HẾT PHẦN LẤY DỮ LIỆU FLASH SALE

            const products = await Product.findAll({
                where: { id: { [Op.in]: ids }, isActive: 1, deletedAt: null },
                attributes: ["id", "name", "slug", "thumbnail", "categoryId", "badge", "badgeImage"],
                include: [
                    { model: Brand, as: "brand", attributes: ["id", "name"] },
                    { model: Category, as: "category", attributes: ["id", "name"] },
                    {
                        model: Sku,
                        as: "skus",
                        attributes: ["id", "price", "originalPrice", "stock", "productId"], // Ensure productId and originalPrice are selected
                        include: [
                            {
                                model: Review,
                                as: "reviews",
                                attributes: ["rating"],
                                required: false,
                            },
                            {
                                model: OrderItem,
                                as: "OrderItems",
                                required: false,
                                attributes: ["quantity"],
                                include: [
                                    {
                                        model: Order,
                                        as: "order",
                                        attributes: [],
                                        required: true,
                                        where: {
                                            status: { [Op.in]: ["delivered", "completed"] },
                                        },
                                    },
                                ],
                            },
                            { model: ProductMedia, as: 'ProductMedia', attributes: ['mediaUrl', 'type', 'sortOrder'], required: false }
                        ],
                    },
                ],
            });

            const result = ids
                .map((id) => products.find((p) => p.id === id))
                .filter(Boolean)
                .map((p) => {
                    const pj = p.toJSON();
                    const skus = pj.skus || [];

                    // Calculate rating
                    let ratingSum = 0;
                    let ratingCount = 0;
                    skus.forEach((sku) => {
                        (sku.reviews || []).forEach((rv) => {
                            const val = Number(rv.rating);
                            if (val > 0) {
                                ratingSum += val;
                                ratingCount += 1;
                            }
                        });
                    });
                    const rating = ratingCount > 0 ? +(ratingSum / ratingCount).toFixed(1) : 0;

                    // Calculate soldCount
                    const soldCount = skus.reduce((total, sku) => {
                        const qty = sku.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0;
                        return total + qty;
                    }, 0);

                    // Process SKUs using the helper and find the best price for the product level
                    let productPrice = 0;
                    let productOriginalPrice = 0;
                    let productFlashSaleInfo = null;
                    let productDiscount = 0;
                    let productInStock = false;

                    const processedSkus = skus.map(sku => {
                        const skuDataWithCategory = {
                            ...sku,
                            Product: { category: { id: pj.categoryId } } // Attach category for helper
                        };
                        return processSkuPrices(skuDataWithCategory, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);
                    });

                    // Sort processed SKUs by effective price to find the "best" one for product display
                    processedSkus.sort((a, b) => a.price - b.price);

                    const bestSku = processedSkus[0]; // The SKU with the lowest effective price

                    if (bestSku) {
                        productPrice = bestSku.price;
                        productOriginalPrice = bestSku.originalPrice; // Use originalPrice from the bestSku
                        productFlashSaleInfo = bestSku.flashSaleInfo;
                        productDiscount = bestSku.discount;
                    }

                    // Determine overall product stock
                    productInStock = skus.some(s => (s.stock || 0) > 0);


                    return {
                        id: pj.id,
                        name: pj.name,
                        slug: pj.slug,
                        thumbnail: pj.thumbnail,
                        brand: pj.brand,
                        category: pj.category,
                        price: productPrice,
                        originalPrice: productOriginalPrice, // This will be the original price of the best SKU
                        inStock: productInStock,
                        flashSaleInfo: productFlashSaleInfo,
                        badge: pj.badge,
                        badgeImage: pj.badgeImage,
                        rating,
                        soldCount,
                        discount: productDiscount, // Discount percentage for the best price
                    };
                });

            // Sort the final result based on the order of IDs provided in the request
            const orderedResult = ids.map(id => result.find(p => p.id === id)).filter(Boolean);

            return res.json({ products: orderedResult });
        } catch (err) {
            console.error("Lỗi getByIds:", err);
            return res.status(500).json({ message: "Lỗi server" });
        }
    }
    // Thêm hàm này vào class ProductViewController của bạn
static async getRecentlyViewedByCategoryLevel1(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(403).json({ message: 'Cần đăng nhập để lấy sản phẩm đã xem gần đây.' });
    }

    const categoryId = parseInt(req.query.categoryId, 10);
    const userId = req.user.id;

    if (!categoryId) {
      return res.status(400).json({ message: 'Thiếu categoryId.' });
    }

    const targetCategory = await Category.findByPk(categoryId);
    if (!targetCategory) {
      return res.status(404).json({ message: 'Danh mục không tồn tại.' });
    }

    let rootCategoryId = categoryId;
    if (targetCategory.parentId !== null) {
      const parentCategory = await Category.findByPk(targetCategory.parentId);
      if (parentCategory && parentCategory.parentId === null) {
        rootCategoryId = parentCategory.id;
      } else {
        return res.status(400).json({ message: 'categoryId không phải là danh mục cấp 1 hoặc không tìm thấy danh mục cấp 1 tương ứng.' });
      }
    }

    const allCategoryIdsInLevel1 = [rootCategoryId];
    const subCategories = await Category.findAll({
      where: { parentId: rootCategoryId },
      attributes: ['id']
    });
    subCategories.forEach(cat => allCategoryIdsInLevel1.push(cat.id));

    const allViews = await ProductView.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      include: [{
        model: Product,
        as: 'product',
        attributes: ['id', 'name', 'slug', 'thumbnail', 'categoryId', 'badge', 'badgeImage', 'brandId', 'isActive', 'deletedAt'],
        include: [
          { model: Brand, as: "brand", attributes: ["id", "name"] },
          { model: Category, as: "category", attributes: ["id", "name"] },
          {
            model: Sku,
            as: "skus",
            attributes: ["id", "price", "originalPrice", "stock", "productId"],
            include: [
              { model: Review, as: "reviews", attributes: ["rating"], required: false },
              {
                model: OrderItem,
                as: "OrderItems",
                attributes: ["quantity"],
                include: [{
                  model: Order,
                  as: "order",
                  attributes: [],
                  required: true,
                  where: { status: { [Op.in]: ["delivered", "completed"] } },
                }],
                required: false,
              },
              { model: ProductMedia, as: 'ProductMedia', attributes: ['mediaUrl', 'type', 'sortOrder'], required: false }
            ]
          }
        ]
      }]
    });

    const latestView = allViews.find(v => {
      const p = v.product;
      return p &&
        allCategoryIdsInLevel1.includes(p.categoryId) &&
        p.isActive === true &&
        p.deletedAt === null;
    });

    if (!latestView || !latestView.product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm đã xem gần đây trong danh mục này.' });
    }

    const product = latestView.product.toJSON();
    const skus = product.skus || [];

    const now = new Date();
    const allActiveFlashSales = await FlashSale.findAll({
      where: {
        isActive: true,
        deletedAt: null,
        startTime: { [Op.lte]: now },
        endTime: { [Op.gte]: now },
      },
      include: [
        {
          model: FlashSaleItem,
          as: 'flashSaleItems',
          required: false,
          attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser',
            [
              Sequelize.literal(`(
                SELECT COALESCE(SUM(oi.quantity), 0)
                FROM orderitems oi
                INNER JOIN orders o ON oi.orderId = o.id
                WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                AND oi.skuId = flashSaleItems.skuId
                AND o.status IN ('completed', 'delivered')
              )`),
              'soldQuantityForFlashSaleItem'
            ]
          ],
          include: [{
            model: Sku,
            as: 'sku',
            attributes: ['id', 'skuCode', 'price', 'originalPrice', 'stock', 'productId'],
            include: [
              { model: Product, as: 'product', attributes: ['categoryId'] }
            ]
          }]
        },
        {
          model: FlashSaleCategory,
          as: 'categories',
          required: false,
          include: [{
            model: FlashSale,
            as: 'flashSale',
            attributes: ['endTime'],
            required: false
          }]
        }
      ]
    });

    const allActiveFlashSaleItemsMap = new Map();
    const allActiveCategoryDealsMap = new Map();

    allActiveFlashSales.forEach(saleEvent => {
      const saleEndTime = saleEvent.endTime;
      const saleId = saleEvent.id;

      (saleEvent.flashSaleItems || []).forEach(fsi => {
        const sku = fsi.sku;
        if (!sku) return;
        const skuId = sku.id;
        const flashItemSalePrice = parseFloat(fsi.salePrice);
        const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0);
        const flashLimit = fsi.quantity;
        const isSoldOut = flashLimit != null && soldForThisItem >= flashLimit;

        if (!isSoldOut) {
          if (!allActiveFlashSaleItemsMap.has(skuId) || flashItemSalePrice < allActiveFlashSaleItemsMap.get(skuId).salePrice) {
            allActiveFlashSaleItemsMap.set(skuId, {
              salePrice: flashItemSalePrice,
              quantity: flashLimit,
              soldQuantity: soldForThisItem,
              maxPerUser: fsi.maxPerUser,
              flashSaleId: saleId,
              flashSaleEndTime: saleEndTime
            });
          }
        }
      });

      (saleEvent.categories || []).forEach(fsc => {
        const categoryId = fsc.categoryId;
        if (!allActiveCategoryDealsMap.has(categoryId)) {
          allActiveCategoryDealsMap.set(categoryId, []);
        }
        allActiveCategoryDealsMap.get(categoryId).push({
          discountType: fsc.discountType,
          discountValue: fsc.discountValue,
          priority: fsc.priority,
          endTime: saleEndTime,
          flashSaleId: saleId,
          flashSaleCategoryId: fsc.id
        });
      });
    });

    let ratingSum = 0;
    let ratingCount = 0;
    skus.forEach(sku => {
      (sku.reviews || []).forEach(rv => {
        const val = Number(rv.rating);
        if (val > 0) {
          ratingSum += val;
          ratingCount += 1;
        }
      });
    });
    const rating = ratingCount > 0 ? +(ratingSum / ratingCount).toFixed(1) : 0;

    const soldCount = skus.reduce((total, sku) => {
      const qty = sku.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0;
      return total + qty;
    }, 0);

    const processedSkus = skus.map(sku => {
      const skuDataWithCategory = {
        ...sku,
        Product: { category: { id: product.categoryId } }
      };
      return processSkuPrices(skuDataWithCategory, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);
    });

    processedSkus.sort((a, b) => a.price - b.price);

    const bestSku = processedSkus[0];
    let productPrice = 0;
    let productOriginalPrice = 0;
    let productFlashSaleInfo = null;
    let productDiscount = 0;
    let productInStock = skus.some(s => (s.stock || 0) > 0);

    if (bestSku) {
      productPrice = bestSku.price;
      productOriginalPrice = bestSku.originalPrice;
      productFlashSaleInfo = bestSku.flashSaleInfo;
      productDiscount = bestSku.discount;
    }

    const resultProduct = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      thumbnail: product.thumbnail,
      brand: product.brand,
      category: product.category,
      price: productPrice,
      originalPrice: productOriginalPrice,
      inStock: productInStock,
      flashSaleInfo: productFlashSaleInfo,
      badge: product.badge,
      badgeImage: product.badgeImage,
      rating,
      soldCount,
      discount: productDiscount,
    };

    return res.json({ product: resultProduct });

  } catch (err) {
    console.error("❌ Lỗi getRecentlyViewedByCategoryLevel1:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}


// Đảm bảo bạn đã import tất cả các models và Op từ Sequelize
// Ví dụ:
// const { Op } = require('sequelize');
// const Product = require('../models/Product');
// const Category = require('../models/Category');
// const Brand = require('../models/Brand');
// const Sku = require('../models/Sku');
// const ProductMedia = require('../models/ProductMedia');
// const FlashSale = require('../models/FlashSale');
// const FlashSaleItem = require('../models/FlashSaleItem');
// const FlashSaleCategory = require('../models/FlashSaleCategory');
// const { processSkuPrices } = require('../utils/priceProcessor'); // Hoặc hàm xử lý giá của bạn

static async searchForCompare(req, res) {
  try {
    const { keyword = '', limit = 20, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    const where = {
      isActive: 1,
      deletedAt: null,
    };

    if (keyword.trim()) {
      where.name = { [Op.like]: `%${keyword.trim()}%` };
    }

    const { rows, count } = await Product.findAndCountAll({
      where,
      attributes: ['id', 'name', 'slug', 'thumbnail', 'categoryId', 'createdAt'],
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'parentId'],
          include: [
            {
              model: Category,
              as: 'parentCategory',
              attributes: ['id', 'name'],
              required: false,
            }
          ]
        },
        {
          model: Brand,
          as: 'brand',
          attributes: ['id', 'name'],
        },
        {
          model: Sku,
          as: 'skus',
          attributes: ['id', 'price', 'originalPrice', 'stock', 'productId'],
          include: [
            {
              model: ProductMedia,
              as: 'ProductMedia',
              attributes: ['mediaUrl'],
              required: false,
              limit: 1
            }
          ]
        },
      ],
      limit: Number(limit),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
    });

    const now = new Date();
    const allActiveFlashSales = await FlashSale.findAll({
      where: {
        isActive: true,
        deletedAt: null,
        startTime: { [Op.lte]: now },
        endTime: { [Op.gte]: now },
      },
      include: [
        {
          model: FlashSaleItem,
          as: 'flashSaleItems',
          required: false,
          attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser',
            [Sequelize.literal(`(
              SELECT COALESCE(SUM(oi.quantity), 0)
              FROM orderitems oi
              INNER JOIN orders o ON oi.orderId = o.id
              WHERE oi.flashSaleId = flashSaleItems.flashSaleId
              AND oi.skuId = flashSaleItems.skuId
              AND o.status IN ('completed', 'delivered')
            )`), 'soldQuantityForFlashSaleItem']
          ],
          include: [{ model: Sku, as: 'sku', attributes: ['id', 'productId', 'price', 'originalPrice'] }]
        },
        {
          model: FlashSaleCategory,
          as: 'categories',
          required: false,
          include: [{ model: FlashSale, as: 'flashSale', attributes: ['endTime'] }]
        }
      ]
    });

    const allActiveFlashSaleItemsMap = new Map();
    const allActiveCategoryDealsMap = new Map();

    allActiveFlashSales.forEach(saleEvent => {
      const saleEndTime = saleEvent.endTime;
      const saleId = saleEvent.id;

      (saleEvent.flashSaleItems || []).forEach(fsi => {
        const sku = fsi.sku;
        if (!sku) return;

        const flashItemSalePrice = parseFloat(fsi.salePrice);
        const soldQty = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0);
        const flashLimit = fsi.quantity;
        const isSoldOut = flashLimit != null && soldQty >= flashLimit;

        // ✅ BỎ FLASHSALE ITEM GIÁ <= 0
        if (!isSoldOut && flashItemSalePrice > 0) {
          if (
            !allActiveFlashSaleItemsMap.has(sku.id) ||
            flashItemSalePrice < allActiveFlashSaleItemsMap.get(sku.id).salePrice
          ) {
            allActiveFlashSaleItemsMap.set(sku.id, {
              salePrice: flashItemSalePrice,
              quantity: flashLimit,
              soldQuantity: soldQty,
              maxPerUser: fsi.maxPerUser,
              flashSaleId: saleId,
              flashSaleEndTime: saleEndTime
            });
          }
        }
      });

      (saleEvent.categories || []).forEach(fsc => {
        const categoryId = fsc.categoryId;
        if (!allActiveCategoryDealsMap.has(categoryId)) {
          allActiveCategoryDealsMap.set(categoryId, []);
        }
        allActiveCategoryDealsMap.get(categoryId).push({
          discountType: fsc.discountType,
          discountValue: fsc.discountValue,
          priority: fsc.priority,
          endTime: saleEndTime,
          flashSaleId: saleId,
          flashSaleCategoryId: fsc.id
        });
      });
    });

    const productsWithPrices = rows.map(product => {
      const pj = product.toJSON();
      const skus = pj.skus || [];

      let bestPrice = null;
      let bestOriginalPrice = null;
      let bestDiscount = null;
      let productThumbnail = pj.thumbnail;

      if (skus.length > 0) {
        const processedSkus = skus.map(sku => {
          const skuDataWithCategory = {
            ...sku,
            Product: { category: { id: pj.categoryId } }
          };
          return processSkuPrices(skuDataWithCategory, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);
        });

        processedSkus.sort((a, b) => a.price - b.price);

        const primarySku = processedSkus[0];
        if (primarySku) {
          bestPrice = primarySku.price;
          bestOriginalPrice = primarySku.originalPrice;
          bestDiscount = primarySku.discount;
          if (primarySku.ProductMedia && primarySku.ProductMedia.length > 0) {
            productThumbnail = primarySku.ProductMedia[0].mediaUrl;
          }
        }
      }

      const topLevelCategoryId = pj.category?.parentCategory?.id || pj.category?.id;
      const topLevelCategoryName = pj.category?.parentCategory?.name || pj.category?.name;

      return {
        id: pj.id,
        name: pj.name,
        slug: pj.slug,
        thumbnail: productThumbnail,
        price: bestPrice,
        originalPrice: bestOriginalPrice,
        discount: bestDiscount,
        category: {
          id: pj.category.id,
          name: pj.category.name,
          topLevelId: topLevelCategoryId,
          topLevelName: topLevelCategoryName
        }
      };
    });

    return res.json({
      total: count,
      page: Number(page),
      products: productsWithPrices,
    });
  } catch (err) {
    console.error('❌ Lỗi searchForCompare:', err);
    return res.status(500).json({ message: 'Lỗi server khi tìm kiếm sản phẩm.' });
  }
}



}

module.exports = ProductViewController;

