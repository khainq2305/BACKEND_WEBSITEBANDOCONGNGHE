const axios = require("axios");
const cosineSimilarity = require("cosine-similarity");
const db = require("../../models");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { Op, fn, col, literal, Sequelize } = require("sequelize");
const { processSkuPrices } = require("../../helpers/priceHelper");
const {
  Product,
  Sku,
  Category,
  Brand,
  ProductMedia,
  FlashSale,
  FlashSaleItem,
  FlashSaleCategory,
  SearchHistory,
  Review,
} = db;

exports.searchByImage = async (req, res) => {
  const t0 = Date.now();
  const log = (...a) => console.log("[image-search]", ...a);

  try {
    const filePath = req.file?.path;
    if (!filePath)
      return res.status(400).json({ message: "Thiếu ảnh để tìm kiếm!" });

    // ----- build form-data
    const formData = new FormData();
    if (!/^https?:\/\//i.test(filePath)) {
      const abs = path.resolve(filePath);
      if (!fs.existsSync(abs)) {
        return res
          .status(400)
          .json({ message: "Không tìm thấy file ảnh upload." });
      }
      formData.append("image", fs.createReadStream(abs));
    } else {
      const img = await axios.get(filePath, {
        responseType: "arraybuffer",
        timeout: 30000,
      });
      const ct = img.headers["content-type"] || "image/jpeg";
      formData.append("image", Buffer.from(img.data), {
        filename: "image",
        contentType: ct,
      });
    }

    // ----- call Flask
    const baseUrl = (process.env.FLASK_BASE_URL || "http://127.0.0.1:8000")
      .trim()
      .replace(/\/$/, "");

    const resp = await axios.post(`${baseUrl}/embed`, formData, {
      headers: {
        ...formData.getHeaders(),
        "User-Agent": "image-search/1.0",
        Accept: "application/json",
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 90000,
      validateStatus: () => true,
    });

    if (resp.status !== 200) {
      return res.status(resp.status).json({
        message: `Flask trả về status ${resp.status}`,
        preview: JSON.stringify(resp.data)?.slice(0, 200),
      });
    }

    const queryEmbedding = resp.data?.vector;
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length < 100) {
      return res.status(500).json({
        message: "Không nhận được vector hợp lệ từ Flask hoặc vector quá ngắn.",
      });
    }

    // ====== business ======
    const ensureDiscount = (
      price,
      originalPrice,
      discountAmount,
      discountPercent
    ) => {
      const p = Number(price) || 0;
      const op = Number(originalPrice) || 0;
      let amt = Number(discountAmount) || 0;
      let pct = Number(discountPercent) || 0;
      if ((!pct || pct <= 0) && op > 0 && p > 0 && p < op)
        pct = Math.round(((op - p) / op) * 100);
      if ((!amt || amt <= 0) && op > 0 && p > 0 && p < op) amt = op - p;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      if (amt < 0) amt = 0;
      return { discountAmount: amt, discountPercent: pct };
    };

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
          as: "flashSaleItems",
          required: false,
          attributes: ["id", "skuId", "salePrice", "quantity", "maxPerUser"],
          include: [
            {
              model: Sku,
              as: "sku",
              attributes: [
                "id",
                "skuCode",
                "price",
                "originalPrice",
                "stock",
                "productId",
              ],
              include: [
                {
                  model: Product,
                  as: "product",
                  attributes: [
                    "id",
                    "name",
                    "slug",
                    "thumbnail",
                    "badge",
                    "badgeImage",
                    "categoryId",
                  ],
                },
              ],
            },
          ],
        },
        {
          model: FlashSaleCategory,
          as: "categories",
          required: false,
          include: [
            {
              model: FlashSale,
              as: "flashSale",
              attributes: ["endTime"],
            },
          ],
        },
      ],
    });

    const allActiveFlashSaleItemsMap = new Map();
    const allActiveCategoryDealsMap = new Map();
    allActiveFlashSales.forEach((sale) => {
      const saleEndTime = sale.endTime;
      const saleId = sale.id;
      (sale.flashSaleItems || []).forEach((fsi) => {
        const sku = fsi.sku;
        if (!sku) return;
        const skuId = sku.id;
        const salePrice = parseFloat(fsi.salePrice);
        const sold = 0;
        const limit = fsi.quantity;
        const soldOut = limit != null && sold >= limit;
        if (
          !allActiveFlashSaleItemsMap.has(skuId) ||
          (!soldOut &&
            salePrice < allActiveFlashSaleItemsMap.get(skuId).salePrice)
        ) {
          allActiveFlashSaleItemsMap.set(skuId, {
            salePrice,
            quantity: limit,
            soldQuantity: sold,
            maxPerUser: fsi.maxPerUser,
            flashSaleId: saleId,
            flashSaleEndTime: saleEndTime,
            isSoldOut: soldOut,
          });
        }
      });
      (sale.categories || []).forEach((fsc) => {
        const list = allActiveCategoryDealsMap.get(fsc.categoryId) || [];
        list.push({
          discountType: fsc.discountType,
          discountValue: fsc.discountValue,
          priority: fsc.priority,
          endTime: saleEndTime,
          flashSaleId: saleId,
          flashSaleCategoryId: fsc.id,
        });
        allActiveCategoryDealsMap.set(fsc.categoryId, list);
      });
    });

    const productsWithEmbeddings = await Product.findAll({
      where: { imageVector: { [Op.ne]: null } },
      attributes: [
        "id",
        "name",
        "slug",
        "thumbnail",
        "imageVector",
        "badge",
        "categoryId",
        "badgeImage",
        [
          Sequelize.fn("AVG", Sequelize.col("skus->reviews.rating")),
          "averageRating",
        ],
        [
          Sequelize.fn("COUNT", Sequelize.col("skus->reviews.id")),
          "reviewCount",
        ],
        [
          Sequelize.literal(`(
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM orderitems oi
        INNER JOIN orders o ON oi.orderId = o.id
        INNER JOIN skus s ON oi.skuId = s.id
        WHERE s.productId = Product.id
          AND o.status IN ('completed','delivered')
      )`),
          "deliveredOrderCount",
        ],
      ],
      include: [
        {
          model: Sku,
          as: "skus",
          attributes: ["id", "price", "originalPrice", "stock", "skuCode"],
          include: [
            {
              model: ProductMedia,
              as: "ProductMedia",
              attributes: ["mediaUrl"],
              separate: true,
              limit: 1,
            },
            {
              model: Review,
              as: "reviews", // <--- chỗ này gắn qua SKU
              attributes: [],
              required: false,
            },
          ],
        },
      ],
      group: ["Product.id", "skus.id"],
    });

    const scored = productsWithEmbeddings.map((p) => {
      const vector = JSON.parse(p.imageVector);
      const score = cosineSimilarity(queryEmbedding, vector);
      return { product: p, score };
    });

    const SIMILARITY_THRESHOLD = 0.8;
    const MAX_RESULTS = 10;

    const top = scored
      .filter((x) => x.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

    const results = top.map(({ product, score }) => {
      const skus = (product.skus || [])
        .map((sku) => {
          const helperInput = {
            ...sku.toJSON(),
            Product: { category: { id: product.categoryId } },
          };
          const price = processSkuPrices(
            helperInput,
            allActiveFlashSaleItemsMap,
            allActiveCategoryDealsMap
          );
          const finalPrice = Number(price.price) || Number(sku.price) || 0;
          const finalOriginal =
            Number(price.originalPrice) || Number(sku.originalPrice) || 0;
          const ensured = ensureDiscount(
            finalPrice,
            finalOriginal,
            price.discountAmount,
            price.discountPercent
          );
          return {
            ...sku.toJSON(),
            price: finalPrice,
            originalPrice: finalOriginal,
            flashSaleInfo: price.flashSaleInfo,
            hasDeal: price.hasDeal,
            discountAmount: ensured.discountAmount,
            discountPercent: ensured.discountPercent,
          };
        })
        .sort((a, b) => {
          const af = a.flashSaleInfo?.dealApplied;
          const bf = b.flashSaleInfo?.dealApplied;
          if (af && !bf) return -1;
          if (!af && bf) return 1;
          return (+a.price || 0) - (+b.price || 0);
        });

      const primary = skus[0] || {};
      const totalStock = (product.skus || []).reduce(
        (s, x) => s + (parseInt(x.stock, 10) || 0),
        0
      );
      const ensuredTop = ensureDiscount(
        primary.price,
        primary.originalPrice,
        primary.discountAmount,
        primary.discountPercent
      );

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        thumbnail: product.thumbnail,
        badge: product.badge,
        image: primary.ProductMedia?.[0]?.mediaUrl || product.thumbnail,
        badgeImage: product.badgeImage,
        price: primary.price,
        oldPrice: primary.originalPrice,
        originalPrice: primary.originalPrice,
        discount: ensuredTop.discountPercent,
        discountAmount: ensuredTop.discountAmount,
        skus,
        inStock: totalStock > 0,
        similarity: score.toFixed(4),
        rating: product.dataValues.averageRating || 0,
        reviewCount: product.dataValues.reviewCount || 0,
        deliveredOrderCount: product.dataValues.deliveredOrderCount || 0,
      };
    });

    return res.status(200).json({ similarProducts: results });
  } catch (err) {
    console.error("❌ Lỗi searchByImage:", err.code || err.message);
    if (axios.isAxiosError(err)) {
      if (err.response) {
        return res.status(500).json({
          message: `Lỗi từ Flask API (${err.response.status}): ${
            err.response.data?.error || JSON.stringify(err.response.data)
          }`,
        });
      }
      if (err.request) {
        return res
          .status(500)
          .json({ message: `Không kết nối được đến Flask API. (${err.code})` });
      }
      return res
        .status(500)
        .json({ message: `Lỗi cấu hình request: ${err.message}` });
    }
    return res.status(500).json({ message: "Lỗi server khi tìm kiếm ảnh." });
  }
};

exports.searchByName = async (req, res) => {
  try {
    const keyword = req.query.q?.trim();
    if (!keyword) {
      return res.status(400).json({ message: "Thiếu từ khoá tìm kiếm!" });
    }

    const now = new Date(); // Lấy thời gian hiện tại một lần

    // ===== Lấy toàn bộ FlashSale đang active =====
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
          as: "flashSaleItems",
          required: false,
          attributes: [
            "id",
            "flashSaleId",
            "skuId",
            "salePrice",
            "quantity",
            "maxPerUser",
            [
              Sequelize.literal(`(
                SELECT COALESCE(SUM(oi.quantity), 0)
                FROM orderitems oi
                INNER JOIN orders o ON oi.orderId = o.id
                WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                  AND oi.skuId = flashSaleItems.skuId
                  AND o.status IN ('completed', 'delivered')
              )`),
              "soldQuantityForFlashSaleItem",
            ],
          ],
          include: [
            {
              model: Sku,
              as: "sku",
              attributes: [
                "id",
                "skuCode",
                "price",
                "originalPrice",
                "stock",
                "productId",
              ],
              include: [
                { model: Product, as: "product", attributes: ["categoryId"] },
              ],
            },
          ],
        },
        {
          model: FlashSaleCategory,
          as: "categories",
          required: false,
          include: [
            {
              model: FlashSale,
              as: "flashSale",
              attributes: ["endTime"],
              required: false,
            },
          ],
        },
      ],
    });

    // ===== Map FlashSale Items & Category Deals =====
    const allActiveFlashSaleItemsMap = new Map();
    const allActiveCategoryDealsMap = new Map();

    allActiveFlashSales.forEach((saleEvent) => {
      const saleEndTime = saleEvent.endTime;
      const saleId = saleEvent.id;

      (saleEvent.flashSaleItems || []).forEach((fsi) => {
        const sku = fsi.sku;
        if (!sku) return;
        const skuId = sku.id;
        const flashItemSalePrice = parseFloat(fsi.salePrice);
        const soldForThisItem = parseInt(
          fsi.dataValues.soldQuantityForFlashSaleItem || 0
        );
        const flashLimit = fsi.quantity;

        const isSoldOutForThisItem =
          flashLimit != null && soldForThisItem >= flashLimit;

        if (
          !allActiveFlashSaleItemsMap.has(skuId) ||
          (!isSoldOutForThisItem &&
            flashItemSalePrice <
              allActiveFlashSaleItemsMap.get(skuId).salePrice)
        ) {
          allActiveFlashSaleItemsMap.set(skuId, {
            salePrice: flashItemSalePrice,
            quantity: flashLimit,
            soldQuantity: soldForThisItem,
            maxPerUser: fsi.maxPerUser,
            flashSaleId: saleId,
            flashSaleEndTime: saleEndTime,
            isSoldOut: isSoldOutForThisItem,
          });
        }
      });

      (saleEvent.categories || []).forEach((fsc) => {
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
          flashSaleCategoryId: fsc.id,
        });
      });
    });

    // ===== Tìm sản phẩm theo tên gần đúng =====
    const matchedProducts = await Product.findAll({
      where: {
        name: { [Op.like]: `%${keyword}%` },
        isActive: true,
      },
      attributes: [
        "id",
        "name",
        "slug",
        "thumbnail",
        "badge",
        "categoryId",
        "badgeImage",
        [
          Sequelize.fn("AVG", Sequelize.col("skus.reviews.rating")),
          "averageRating",
        ],
        [
          Sequelize.fn("COUNT", Sequelize.col("skus.reviews.id")),
          "reviewCount",
        ],
        [
          Sequelize.literal(`(
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM orderitems oi
        INNER JOIN orders o ON oi.orderId = o.id
        INNER JOIN skus s ON oi.skuId = s.id
        WHERE s.productId = Product.id
          AND o.status IN ('completed','delivered')
      )`),
          "deliveredOrderCount",
        ],
      ],
      include: [
        {
          model: Sku,
          as: "skus",
          attributes: ["id", "price", "originalPrice", "stock", "skuCode"],
          include: [
            {
              model: ProductMedia,
              as: "ProductMedia",
              attributes: ["mediaUrl"],
              separate: true,
              limit: 1,
            },
            {
              model: Review,
              as: "reviews", // alias phải trùng với define association
              attributes: [],
              required: false,
            },
          ],
        },
      ],
      group: ["Product.id", "skus.id"],
      subQuery: false, // ⭐ tránh Sequelize wrap subquery gây lỗi alias
      limit: 20,
    });

    // ===== Format kết quả =====
    const formattedResults = matchedProducts.map((product) => {
      const skus = (product.skus || [])
        .map((sku) => {
          const skuDataForHelper = {
            ...sku.toJSON(),
            Product: { category: { id: product.categoryId } },
          };
          const priceResults = processSkuPrices(
            skuDataForHelper,
            allActiveFlashSaleItemsMap,
            allActiveCategoryDealsMap
          );

          return {
            ...sku.toJSON(),
            price: priceResults.price,
            originalPrice: priceResults.originalPrice,
            flashSaleInfo: priceResults.flashSaleInfo,
            hasDeal: priceResults.hasDeal,
            discountAmount: priceResults.discountAmount,
            discountPercent: priceResults.discountPercent,
          };
        })
        .sort((a, b) => {
          const aHasActiveFS = a.flashSaleInfo?.dealApplied;
          const bHasActiveFS = b.flashSaleInfo?.dealApplied;
          if (aHasActiveFS && !bHasActiveFS) return -1;
          if (!aHasActiveFS && bHasActiveFS) return 1;
          return (+a.price || 0) - (+b.price || 0);
        });

      const primarySku = skus[0] || {};
      const totalStock = (product.skus || []).reduce(
        (s, x) => s + (parseInt(x.stock, 10) || 0),
        0
      );

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        thumbnail: product.thumbnail,
        badge: product.badge,
        image: primarySku.ProductMedia?.[0]?.mediaUrl || product.thumbnail,
        badgeImage: product.badgeImage,
        price: primarySku.price,
        oldPrice: primarySku.originalPrice,
        originalPrice: primarySku.originalPrice,
        discount: primarySku.discountPercent,
        discountAmount: primarySku.discountAmount,
        skus,
        inStock: totalStock > 0,
        similarity: null,
        // ⭐ Thêm các field này
        rating: product.dataValues.averageRating || 0,
        reviewCount: product.dataValues.reviewCount || 0,
        deliveredOrderCount: product.dataValues.deliveredOrderCount || 0,
      };
    });

    return res.status(200).json({ similarProducts: formattedResults });
  } catch (err) {
    console.error("❌ Lỗi searchByName:", err);
    return res
      .status(500)
      .json({ message: "Lỗi server khi tìm kiếm sản phẩm." });
  }
};

exports.getSuggestions = async (req, res) => {
  const query = req.query.q;

  if (!query || typeof query !== "string" || query.length < 2) {
    return res.status(200).json({ suggestions: [] });
  }

  const lowerCaseQuery = query.toLowerCase();
  const uniqueSuggestionsMap = new Map();

  try {
    const products = await Product.findAll({
      where: {
        name: { [Op.like]: `%${lowerCaseQuery}%` },
        isActive: true,
      },
      attributes: [
        "id",
        "name",
        "slug",
        "thumbnail",
        "badge",
        "categoryId",
        "badgeImage",
      ],
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
                  attributes: ["endTime", "id"],
                  required: false,
                  where: {
                    isActive: true,
                    startTime: { [Op.lte]: Sequelize.literal("NOW()") },
                    endTime: { [Op.gte]: Sequelize.literal("NOW()") },
                  },
                },
              ],
            },
          ],
        },
      ],
      limit: 10,
      order: [
        [
          Sequelize.literal(
            `CASE WHEN name LIKE '${lowerCaseQuery}%' THEN 0 ELSE 1 END`
          ),
          "ASC",
        ],
        ["name", "ASC"],
      ],
    });

    const now = new Date();
    const activeCatDeals = await FlashSaleCategory.findAll({
      include: [
        {
          model: FlashSale,
          as: "flashSale",
          attributes: ["endTime", "id"],
          where: {
            isActive: true,
            startTime: { [Op.lte]: now },
            endTime: { [Op.gte]: now },
          },
        },
      ],
    });

    const allActiveFlashSaleItemsMap = new Map();
    const allActiveCategoryDealsMap = new Map();

    // Chuẩn bị dữ liệu cho hàm processSkuPrices
    products.forEach(product => {
      product.skus.forEach(sku => {
        if (sku.flashSaleSkus && sku.flashSaleSkus.length > 0) {
          allActiveFlashSaleItemsMap.set(sku.id, sku.flashSaleSkus.map(item => ({
            ...item.get(),
            flashSaleEndTime: item.flashSale.endTime,
            flashSaleId: item.flashSale.id
          })));
        }
      });
    });

    activeCatDeals.forEach(deal => {
      if (!allActiveCategoryDealsMap.has(deal.categoryId)) {
        allActiveCategoryDealsMap.set(deal.categoryId, []);
      }
      allActiveCategoryDealsMap.get(deal.categoryId).push({
        ...deal.get(),
        endTime: deal.flashSale.endTime,
        flashSaleId: deal.flashSale.id
      });
    });

    // Format dữ liệu sản phẩm bằng cách gọi hàm processSkuPrices
    products.forEach((product) => {
      const primarySku = (product.skus || []).sort((a, b) => {
        const aFS = a.flashSaleSkus?.length > 0;
        const bFS = b.flashSaleSkus?.length > 0;
        if (aFS && !bFS) return -1;
        if (!aFS && bFS) return 1;
        return (+a.price || 0) - (+b.price || 0);
      })[0];

      if (!primarySku) return;

      const processedPrice = processSkuPrices(
        {
          ...primarySku.get(),
          Product: { category: { id: product.categoryId } }
        },
        allActiveFlashSaleItemsMap,
        allActiveCategoryDealsMap
      );

      const formattedResult = {
        id: product.id,
        name: product.name,
        slug: product.slug,
        thumbnail: product.thumbnail,
        badge: product.badge,
        image: primarySku.ProductMedia?.[0]?.mediaUrl || product.thumbnail,
        badgeImage: product.badgeImage,
        price: processedPrice.price,
        oldPrice: processedPrice.originalPrice > processedPrice.price ? processedPrice.originalPrice : null,
        originalPrice: processedPrice.originalPrice,
        discount: processedPrice.discount,
        inStock: (product.skus || []).reduce(
          (s, x) => s + (parseInt(x.stock, 10) || 0),
          0
        ) > 0,
      };

      if (!uniqueSuggestionsMap.has(formattedResult.name.toLowerCase())) {
        uniqueSuggestionsMap.set(
          formattedResult.name.toLowerCase(),
          formattedResult
        );
      }
    });
  } catch (error) {
    console.error("Lỗi khi lấy gợi ý từ Product:", error);
  }

  // Giữ lại phần xử lý gợi ý từ danh mục và thương hiệu
  try {
    const categories = await Category.findAll({
      where: {
        name: { [Op.like]: `%${lowerCaseQuery}%` },
        isActive: true,
      },
      attributes: ["name", "slug"],
      limit: 5,
    });
    categories.forEach((c) => {
      if (!uniqueSuggestionsMap.has(c.name.toLowerCase())) {
        uniqueSuggestionsMap.set(c.name.toLowerCase(), {
          // id: `cat-${c.id}`, // Không có id trong thuộc tính
          name: c.name,
          type: "category",
          slug: c.slug,
        });
      }
    });
  } catch (error) {
    console.error("Lỗi khi lấy gợi ý từ Category:", error);
  }

  try {
    const brands = await Brand.findAll({
      where: {
        name: { [Op.like]: `%${lowerCaseQuery}%` },
        isActive: true,
      },
      attributes: ["name"],
      limit: 5,
    });
    brands.forEach((b) => {
      if (!uniqueSuggestionsMap.has(b.name.toLowerCase())) {
        uniqueSuggestionsMap.set(b.name.toLowerCase(), {
          // id: `brand-${b.id}`, // Không có id trong thuộc tính
          name: b.name,
          type: "brand",
        });
      }
    });
  } catch (error) {
    console.error("Lỗi khi lấy gợi ý từ Brand:", error);
  }

  const finalSuggestions = Array.from(uniqueSuggestionsMap.values());
  finalSuggestions.sort((a, b) => {
    const aStartsWith = a.name.toLowerCase().startsWith(lowerCaseQuery);
    const bStartsWith = b.name.toLowerCase().startsWith(lowerCaseQuery);

    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;

    // Giả định `type` của sản phẩm là `undefined` hoặc khác với `category` và `brand`
    if (!a.type && b.type) return -1;
    if (a.type && !b.type) return 1;

    return a.name.localeCompare(b.name);
  });

  return res.status(200).json({ suggestions: finalSuggestions.slice(0, 5) });
};

exports.getSearchHistory = async (req, res) => {
  // Lấy userId trực tiếp từ req.user (được gán bởi checkJWT)
  const userId = req.user?.id; // Sử dụng optional chaining để an toàn

  if (!userId) {
    // Nếu không có userId (người dùng chưa đăng nhập hoặc token không hợp lệ)
    return res
      .status(401)
      .json({ message: "Vui lòng đăng nhập để xem lịch sử tìm kiếm." });
  }

  try {
    const history = await SearchHistory.findAll({
      attributes: ["id", "keyword", "createdAt"],
      where: { userId: userId }, // Chỉ lọc theo userId
      order: [["createdAt", "DESC"]],
      limit: 10, // Giới hạn số lượng mục lịch sử hiển thị
    });

    // Lọc các từ khóa trùng lặp, chỉ giữ lại bản ghi mới nhất cho mỗi từ khóa
    const uniqueHistoryMap = new Map();
    history.forEach((item) => {
      if (!uniqueHistoryMap.has(item.keyword.toLowerCase())) {
        uniqueHistoryMap.set(item.keyword.toLowerCase(), item);
      }
    });

    const uniqueHistory = Array.from(uniqueHistoryMap.values());
    // Sắp xếp lại theo thời gian tạo để các mục mới nhất vẫn ở trên
    uniqueHistory.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return res.status(200).json({ history: uniqueHistory });
  } catch (error) {
    console.error("❌ Lỗi khi lấy lịch sử tìm kiếm:", error);
    return res
      .status(500)
      .json({ message: "Lỗi server khi lấy lịch sử tìm kiếm." });
  }
};

exports.addSearchHistory = async (req, res) => {
  const { keyword } = req.body;
  // Lấy userId trực tiếp từ req.user (được gán bởi checkJWT)
  const userId = req.user?.id; // Sử dụng optional chaining để an toàn

  if (!userId) {
    // Nếu không có userId, không được phép thêm vào lịch sử
    return res
      .status(401)
      .json({ message: "Vui lòng đăng nhập để thêm vào lịch sử tìm kiếm." });
  }

  if (!keyword || typeof keyword !== "string" || keyword.trim() === "") {
    return res.status(400).json({ message: "Từ khóa không hợp lệ." });
  }

  const trimmedKeyword = keyword.trim();

  try {
    // Xóa các bản ghi cũ hơn của cùng một từ khóa và người dùng
    // Điều này giúp tránh trùng lặp và giữ lịch sử gọn gàng
    await SearchHistory.destroy({
      where: {
        keyword: trimmedKeyword,
        userId: userId,
      },
    });

    // Thêm bản ghi mới
    await SearchHistory.create({
      keyword: trimmedKeyword,
      userId: userId, // Chỉ lưu userId
    });

    return res.status(201).json({ message: "Đã thêm vào lịch sử tìm kiếm." });
  } catch (error) {
    console.error("❌ Lỗi khi thêm vào lịch sử tìm kiếm:", error);
    return res
      .status(500)
      .json({ message: "Lỗi server khi thêm vào lịch sử tìm kiếm." });
  }
};

exports.deleteSearchHistoryItem = async (req, res) => {
  const { id } = req.params; // ID của mục lịch sử cần xóa
  // Lấy userId trực tiếp từ req.user (được gán bởi checkJWT)
  const userId = req.user?.id; // Sử dụng optional chaining để an toàn

  if (!userId) {
    // Nếu không có userId, không được phép xóa
    return res
      .status(401)
      .json({ message: "Vui lòng đăng nhập để xóa lịch sử tìm kiếm." });
  }

  try {
    const deletedRows = await SearchHistory.destroy({
      where: {
        id: id,
        userId: userId, // Đảm bảo chỉ xóa mục của chính người dùng đó
      },
    });

    if (deletedRows > 0) {
      return res.status(200).json({ message: "Đã xóa mục lịch sử tìm kiếm." });
    } else {
      return res.status(404).json({
        message: "Không tìm thấy mục lịch sử hoặc không có quyền xóa.",
      });
    }
  } catch (error) {
    console.error("❌ Lỗi khi xóa mục lịch sử tìm kiếm:", error);
    return res
      .status(500)
      .json({ message: "Lỗi server khi xóa mục lịch sử tìm kiếm." });
  }
};
