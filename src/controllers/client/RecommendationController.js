require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Op, fn, col, Sequelize } = require('sequelize');
const NodeCache = require('node-cache');

const {
    User,
    Product,
    ProductView,
    Order,
    OrderItem,
    Sku,
    Category,
    Brand,
    Review,
    FlashSaleItem,
    FlashSaleCategory,
    FlashSale,
    ProductMedia,
    SearchHistory,
    sequelize
} = require("../../models");

const { processSkuPrices } = require('../../helpers/priceHelper');
const { formatCurrencyVND } = require('../../utils/formatCurrency');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const GEMINI_MODEL = "gemini-1.5-flash";

const recommendationCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

class RecommendationController {

    static async recordProductView(userId, productId) {
        if (!ProductView || !User || !Product) {
            console.warn("WARN: [recordProductView] Required models (ProductView, User, Product) are not available. Skipping view recording.");
            return;
        }
        try {
            const [view, created] = await ProductView.findOrCreate({
                where: { userId: userId, productId: productId },
                defaults: {
                    userId: userId,
                    productId: productId,
                    viewCount: 1,
                    firstViewedAt: new Date(),
                    lastViewedAt: new Date()
                }
            });

            if (!created) {
                await view.increment('viewCount');
                view.lastViewedAt = new Date();
                await view.save();
            }
            console.log(`DEBUG: [recordProductView] User ${userId} viewed product ${productId}. View count: ${view.viewCount}.`);
        } catch (error) {
            console.error(`ERROR: [recordProductView] Lỗi khi ghi nhận lượt xem sản phẩm ${productId} của user ${userId}:`, error.message);
            console.error("ERROR Name:", error.name);
            console.error("ERROR Stack:", error.stack);
        }
    }

    static async _getUserRecentlyViewedProducts(userId, limit = 5) {
        if (!User || !Product || !ProductView || !Category || !Brand) {
            console.warn("WARN: [_getUserRecentlyViewedProducts] Required models missing.");
            return [];
        }
        try {
            const views = await ProductView.findAll({
                where: { userId: userId },
                attributes: ['id', 'userId', 'productId', 'viewCount', 'firstViewedAt', 'lastViewedAt', 'createdAt', 'updatedAt'],
                include: [{
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'description', 'categoryId', 'brandId', 'isActive'],
                    where: { isActive: true }, 
                    include: [
                        { model: Category, as: 'category', attributes: ['name'] },
                        { model: Brand, as: 'brand', attributes: ['name'] }
                    ],
                    paranoid: false
                }],
                order: [['lastViewedAt', 'DESC']],
                limit: limit,
                paranoid: false
            });
            const products = views.map(view => view.product).filter(p => p !== null);
            console.log(`DEBUG: [_getUserRecentlyViewedProducts] User ${userId} recently viewed: ${products.length} products. Names: ${products.map(p => p.name).join(', ')}`);
            return products;
        } catch (error) {
            console.error(`ERROR: [_getUserRecentlyViewedProducts] Lỗi khi lấy sản phẩm đã xem gần đây cho userId ${userId}:`, error.message);
            console.error("ERROR Name:", error.name);
            console.error("ERROR Stack:", error.stack);
            return [];
        }
    }

  static async _getUserPurchasedProducts(userId, limit = 5) {
    if (!User || !Order || !OrderItem || !Sku || !Product || !Category || !Brand || !sequelize) {
        console.warn("WARN: [_getUserPurchasedProducts] Required models or sequelize instance missing.");
        return [];
    }
    try {
        const queryResults = await sequelize.query(`
            SELECT
                P.id,
                P.name,
                P.description,
                P.categoryId,
                P.brandId,
                Cat.name AS category_name,
                B.name AS brand_name,
                MAX(O.createdAt) AS last_purchased_at
            FROM
                orders O
            JOIN
                orderitems OI ON O.id = OI.orderId
            JOIN
                skus S ON OI.skuId = S.id
            JOIN
                products P ON S.productId = P.id
            LEFT JOIN
                categories Cat ON P.categoryId = Cat.id
            LEFT JOIN
                brands B ON P.brandId = B.id
            WHERE
                O.userId = :userId AND O.status IN ('completed', 'delivered') AND P.deletedAt IS NULL AND P.isActive = TRUE
            GROUP BY P.id, P.name, P.description, P.categoryId, P.brandId, category_name, brand_name
            ORDER BY
                last_purchased_at DESC
            LIMIT :limit;
        `, {
            replacements: { userId: userId, limit: limit },
            type: sequelize.QueryTypes.SELECT
        });

        const products = Array.isArray(queryResults) ? queryResults : (queryResults ? [queryResults] : []);

        console.log(`DEBUG: [_getUserPurchasedProducts] User ${userId} purchased: ${products.length} unique products (RAW SQL). Names: ${products.map(p => p.name).join(', ')}`);
        return products.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            categoryId: row.categoryId,
            brandId: row.brandId,
            category: { name: row.category_name },
            brand: { name: row.brand_name }
        }));
    } catch (error) {
        console.error(`ERROR: [_getUserPurchasedProducts] Lỗi khi lấy sản phẩm đã mua cho userId ${userId} (SQL thuần):`, error.message);
        console.error("SQL Error Name:", error.name);
        console.error("SQL Error Stack:", error.stack);
        return [];
    }
}


    static async _getProductDetailsForGemini(productId) {
        if (!Product || !Category || !Brand) {
            console.warn("WARN: [_getProductDetailsForGemini] Required models missing.");
            return null;
        }
        try {
            const product = await Product.findByPk(productId, {
                attributes: ['id', 'name', 'description', 'categoryId', 'brandId', 'isActive'],
                where: { isActive: true }, 
                include: [
                    { model: Category, as: 'category', attributes: ['name'] },
                    { model: Brand, as: 'brand', attributes: ['name'] }
                ],
                paranoid: false
            });

            console.log(`DEBUG: [_getProductDetailsForGemini] Current Product (ID ${productId}): ${product ? product.name : 'Not Found'}`);
            return product;
        } catch (error) {
            console.error(`ERROR: [_getProductDetailsForGemini] Lỗi khi lấy chi tiết sản phẩm ${productId} cho Gemini:`, error.message);
            console.error("ERROR Name:", error.name);
            console.error("ERROR Stack:", error.stack);
            return null;
        }
    }

    static async _getUserSearchHistory(userId, limit = 5) {
        if (!SearchHistory) {
            console.warn("WARN: [_getUserSearchHistory] SearchHistory model is not available. Skipping search history retrieval.");
            return [];
        }
        try {
            const searchTerms = await SearchHistory.findAll({
                where: { userId: userId },
                attributes: ['keyword'],
                order: [['createdAt', 'DESC']],
                limit: limit,
                raw: true
            });
            const keywords = searchTerms.map(item => item.keyword);
            console.log(`DEBUG: [_getUserSearchHistory] User ${userId} recently searched: ${keywords.join(', ')}`);
            return keywords;
        } catch (error) {
            console.error(`ERROR: [_getUserSearchHistory] Lỗi khi lấy lịch sử tìm kiếm cho userId ${userId}:`, error.message);
            console.error("ERROR Name:", error.name);
            console.error("ERROR Stack:", error.stack);
            return [];
        }
    }

    static async _getUserDemographics(userId) {
        if (!User) {
            console.warn("WARN: [_getUserDemographics] User model is not available. Skipping demographic retrieval.");
            return { gender: null, age: null };
        }
        try {
            const user = await User.findByPk(userId, {
                attributes: ['gender', 'dateOfBirth'],
                paranoid: false
            });

            if (!user) {
                console.log(`DEBUG: [_getUserDemographics] User ${userId} not found.`);
                return { gender: null, age: null };
            }

            let age = null;
            if (user.dateOfBirth) {
                const today = new Date();
                const birthDate = new Date(user.dateOfBirth);

                if (isNaN(birthDate.getTime())) {
                    console.error(`ERROR: [_getUserDemographics] Invalid dateOfBirth for user ${userId}:`, user.dateOfBirth);
                    age = null;
                } else {
                    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
                    const m = today.getMonth() - birthDate.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                        calculatedAge--;
                    }
                    age = calculatedAge;
                }
            }

            console.log(`DEBUG: [_getUserDemographics] User ${userId} demographics: Gender: ${user.gender || 'N/A'}, Age: ${age || 'N/A'}`);
            return { gender: user.gender, age: age };
        } catch (error) {
            console.error(`ERROR: [_getUserDemographics] Lỗi khi lấy thông tin nhân khẩu học cho userId ${userId}:`, error.message);
            console.error("ERROR Name:", error.name);
            console.error("ERROR Stack:", error.stack);
            return { gender: null, age: null };
        }
    }

   static async _getRelatedProductsForPrompt(userId, currentProductId) {
    if (!Product || !Category || !Brand || !ProductView || !Order) {
        console.warn("WARN: [_getRelatedProductsForPrompt] Required models missing. Skipping related products retrieval.");
        return [];
    }

    const relatedIds = new Set();
    const relatedCategoryIds = new Set();
    const relatedBrandIds = new Set();

    const recentlyViewed = await RecommendationController._getUserRecentlyViewedProducts(userId, 5);
    recentlyViewed.forEach(p => {
        if (p.categoryId) relatedCategoryIds.add(p.categoryId);
        if (p.brandId) relatedBrandIds.add(p.brandId);
    });

    const purchasedProducts = await RecommendationController._getUserPurchasedProducts(userId, 5);
    purchasedProducts.forEach(p => {
        if (p.categoryId) relatedCategoryIds.add(p.categoryId);
        if (p.brandId) relatedBrandIds.add(p.brandId);
    });

    if (currentProductId) {
        const currentProduct = await Product.findByPk(currentProductId, { attributes: ['categoryId', 'brandId', 'isActive'], where: { isActive: true } });
        if (currentProduct) {
            if (currentProduct.categoryId) relatedCategoryIds.add(currentProduct.categoryId);
            if (currentProduct.brandId) relatedBrandIds.add(currentProduct.brandId);
        }
    }

    const excludedIds = new Set([
        ...recentlyViewed.map(p => p.id),
        ...purchasedProducts.map(p => p.id),
    ]);
    if (currentProductId) excludedIds.add(currentProductId);

    console.log(`DEBUG: [_getRelatedProductsForPrompt] Related Category IDs: ${Array.from(relatedCategoryIds).join(', ')}`);
    console.log(`DEBUG: [_getRelatedProductsForPrompt] Related Brand IDs: ${Array.from(relatedBrandIds).join(', ')}`);
    console.log(`DEBUG: [_getRelatedProductsForPrompt] Excluded Product IDs: ${Array.from(excludedIds).join(', ')}`);

    let relatedProducts = [];
    const limit = 50;

    const whereClause = {
        id: { [Op.notIn]: Array.from(excludedIds) },
        isActive: true, 
        [Op.or]: []
    };
    
    if (relatedCategoryIds.size > 0) {
        whereClause[Op.or].push({ categoryId: { [Op.in]: Array.from(relatedCategoryIds) } });
    }
    if (relatedBrandIds.size > 0) {
        whereClause[Op.or].push({ brandId: { [Op.in]: Array.from(relatedBrandIds) } });
    }

    if (relatedCategoryIds.size > 0 || relatedBrandIds.size > 0) {
        relatedProducts = await Product.findAll({
            where: whereClause,
            attributes: ['id', 'name', 'description'],
            order: [['createdAt', 'DESC']],
            limit: limit,
            paranoid: false
        });
    }

    if (relatedProducts.length === 0) {
        console.log("WARN: [_getRelatedProductsForPrompt] No related products found. Falling back to popular products.");
        relatedProducts = await Product.findAll({
            attributes: ['id', 'name', 'description'],
            where: { 
                id: { [Op.notIn]: Array.from(excludedIds) },
                isActive: true, 
            },
            order: [[sequelize.literal("(SELECT COUNT(*) FROM `orderitems` AS `oi` WHERE `oi`.`skuId` IN (SELECT `id` FROM `skus` WHERE `productId` = `product`.`id`))"), 'DESC']],
            limit: limit,
            paranoid: false
        });
    }
    
    console.log(`DEBUG: [_getRelatedProductsForPrompt] Found ${relatedProducts.length} related products for prompt.`);
    return relatedProducts;
}


    static async _buildGeminiRecommendationPrompt(userId, currentProductId = null) {
        let prompt = "Bạn là một chuyên gia gợi ý sản phẩm cho một trang thương mại điện tử. " +
            "Dựa trên lịch sử hành vi của người dùng và thông tin cá nhân, " +
            "hãy gợi ý 10 sản phẩm khác nhau mà người dùng có thể quan tâm.";

        const recentlyViewed = await RecommendationController._getUserRecentlyViewedProducts(userId, 5);
        const purchasedProducts = await RecommendationController._getUserPurchasedProducts(userId, 5);
        const searchHistory = await RecommendationController._getUserSearchHistory(userId, 5);
        const userDemographics = await RecommendationController._getUserDemographics(userId);
        const currentProduct = currentProductId ? await RecommendationController._getProductDetailsForGemini(currentProductId) : null;

        if (userDemographics.gender || userDemographics.age) {
            prompt += "\n\nThông tin cá nhân:";
            if (userDemographics.gender) {
                prompt += `\n- Giới tính: ${userDemographics.gender === 'male' ? 'Nam' : (userDemographics.gender === 'female' ? 'Nữ' : 'Khác')}`;
            }
            if (userDemographics.age) {
                prompt += `\n- Tuổi: ${userDemographics.age}`;
            }
        }

        if (currentProduct) {
            prompt += `\n\nNgười dùng đang xem: "${currentProduct.name}" (Danh mục: ${currentProduct.category?.name || 'không rõ'}, Thương hiệu: ${currentProduct.brand?.name || 'không rõ'}).`;
        }

        if (recentlyViewed.length > 0) {
            const productNames = recentlyViewed.map(p => `"${p.name}"`).join(', ');
            prompt += `\n\nLịch sử xem gần đây: ${productNames}.`;
        }

        if (purchasedProducts.length > 0) {
            const productNames = purchasedProducts.map(p => `"${p.name}"`).join(', ');
            prompt += `\n\nLịch sử đã mua: ${productNames}.`;
        }
        
        if (searchHistory.length > 0) {
            const keywords = searchHistory.map(k => `"${k}"`).join(', ');
            prompt += `\n\nLịch sử tìm kiếm: ${keywords}.`;
        }

        const productsForPrompt = await RecommendationController._getRelatedProductsForPrompt(userId, currentProductId);

        if (productsForPrompt.length > 0) {
            prompt += "\n\nDưới đây là danh sách sản phẩm trong kho. CHỈ GỢI Ý các sản phẩm CÓ TRONG DANH SÁCH NÀY. Mỗi sản phẩm kèm theo mô tả ngắn gọn:";
            productsForPrompt.forEach(p => {
                const shortDescription = p.description ? p.description.substring(0, 100) + '...' : 'không có';
                prompt += `\n- ID: ${p.id}, Tên: "${p.name}", Mô tả: "${shortDescription}"`;
            });
        }

        prompt += "\n\nHãy gợi ý 10 ID sản phẩm khác nhau. Chỉ trả về ID, mỗi ID trên một dòng.";

        
        console.log("DEBUG: [buildGeminiRecommendationPrompt] Final Gemini Prompt length (chars):", prompt.length);
        return prompt;
    }

  static async _getPopularProducts(limit = 10) {
  try {
    // 1) Lấy product ids kèm soldCount (theo đơn đã delivered/completed)
    const topRows = await Product.findAll({
      attributes: [
        'id',
        // tính tổng quantity của OrderItems qua relation skus -> OrderItems
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('skus.OrderItems.quantity')), 0), 'soldCount']
      ],
      where: { isActive: true },
      include: [
        {
          model: Sku,
          as: 'skus',
          attributes: [], // chỉ dùng để join cho SUM
          required: false,
          include: [
            {
              model: OrderItem,
              as: 'OrderItems',
              attributes: [],
              required: false,
              include: [
                {
                  model: Order,
                  as: 'order',
                  attributes: [],
                  where: { status: { [Op.in]: ['delivered', 'completed'] } },
                  required: true
                }
              ]
            }
          ]
        }
      ],
      group: ['Product.id'],
      order: [[sequelize.literal('soldCount'), 'DESC']],
      limit,
      subQuery: false,
      raw: true
    });

    const ids = (topRows || []).map(r => Number(r.id)).filter(Boolean);
    if (!ids || ids.length === 0) {
      console.log('DEBUG: [_getPopularProducts] Không tìm thấy product nào phổ biến.');
      return [];
    }

    // 2) Lấy full product details theo danh sách ids (giữ include giống cấu trúc ban đầu)
    const products = await Product.findAll({
      where: { id: ids },
      attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage', 'categoryId'],
      include: [
        {
          model: Sku,
          as: 'skus',
          attributes: ['id', 'price', 'originalPrice', 'stock'],
          required: false,
          include: [
            { model: ProductMedia, as: 'ProductMedia', attributes: ['mediaUrl', 'type'], separate: true, limit: 1 },
            {
              model: OrderItem,
              as: 'OrderItems',
              attributes: ['quantity'],
              required: false,
              include: [
                {
                  model: Order,
                  as: 'order',
                  attributes: [],
                  where: { status: { [Op.in]: ['delivered', 'completed'] } },
                  required: true
                }
              ]
            },
            { model: Review, as: 'reviews', attributes: ['rating'], required: false }
          ]
        },
        { model: Category, as: 'category', attributes: ['id', 'name'] },
        { model: Brand, as: 'brand', attributes: ['name'] }
      ],
      // giữ thứ tự theo ids (FIELD), asc vì ids đã theo thứ tự soldCount desc
      order: [[sequelize.literal(`FIELD(\`Product\`.\`id\`, ${ids.join(',')})`), 'ASC']],
      limit: ids.length,
      paranoid: false
    });

    console.log(`DEBUG: [_getPopularProducts] Found ${products.length} popular products (ids: ${ids.join(',')}).`);
    return products;
  } catch (error) {
    console.error('ERROR: [_getPopularProducts] Lỗi khi lấy sản phẩm phổ biến:', error.message);
    console.error('ERROR Name:', error.name);
    console.error('ERROR Stack:', error.stack);
    return [];
  }
}



    static async _getGeminiRecommendations(userId, currentProductId = null) {
    if (!genAI) {
        const fallbackProducts = await this._getPopularProducts(3);
        if (fallbackProducts.length > 0) {
            return await this._mapProductsToFrontendFormat(fallbackProducts);
        }
        return [];
    }

    const cacheKey = `gemini_recs_${userId}_${currentProductId || 'null'}`;
    const cachedRecommendations = recommendationCache.get(cacheKey);
    if (cachedRecommendations) {
        console.log(`DEBUG: [getGeminiRecommendations] Returning recommendations from cache for userId: ${userId}`);
        return cachedRecommendations;
    }

    let recommendedProductIds = [];
    try {
        const promptText = await RecommendationController._buildGeminiRecommendationPrompt(userId, currentProductId);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent(promptText);
        const response = await result.response;
        const text = (typeof response.text === 'function') ? response.text() : String(response);
        console.log("DEBUG: [getGeminiRecommendations] Raw Gemini Response Text:\n", text);

        // Robust parsing: extract first positive integer per non-empty line
        recommendedProductIds = text
            .split(/\r?\n/)
            .map(line => {
                const m = line.match(/\d+/);
                return m ? parseInt(m[0], 10) : NaN;
            })
            .filter(id => !Number.isNaN(id) && id > 0);

        // remove duplicates while preserving order
        recommendedProductIds = Array.from(new Set(recommendedProductIds));
        console.log("DEBUG: [getGeminiRecommendations] Recommended IDs from Gemini:", recommendedProductIds);
    } catch (error) {
        console.error("ERROR: [getGeminiRecommendations] Lỗi khi gọi Gemini API để tạo gợi ý:", error.response?.data || error.message);
        console.error("ERROR Name:", error.name);
        console.error("ERROR Stack:", error.stack);
        const fallbackProducts = await this._getPopularProducts(3);
        if (fallbackProducts.length > 0) {
            return await this._mapProductsToFrontendFormat(fallbackProducts);
        }
        return [];
    }

    let finalRecommendations = [];
    if (recommendedProductIds.length > 0) {
        try {
            const recommendedProductsFromDb = await Product.findAll({
                where: {
                    id: { [Op.in]: recommendedProductIds },
                    isActive: true
                },
                attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage', 'categoryId'],
                include: [
                    {
                        model: Sku,
                        as: 'skus',
                        attributes: ['id', 'skuCode', 'price', 'originalPrice', 'stock'],
                        required: false,
                        include: [
                            { model: ProductMedia, as: 'ProductMedia', attributes: ['mediaUrl', 'type'], separate: true, limit: 1 },
                            {
                                model: OrderItem,
                                as: 'OrderItems',
                                attributes: ['quantity'],
                                required: false,
                                include: [{ model: Order, as: 'order', attributes: [], where: { status: { [Op.in]: ['delivered', 'completed'] } }, required: true }]
                            },
                            { model: Review, as: 'reviews', attributes: ['rating'], required: false }
                        ],
                        paranoid: false
                    }
                ],
                paranoid: false
            });

            const mappedProducts = new Map(recommendedProductsFromDb.map(p => [p.id, p]));
            for (const id of recommendedProductIds) {
                const product = mappedProducts.get(id);
                if (product) {
                    finalRecommendations.push(product.toJSON());
                    console.log(`DEBUG: [getGeminiRecommendations] Mapped Gemini ID ${id} -> "${product.name}"`);
                } else {
                    console.warn(`WARN: [getGeminiRecommendations] Gemini suggested ID ${id} but not found in DB.`);
                }
            }
        } catch (dbErr) {
            console.error("ERROR: [getGeminiRecommendations] Lỗi khi truy vấn DB cho product IDs:", dbErr.message);
            console.error("ERROR Stack:", dbErr.stack);
            finalRecommendations = await this._getPopularProducts(3);
        }
    }

    if (finalRecommendations.length === 0) {
        const fallbackProducts = await this._getPopularProducts(3);
        if (fallbackProducts.length > 0) finalRecommendations = fallbackProducts;
    }

    let formattedRecommendations = [];
    try {
        formattedRecommendations = await this._mapProductsToFrontendFormat(finalRecommendations);
    } catch (fmtErr) {
        console.error("ERROR: [getGeminiRecommendations] Lỗi khi format sản phẩm:", fmtErr.message);
        formattedRecommendations = finalRecommendations.map(p => (typeof p.toJSON === 'function' ? p.toJSON() : p));
    }

    const excludeProductIds = new Set();
    if (currentProductId) excludeProductIds.add(currentProductId);
    try {
        const recentlyViewedForExclusion = await RecommendationController._getUserRecentlyViewedProducts(userId, 10);
        recentlyViewedForExclusion.forEach(p => excludeProductIds.add(p.id));
    } catch (e) {
        console.warn("WARN: [getGeminiRecommendations] Could not fetch recently viewed for exclusion:", e.message);
    }
    try {
        const purchasedProductsForExclusion = await RecommendationController._getUserPurchasedProducts(userId, 10);
        purchasedProductsForExclusion.forEach(p => excludeProductIds.add(p.id));
    } catch (e) {
        console.warn("WARN: [getGeminiRecommendations] Could not fetch purchased products for exclusion:", e.message);
    }

    console.log("DEBUG: [getGeminiRecommendations] Products to exclude (IDs):", Array.from(excludeProductIds).join(', '));

    const filteredRecommendations = formattedRecommendations.filter(p => !excludeProductIds.has(p.id));
    console.log("DEBUG: [getGeminiRecommendations] Final recommendations AFTER filtering:", filteredRecommendations.map(p => p.name));

    recommendationCache.set(cacheKey, filteredRecommendations);
    console.log(`DEBUG: [getGeminiRecommendations] Stored recommendations in cache for userId: ${userId}`);

    return filteredRecommendations;
}

    
    static async _mapProductsToFrontendFormat(products) {
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
                        attributes: ['id', 'productId'],
                        include: [{ model: Product, as: 'product', attributes: ['categoryId'] }]
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
                const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0);
                const flashLimit = fsi.quantity;

                const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

                if (!isSoldOutForThisItem) {
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
        
        return products.map(product => {
            const productJson = product.toJSON ? product.toJSON() : product;
            
            const processedSkus = (productJson.skus || []).map(sku => {
                const skuDataWithCategory = {
                    ...sku,
                    Product: { category: { id: productJson.categoryId } }
                };
                return processSkuPrices(skuDataWithCategory, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);
            }).sort((a, b) => a.price - b.price);

            const bestSku = processedSkus[0] || {};

            let totalSoldCount = 0;
            let totalRatingSum = 0;
            let totalRatingCount = 0;
            let productInStock = false;
            
            (productJson.skus || []).forEach(sku => {
                if (sku.OrderItems) {
                    totalSoldCount += sku.OrderItems.reduce((sum, oi) => sum + oi.quantity, 0);
                }
                if (sku.reviews) {
                    sku.reviews.forEach(rv => {
                        const v = Number(rv.rating) || 0;
                        if (v > 0) {
                            totalRatingSum += v;
                            totalRatingCount += 1;
                        }
                    });
                }
                if ((sku.stock || 0) > 0) {
                    productInStock = true;
                }
            });
            const averageRating = totalRatingCount > 0 ? +(totalRatingSum / totalRatingCount).toFixed(1) : 0;

            return {
                id: productJson.id,
                name: productJson.name,
                slug: productJson.slug,
                thumbnail: productJson.thumbnail,
                badge: productJson.badge,
                badgeImage: productJson.badgeImage,
                price: bestSku.price !== null ? formatCurrencyVND(bestSku.price) : null,
                oldPrice: (bestSku.flashSaleInfo && bestSku.flashSaleInfo.isSoldOut === false)
                    ? formatCurrencyVND(bestSku.originalPrice)
                    : (bestSku.originalPrice > bestSku.price ? formatCurrencyVND(bestSku.originalPrice) : null),
                discount: bestSku.discount ?? null,
                inStock: productInStock,
                soldCount: totalSoldCount,
                rating: averageRating,
                image: bestSku.ProductMedia?.[0]?.mediaUrl || productJson.thumbnail,
            };
        });
    }


    static async getRecommendations(req, res) {
        console.log("DEBUG: [getRecommendations] API call received.");
        try {
            console.log("DEBUG: [getRecommendations] req.user:", req.user);
            const userId = req.user ? req.user.id : null;
            console.log("DEBUG: [getRecommendations] Derived userId:", userId);

            const currentProductId = req.query.currentProductId ? parseInt(req.query.currentProductId) : null;

            if (!userId) {
                console.log("DEBUG: [getRecommendations] User not authenticated (userId is null). Returning popular products.");
                const popularProducts = await RecommendationController._getPopularProducts(3);
                const formattedProducts = await RecommendationController._mapProductsToFrontendFormat(popularProducts);
                console.log("DEBUG: [getRecommendations] DATA SENT TO FRONTEND (fallback):", JSON.stringify({ recommendations: formattedProducts }, null, 2));
                return res.status(200).json({ recommendations: formattedProducts });
            }

            console.log(`DEBUG: [getRecommendations] Requesting recommendations for userId: ${userId}, currentProductId: ${currentProductId}`);
            const recommendations = await RecommendationController._getGeminiRecommendations(userId, currentProductId);

            console.log("DEBUG: [getRecommendations] DATA SENT TO FRONTEND:", JSON.stringify({ recommendations: recommendations }, null, 2));

            return res.status(200).json({
                recommendations: recommendations
            });

        } catch (error) {
            console.error('ERROR: [getRecommendations] Lỗi hệ thống khi lấy gợi ý sản phẩm:', error.message);
            console.error("ERROR Name:", error.name);
            console.error("ERROR Stack:", error.stack);
            return res.status(500).json({ message: 'Lỗi server nội bộ.' });
        }
    }

    static async recordSearchKeyword(userId, keyword) {
        if (!SearchHistory || !userId || !keyword || keyword.trim() === '') {
            console.warn("WARN: [recordSearchKeyword] Missing userId or keyword, or SearchHistory model not available. Skipping record.");
            return;
        }
        try {
            const trimmedKeyword = keyword.trim();
            const existingSearch = await SearchHistory.findOne({
                where: { userId, keyword: trimmedKeyword }
            });

            if (existingSearch) {
                existingSearch.changed('createdAt', true);
                existingSearch.createdAt = new Date();
                await existingSearch.save();
                console.log(`DEBUG: [recordSearchKeyword] Updated timestamp for existing search keyword '${trimmedKeyword}' for user ${userId}.`);
            } else {
                await SearchHistory.create({ userId, keyword: trimmedKeyword });
                console.log(`DEBUG: [recordSearchKeyword] Recorded new search keyword '${trimmedKeyword}' for user ${userId}.`);
            }
        } catch (error) {
            console.error(`ERROR: [recordSearchKeyword] Lỗi khi ghi nhận từ khóa tìm kiếm '${keyword}' của user ${userId}:`, error.message);
            console.error("ERROR Name:", error.name);
            console.error("ERROR Stack:", error.stack);
        }
    }
}

module.exports = RecommendationController;