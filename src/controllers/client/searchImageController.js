const axios = require("axios");
const cosineSimilarity = require("cosine-similarity");
const db = require("../../models");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { Op, fn, col, literal, Sequelize } = require("sequelize");
const { processSkuPrices } = require('../../helpers/priceHelper');
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
} = db;

exports.searchByImage = async (req, res) => {
  try {
    const filePath = req.file?.path;
    if (!filePath) {
      return res.status(400).json({ message: "Thiếu ảnh để tìm kiếm!" });
    }

    const formData = new FormData();

    if (!filePath.startsWith("http://") && !filePath.startsWith("https://")) {
      formData.append("image", fs.createReadStream(path.resolve(filePath)));
    } else {
      const imageRes = await axios.get(filePath, {
        responseType: "arraybuffer",
      });
      formData.append("image", Buffer.from(imageRes.data), {
        filename: "image.jpg",
        contentType: "image/jpeg",
      });
    }

    const flaskResponse = await axios.post(
      "http://127.0.0.1:8000/embed",
      formData,
      {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const queryEmbedding = flaskResponse.data.vector;
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length < 100) {
      return res.status(500).json({
        message: "Không nhận được vector hợp lệ từ Flask hoặc vector quá ngắn.",
      });
    }

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
    });

    const scored = productsWithEmbeddings.map((p) => {
      const vector = JSON.parse(p.imageVector);
      const score = cosineSimilarity(queryEmbedding, vector);
      return { product: p, score };
    });

    const SIMILARITY_THRESHOLD = 0.8;
    const MAX_RESULTS = 10;

    const topResultsRaw = scored
      .filter((item) => item.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS);

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

    const formattedResults = topResultsRaw.map(({ product, score }) => {
      const skus = (product.skus || [])
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
      const catDeal = catDealMap.get(product.categoryId);

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
        let tempPrice = primary.price;
        if (catDeal.discountType === "percent") {
          tempPrice = (primary.price * (100 - catDeal.discountValue)) / 100;
        } else {
          tempPrice = primary.price - catDeal.discountValue;
        }
        tempPrice = Math.max(0, Math.round(tempPrice / 1000) * 1000);
        if (tempPrice < finalPrice) {
          finalOldPrice = primary.price;
          finalPrice = tempPrice;
          primary.salePrice = tempPrice;
        }
      }

      if (!finalOldPrice && primary.originalPrice > finalPrice) {
        finalOldPrice = primary.originalPrice;
      }

      let calculatedDiscount = 0;
      const comparePriceForDiscount =
        finalOldPrice || primary.originalPrice || 0;
      if (comparePriceForDiscount > finalPrice && finalPrice > 0) {
        calculatedDiscount = Math.round(
          ((comparePriceForDiscount - finalPrice) / comparePriceForDiscount) *
            100
        );
        calculatedDiscount = Math.min(99, Math.max(1, calculatedDiscount));
      }

      const totalStock = (product.skus || []).reduce(
        (s, x) => s + (+x.stock || 0),
        0
      );

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        thumbnail: product.thumbnail,
        badge: product.badge,
        image: primary.ProductMedia?.[0]?.mediaUrl || product.thumbnail,
        badgeImage: product.badgeImage,
        price: finalPrice, // Đã đổi từ priceNum thành price
        oldPrice: finalOldPrice, // Đã đổi từ oldPriceNum thành oldPrice
        originalPrice: primary.originalPrice, // Giữ nguyên
        discount: calculatedDiscount,
        skus: product.skus,
        similarity: score.toFixed(4),
        inStock: totalStock > 0,
      };
    });

    return res.status(200).json({ similarProducts: formattedResults });
  } catch (err) {
    console.error("❌ Lỗi searchByImage:", err);
    if (axios.isAxiosError(err)) {
      if (err.response) {
        return res.status(500).json({
          message: `Lỗi từ Flask API (${err.response.status}): ${
            err.response.data.error || JSON.stringify(err.response.data)
          }`,
        });
      } else if (err.request) {
        return res.status(500).json({
          message: `Không kết nối được đến Flask API. Vui lòng kiểm tra Flask server. (${err.code})`,
        });
      } else {
        return res
          .status(500)
          .json({ message: `Lỗi cấu hình request: ${err.message}` });
      }
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

        // Chỉ thêm vào map nếu giá sale thấp hơn giá đã có, hoặc là mục đầu tiên
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
    }); // Tìm sản phẩm theo tên gần đúng và bao gồm các thông tin chi tiết cần thiết

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
            }, // Không cần include FlashSaleItem ở đây nữa vì đã lấy ở trên qua allActiveFlashSales
          ],
        },
      ],
      limit: 20,
    });

    const formattedResults = matchedProducts.map((product) => {
      const skus = (product.skus || [])
        .map((sku) => {
          const skuDataForHelper = {
            ...sku.toJSON(),
            Product: { category: { id: product.categoryId } }, // Đảm bảo có categoryId
          };
          // GỌI processSkuPrices ĐỂ XỬ LÝ GIÁ
          const priceResults = processSkuPrices(
            skuDataForHelper,
            allActiveFlashSaleItemsMap,
            allActiveCategoryDealsMap
          );

          return {
            ...sku.toJSON(), // Giữ lại tất cả thuộc tính gốc của sku
            price: priceResults.price, // Giá đã xử lý (current price)
            originalPrice: priceResults.originalPrice, // Là giá để gạch ngang (có thể là null)
            flashSaleInfo: priceResults.flashSaleInfo,
            hasDeal: priceResults.hasDeal,
            discountAmount: priceResults.discountAmount, // SỐ TIỀN giảm
            discountPercent: priceResults.discountPercent, // PHẦN TRĂM giảm
          };
        })
        .sort((a, b) => {
          // Sắp xếp SKU: ưu tiên flash sale được áp dụng, sau đó đến giá tăng dần
          const aHasActiveFS = a.flashSaleInfo?.dealApplied;
          const bHasActiveFS = b.flashSaleInfo?.dealApplied;

          if (aHasActiveFS && !bHasActiveFS) return -1; // a có flash sale active, b không -> a lên trước
          if (!aHasActiveFS && bHasActiveFS) return 1; // b có flash sale active, a không -> b lên trước // Nếu cùng trạng thái flash sale, sắp xếp theo giá tăng dần

          return (+a.price || 0) - (+b.price || 0);
        });

      const primarySku = skus[0] || {}; // Lấy SKU đầu tiên (tốt nhất) sau khi sắp xếp

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
        image: primarySku.ProductMedia?.[0]?.mediaUrl || product.thumbnail, // Sử dụng media của primarySku
        badgeImage: product.badgeImage,
        price: primarySku.price, // Giá đã xử lý từ primarySku (đây là giá hiển thị chính)
        oldPrice: primarySku.originalPrice, // oldPrice là giá gạch ngang (originalPrice đã xử lý)
        originalPrice: primarySku.originalPrice, // Giữ lại originalPrice đã xử lý cho SearchResult (nếu cần so sánh)
        discount: primarySku.discountPercent, // Gửi PHẦN TRĂM giảm giá cho frontend
        discountAmount: primarySku.discountAmount, // Gửi SỐ TIỀN giảm giá cho frontend
        skus: skus, // Gửi tất cả SKUs đã xử lý về (nếu frontend cần)
        inStock: totalStock > 0,
        similarity: null, // Không có `similarity` ở đây vì đây là tìm kiếm văn bản.
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
  const query = req.query.q; // Lấy từ khóa tìm kiếm từ query parameter 'q'

  if (!query || typeof query !== "string" || query.length < 2) {
    return res.status(200).json({ suggestions: [] });
  }

  const lowerCaseQuery = query.toLowerCase();
  const uniqueSuggestionsMap = new Map(); // Dùng Map để lưu trữ đối tượng gợi ý duy nhất (key là name.toLowerCase())

  try {
    // 1. Gợi ý từ tên sản phẩm (LẤY CHI TIẾT SẢN PHẨM)
    const products = await Product.findAll({
      where: {
        name: { [Op.like]: `%${lowerCaseQuery}%` },
        isActive: true, // Chỉ lấy sản phẩm đang hoạt động
      },
      attributes: [
        "id",
        "name",
        "slug",
        "thumbnail", // Lấy thumbnail
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
              limit: 1, // Chỉ lấy 1 ảnh
            },
            {
              model: FlashSaleItem,
              as: "flashSaleSkus",
              required: false,
              include: [
                {
                  model: FlashSale,
                  as: "flashSale",
                  attributes: ["endTime"], // Chỉ lấy endTime để tính toán
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
      limit: 10, // Giới hạn số lượng gợi ý sản phẩm
      order: [
        // Sắp xếp để gợi ý tốt hơn
        [
          Sequelize.literal(
            `CASE WHEN name LIKE '${lowerCaseQuery}%' THEN 0 ELSE 1 END`
          ),
          "ASC",
        ], // Ưu tiên tên bắt đầu bằng query
        ["name", "ASC"], // Sau đó sắp xếp theo tên
      ],
    });

    // Lấy thông tin các chương trình khuyến mãi theo danh mục (FlashSaleCategory)
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
        // Chọn deal có ưu tiên cao hơn
        catDealMap.set(d.categoryId, {
          discountType: d.discountType,
          discountValue: d.discountValue,
          priority: d.priority,
          endTime: d.flashSale.endTime,
        });
      }
    });

    // Format dữ liệu sản phẩm tương tự như searchByName/searchByImage
    products.forEach((product) => {
      const formattedProduct = (p) => {
        const skus = (p.skus || [])
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
        const catDeal = catDealMap.get(p.categoryId);

        let finalPrice = primary.price;
        let finalOldPrice = null;

        const fsItem = primary.flashSaleSkus?.[0];
        if (
          fsItem?.flashSale &&
          fsItem.salePrice > 0 &&
          fsItem.salePrice < primary.price
        ) {
          finalOldPrice = primary.price;
          finalPrice = +fsItem.salePrice; // Đảm bảo là number
          primary.salePrice = +fsItem.salePrice;
        }

        if (finalPrice === primary.price && catDeal) {
          let tempPrice = primary.price;
          if (catDeal.discountType === "percent") {
            tempPrice = (primary.price * (100 - catDeal.discountValue)) / 100;
          } else {
            tempPrice = primary.price - catDeal.discountValue;
          }
          tempPrice = Math.max(0, Math.round(tempPrice / 1000) * 1000);
          if (tempPrice < finalPrice) {
            finalOldPrice = primary.price;
            finalPrice = tempPrice;
            primary.salePrice = tempPrice;
          }
        }

        if (!finalOldPrice && primary.originalPrice > finalPrice) {
          finalOldPrice = primary.originalPrice;
        }

        let calculatedDiscount = 0;
        const comparePrice = finalOldPrice || primary.originalPrice || 0;
        if (comparePrice > finalPrice && finalPrice > 0) {
          calculatedDiscount = Math.round(
            ((comparePrice - finalPrice) / comparePrice) * 100
          );
          calculatedDiscount = Math.min(99, Math.max(1, calculatedDiscount));
        }

        const totalStock = (p.skus || []).reduce(
          (s, x) => s + (parseInt(x.stock, 10) || 0),
          0
        );

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          thumbnail: p.thumbnail,
          badge: p.badge,
          image: primary.ProductMedia?.[0]?.mediaUrl || p.thumbnail, // Lấy ảnh từ SKU nếu có, không thì dùng thumbnail
          badgeImage: p.badgeImage,
          price: finalPrice,
          oldPrice: finalOldPrice,
          originalPrice: primary.originalPrice,
          discount: calculatedDiscount,
          inStock: totalStock > 0,
          // Không cần skus, similarity cho gợi ý
        };
      };

      const formattedResult = formattedProduct(product);
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

  // 2. Gợi ý từ tên danh mục (nếu vẫn muốn hiển thị text-only suggestions cho category/brand)
  // Bạn có thể bỏ qua phần này nếu chỉ muốn gợi ý sản phẩm chi tiết
  try {
    const categories = await Category.findAll({
      where: {
        name: { [Op.like]: `%${lowerCaseQuery}%` },
        isActive: true,
      },
      attributes: ["name"],
      limit: 5,
    });
    categories.forEach((c) => {
      if (!uniqueSuggestionsMap.has(c.name.toLowerCase())) {
        uniqueSuggestionsMap.set(c.name.toLowerCase(), {
          id: `cat-${c.id}`, // Tạo ID giả để tránh trùng với product ID
          name: c.name,
          type: "category", // Để frontend biết đây là category
          slug: c.slug, // Nếu bạn có slug cho category
          // Thêm các thuộc tính khác như icon hoặc hình ảnh mặc định nếu muốn
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
          id: `brand-${b.id}`, // Tạo ID giả
          name: b.name,
          type: "brand", // Để frontend biết đây là brand
          // Thêm các thuộc tính khác
        });
      }
    });
  } catch (error) {
    console.error("Lỗi khi lấy gợi ý từ Brand:", error);
  }

  // Chuyển Map thành mảng các đối tượng gợi ý
  const finalSuggestions = Array.from(uniqueSuggestionsMap.values());

  // Sắp xếp lại nếu cần (ví dụ: ưu tiên sản phẩm, sau đó đến category/brand, hoặc theo thứ tự bảng chữ cái)
  finalSuggestions.sort((a, b) => {
    const aStartsWith = a.name.toLowerCase().startsWith(lowerCaseQuery);
    const bStartsWith = b.name.toLowerCase().startsWith(lowerCaseQuery);

    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;

    // Ưu tiên sản phẩm hơn category/brand trong danh sách gợi ý
    if (a.type === "product" && b.type !== "product") return -1;
    if (a.type !== "product" && b.type === "product") return 1;

    return a.name.localeCompare(b.name);
  });

  // Giới hạn tổng số gợi ý trả về (ví dụ: tối đa 15)
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
