const {
  Cart,
  CartItem,
  Sku,
  FlashSaleItem,
  Order,
  Product,
  FlashSale,
  User,
  UserPoint,
  OrderItem,
  ProductMedia,
  FlashSaleCategory,
  SkuVariantValue,
  VariantValue,
  Variant,
} = require("../../models"); // Adjust path as per your project structure
const { Sequelize, Op } = require("sequelize");

// Import the helper function
const { processSkuPrices } = require("../../helpers/priceHelper"); // Adjust path as per your project structure

class CartController {
  static async addToCart(req, res) {
    try {
      const userId = req.user.id;
      const { skuId, quantity = 1 } = req.body;

      console.log(`--- [addToCart] Bắt đầu xử lý thêm vào giỏ hàng cho userId: ${userId}, skuId: ${skuId}, quantity: ${quantity} ---`);

      // 1. Find the SKU and its product category
      const sku = await Sku.findByPk(skuId, {
        include: [
          { model: Product, as: "product", attributes: ["categoryId"] },
        ],
      });

      if (!sku) {
        console.log(`[addToCart] Lỗi: Không tìm thấy SKU với skuId: ${skuId}`);
        return res
          .status(404)
          .json({ message: "Không tìm thấy phiên bản sản phẩm này." });
      }
      if ((sku.stock || 0) <= 0) {
        console.log(`[addToCart] Lỗi: Sản phẩm SKU ${skuId} đã hết hàng (stock: ${sku.stock}).`);
        return res.status(400).json({ message: "Sản phẩm này đã hết hàng." });
      }
      console.log(`[addToCart] SKU ${skuId} (stock: ${sku.stock}) hợp lệ.`);


      // 2. Find or create the user's cart
      const [cart, createdCart] = await Cart.findOrCreate({
        where: { userId },
        defaults: { userId },
      });
      console.log(`[addToCart] Giỏ hàng cho userId ${userId} đã ${createdCart ? 'được tạo mới' : 'tồn tại'} (cartId: ${cart.id}).`);


      // 3. Check for existing item in cart
      const existingItem = await CartItem.findOne({
        where: { cartId: cart.id, skuId },
      });
      const currentQty = existingItem?.quantity || 0;
      console.log(`[addToCart] Sản phẩm SKU ${skuId} hiện có trong giỏ hàng: ${currentQty} sản phẩm.`);


      // 4. Fetch all active flash sales with necessary details
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
            attributes: [
              "id",
              "flashSaleId",
              "skuId",
              "salePrice",
              "quantity",
              "maxPerUser",
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
      console.log(`[addToCart] Tìm thấy ${allActiveFlashSales.length} tổng số Flash Sale đang hoạt động.`);


      const allActiveFlashSaleItemsMap = new Map();
      const allActiveCategoryDealsMap = new Map();

      for (const saleEvent of allActiveFlashSales) {
        const saleEndTime = saleEvent.endTime;
        const saleId = saleEvent.id;

        for (const fsi of saleEvent.flashSaleItems || []) {
          const itemSku = fsi.sku;
          if (!itemSku) continue;
          const itemSkuId = itemSku.id;
          const flashItemSalePrice = parseFloat(fsi.salePrice);
          const flashLimit = fsi.quantity;

          // Calculate sold quantity for this flash sale item separately
          const soldForThisItem = await OrderItem.sum('quantity', {
            where: {
              flashSaleId: saleId,
              skuId: itemSkuId,
            },
            include: [{
              model: Order,
              as: 'order',
              where: {
                status: { [Op.in]: ['completed', 'delivered'] }
              },
              attributes: [], // Ensure no non-aggregated columns are selected
              required: true
            }]
          }) || 0;

          const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

          if (!isSoldOutForThisItem) {
            if (
              !allActiveFlashSaleItemsMap.has(itemSkuId) ||
              flashItemSalePrice <
                allActiveFlashSaleItemsMap.get(itemSkuId).salePrice
            ) {
              allActiveFlashSaleItemsMap.set(itemSkuId, {
                salePrice: flashItemSalePrice,
                quantity: flashLimit,
                soldQuantity: soldForThisItem,
                maxPerUser: fsi.maxPerUser,
                flashSaleId: saleId,
                flashSaleEndTime: saleEndTime,
              });
            }
          }
        }

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
      }
      console.log(`[addToCart] allActiveFlashSaleItemsMap (Item tốt nhất cho từng SKU đang còn suất): ${allActiveFlashSaleItemsMap.size} entries`);
      console.log(`[addToCart] allActiveCategoryDealsMap (Tất cả deals category cho từng Category ID đang hoạt động): ${allActiveCategoryDealsMap.size} entries`);


      // Prepare skuData for the helper
      const skuDataForHelper = {
        ...sku.toJSON(),
        Product: { category: { id: sku.product?.categoryId } }, // Attach category for helper
      };
      const priceResults = processSkuPrices(
        skuDataForHelper,
        allActiveFlashSaleItemsMap,
        allActiveCategoryDealsMap
      );
      console.log(`[addToCart] Kết quả tính giá từ helper cho SKU ${skuId}:`, {
        price: priceResults.price,
        originalPrice: priceResults.originalPrice,
        flashSaleInfo: priceResults.flashSaleInfo ? { ...priceResults.flashSaleInfo, flashSaleEndTime: priceResults.flashSaleInfo.flashSaleEndTime?.toISOString() } : null // Log endTime dưới dạng ISO string
      });


      let flashNotice = "";
      let flashViolated = false; // Khởi tạo biến cờ vi phạm
      let finalPrice = priceResults.price;
      let originalPriceForDisplay = priceResults.originalPrice; // Base original price from helper

      if (
        priceResults.flashSaleInfo &&
        priceResults.flashSaleInfo.type === "item"
      ) {
        console.log(`[addToCart] SKU ${skuId} đang nằm trong Flash Sale loại ITEM.`);
        const flashSaleLimitPerUser =
          priceResults.flashSaleInfo.maxPerUser || Infinity;

        // Get order IDs for the current user that are not cancelled
        const userOrders = await Order.findAll({
          attributes: ['id'], // We only need the order IDs
          where: {
            userId,
            status: { [Op.ne]: "cancelled" },
          },
        });

        const userOrderIds = userOrders.map(order => order.id);
        console.log(`[addToCart] Các Order ID của user ${userId} không bị cancelled:`, userOrderIds);


        // Sum quantities of the specific SKU within the user's relevant orders
        const previousOrderedQty = await OrderItem.sum('quantity', {
          where: {
            skuId: sku.id,
            flashSaleId: priceResults.flashSaleInfo.flashSaleId,
            orderId: { [Op.in]: userOrderIds }, // Filter by the user's order IDs
          },
        }) || 0;
        console.log(`[addToCart] Số lượng SKU ${skuId} đã đặt hàng trước đó (không cancelled) bởi user ${userId} trong flash sale này: ${previousOrderedQty}`);


        const totalQuantityIncludingCart =
          currentQty + quantity + previousOrderedQty; // Số lượng user sẽ có trong giỏ + đã mua
        console.log(`[addToCart] Tổng số lượng SKU ${skuId} (hiện tại trong giỏ + thêm mới + đã đặt hàng): ${totalQuantityIncludingCart}`);


        const flashStockLimit = priceResults.flashSaleInfo.quantity;
        const flashSold = priceResults.flashSaleInfo.soldQuantity;
        const remainingFlashStock = flashStockLimit - flashSold;
        console.log(`[addToCart] Flash Sale SKU ${skuId} - Giới hạn deal: ${flashStockLimit}, Đã bán: ${flashSold}, Còn lại: ${remainingFlashStock}`);


        // ⚠️ Vi phạm per-user
        if (totalQuantityIncludingCart > flashSaleLimitPerUser) {
          flashNotice = `Bạn đã vượt giới hạn Flash Sale (${flashSaleLimitPerUser} suất/người). Sản phẩm này sẽ tính giá gốc.`;
          flashViolated = true;
          console.log(`[addToCart] VI PHẠM: Vượt giới hạn Flash Sale/người. flashNotice: ${flashNotice}`);
        }

        // ⚠️ Vi phạm sold-out (tổng số deal Flash Sale còn lại)
        // Đây là logic đã được chứng minh là tạo ra flashNotice trong getCart của bạn
        if ((currentQty + quantity) > remainingFlashStock) { // Nếu tổng số lượng trong giỏ (hiện tại + mới thêm) > số suất flash sale còn lại
           flashNotice +=
            (flashNotice ? " " : "") +
            `Chỉ còn ${remainingFlashStock} suất Flash Sale cho sản phẩm này. Phần vượt sẽ tính giá gốc.`;
           flashViolated = true;
           console.log(`[addToCart] VI PHẠM: Vượt giới hạn tổng deal Flash Sale. flashNotice: ${flashNotice}`);
        }


        // Nếu vi phạm bất kỳ cái nào → revert price
        if (flashViolated) {
          finalPrice = sku.originalPrice || sku.price;
          originalPriceForDisplay = sku.originalPrice || sku.price;
          console.log(`[addToCart] Giá sản phẩm ${skuId} đã được revert về giá gốc do vi phạm Flash Sale. Final Price: ${finalPrice}`);
        }
      } else {
        console.log(`[addToCart] SKU ${skuId} không nằm trong Flash Sale loại ITEM hoặc Flash Sale đã hết hạn/không hoạt động.`);
      }

      // Check overall SKU stock
      const totalQtyAfterAdding = currentQty + quantity; // Đây là số lượng cuối cùng sau khi thêm vào giỏ
      if (totalQtyAfterAdding > (sku.stock || 0)) {
        console.log(`[addToCart] Lỗi: Tổng số lượng sau khi thêm (${totalQtyAfterAdding}) vượt quá số lượng tồn kho (${sku.stock}).`);
        return res
          .status(400)
          .json({ message: `Chỉ còn ${sku.stock || 0} sản phẩm trong kho.` });
      }
      console.log(`[addToCart] Tổng số lượng sau khi thêm (${totalQtyAfterAdding}) vẫn trong giới hạn tồn kho.`);


      if (existingItem) {
        existingItem.quantity = totalQtyAfterAdding;
        await existingItem.save();
        console.log(`[addToCart] Cập nhật số lượng CartItem ${existingItem.id} thành ${totalQtyAfterAdding}.`);
      } else {
        await CartItem.create({
          cartId: cart.id,
          skuId,
          quantity: quantity, // Use the requested quantity for new item
          isSelected: true,
        });
        console.log(`[addToCart] Tạo mới CartItem cho SKU ${skuId} với số lượng ${quantity}.`);
      }

      console.log(`--- [addToCart] Hoàn tất xử lý thêm vào giỏ hàng cho skuId: ${skuId}. FlashNotice: "${flashNotice}" ---`);
      return res.status(200).json({
        message: "Đã thêm vào giỏ hàng thành công.",
        flashNotice, // Trả về thông báo Flash Sale
      });
    } catch (error) {
      console.error("Lỗi thêm vào giỏ hàng:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

 static async getCart(req, res) {
  try {
    const userId = req.user.id;
    console.log(`--- [getCart] Bắt đầu lấy giỏ hàng cho userId: ${userId} ---`);

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
          attributes: ["id", "flashSaleId", "skuId", "salePrice", "quantity", "maxPerUser"],
          include: [
            {
              model: Sku,
              as: "sku",
              attributes: ["id", "skuCode", "price", "originalPrice", "stock", "productId"],
              include: [{ model: Product, as: "product", attributes: ["categoryId"] }],
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

    for (const saleEvent of allActiveFlashSales) {
      const saleEndTime = saleEvent.endTime;
      const saleId = saleEvent.id;

      for (const fsi of saleEvent.flashSaleItems || []) {
        const skuInFsi = fsi.sku;
        if (!skuInFsi) continue;

        const skuIdInFsi = skuInFsi.id;
        const flashItemSalePrice = parseFloat(fsi.salePrice);
        const flashLimit = fsi.quantity;

        const soldForThisItem = await OrderItem.sum("quantity", {
          where: { flashSaleId: saleId, skuId: skuIdInFsi },
          include: [{
            model: Order,
            as: "order",
            where: { status: { [Op.in]: ["completed", "delivered"] } },
            required: true,
            attributes: [],
          }],
        }) || 0;

        const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

        if (!isSoldOutForThisItem) {
          const existing = allActiveFlashSaleItemsMap.get(skuIdInFsi);
          if (!existing || flashItemSalePrice < existing.salePrice) {
            allActiveFlashSaleItemsMap.set(skuIdInFsi, {
              salePrice: flashItemSalePrice,
              quantity: flashLimit,
              soldQuantity: soldForThisItem,
              maxPerUser: fsi.maxPerUser,
              flashSaleId: saleId,
              flashSaleEndTime: saleEndTime,
            });
          }
        }
      }

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
    }

    const cart = await Cart.findOne({
      where: { userId },
      include: [
        {
          model: CartItem,
          include: [
            {
              model: Sku,
              attributes: ["id", "skuCode", "price", "originalPrice", "stock", "productId"],
              include: [
                {
                  model: Product,
                  as: "product",
                  attributes: ["id", "name", "slug", "thumbnail", "categoryId"],
                },
                { model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl"] },
                {
                  model: SkuVariantValue,
                  as: "variantValues",
                  include: [
                    {
                      model: VariantValue,
                      as: "variantValue",
                      include: [
                        { model: Variant, as: "variant", attributes: ["name"] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!cart || !cart.CartItems) {
      return res.status(200).json({ cartItems: [], totalAmount: 0, rewardPoints: 0 });
    }

    const formattedItems = await Promise.all(
      cart.CartItems.map(async (ci) => {
        const sku = ci.Sku;
        const product = sku.product;
        const skuDataForHelper = {
          ...sku.toJSON(),
          Product: { category: { id: product?.categoryId } },
        };

        const priceResults = processSkuPrices(
          skuDataForHelper,
          allActiveFlashSaleItemsMap,
          allActiveCategoryDealsMap
        );

        let previousOrderedQty = 0;
        if (priceResults.flashSaleInfo?.type === "item") {
          const userOrders = await Order.findAll({
            attributes: ["id"],
            where: { userId, status: { [Op.ne]: "cancelled" } },
          });
          const userOrderIds = userOrders.map((o) => o.id);

          previousOrderedQty = await OrderItem.sum("quantity", {
            where: {
              skuId: sku.id,
              flashSaleId: priceResults.flashSaleInfo.flashSaleId,
              orderId: { [Op.in]: userOrderIds },
            },
          }) || 0;
        }

        let finalPrice = priceResults.price;
        if (!finalPrice || finalPrice <= 0) finalPrice = sku.originalPrice || sku.price;

        let originalPriceForDisplay = priceResults.originalPrice;
        let flashNotice = "";
        let isFlashSaleApplied = false;

        if (priceResults.flashSaleInfo?.type === "item") {
          const flashSaleLimitPerUser = priceResults.flashSaleInfo.maxPerUser || Infinity;
          const totalQuantityIncludingCart = ci.quantity + previousOrderedQty;

          if (totalQuantityIncludingCart > flashSaleLimitPerUser) {
            flashNotice = `Sản phẩm giới hạn ${flashSaleLimitPerUser} suất/người.`;
            finalPrice = sku.originalPrice || sku.price;
            originalPriceForDisplay = finalPrice;
            isFlashSaleApplied = false;
          } else {
            isFlashSaleApplied = true;
          }

          const remaining = (priceResults.flashSaleInfo.quantity || Infinity) - (priceResults.flashSaleInfo.soldQuantity || 0);
          if (ci.quantity > remaining) {
            flashNotice += ` Chỉ còn ${remaining} suất Flash Sale.`;
            finalPrice = sku.originalPrice || sku.price;
            originalPriceForDisplay = finalPrice;
            isFlashSaleApplied = false;
          }
        } else if (priceResults.flashSaleInfo?.type === "category") {
          isFlashSaleApplied = true;
        }

        return {
          id: ci.id,
          skuId: sku.id,
          productName: product?.name || "",
          productSlug: product?.slug || "",
          image: sku.ProductMedia?.[0]?.mediaUrl || product?.thumbnail || null,
          quantity: ci.quantity,
          isSelected: ci.isSelected,
          stock: sku.stock || 0,
          variantValues: (sku.variantValues || []).map((v) => ({
            variant: v.variantValue?.variant?.name,
            value: v.variantValue?.value,
          })),
          originalPrice: originalPriceForDisplay,
          price: finalPrice,
          finalPrice: finalPrice,
          lineTotal: finalPrice * ci.quantity,
          flashSaleInfo: priceResults.flashSaleInfo,
          flashNotice,
          isFlashSaleApplied,
        };
      })
    );

    const totalAmount = formattedItems.reduce((sum, item) => {
      return sum + (item.isSelected ? item.lineTotal : 0);
    }, 0);

    const couponCode = req.query.couponCode || null;
    let discountAmount = 0;

    if (couponCode) {
      const res = await couponService.applyCoupon({
        code: couponCode,
        skuIds: formattedItems.filter(i => i.isSelected).map(i => i.skuId),
        orderTotal: totalAmount,
      });

      if (res?.isValid && res?.coupon?.discountAmount) {
        discountAmount = parseFloat(res.coupon.discountAmount);
      }
    }

    const payablePrice = Math.max(0, totalAmount - discountAmount);
    const rewardPoints = Math.floor(payablePrice / 4000);

    // --- TÍNH ĐIỂM ĐỔI (GIỚI HẠN & GIẢM GIÁ TỪ ĐIỂM) ---
  const totalEarned = await UserPoint.sum('points', {
  where: {
    userId,
    type: 'earn',
    [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
  },
}) || 0;

const totalSpent = await UserPoint.sum('points', {
  where: { userId, type: 'spend' },
}) || 0;

const totalRefunded = await UserPoint.sum('points', {
  where: { userId, type: 'refund' },
}) || 0;

const totalExpired = await UserPoint.sum('points', {
  where: {
    userId,
    type: 'expired',
    expiresAt: { [Op.lte]: new Date() },
  },
}) || 0;

const userPointBalance = totalEarned + totalRefunded - totalSpent - totalExpired;

    const exchangeRate = 10; // 1 điểm = 10đ
    const minPointRequired = 20;
    const pointLimitRatio = 0.5;

    const canUsePoints = userPointBalance >= minPointRequired;
    let maxUsablePoints = 0;
    let pointDiscountAmount = 0;

    if (canUsePoints) {
      maxUsablePoints = Math.min(
        userPointBalance,
        Math.floor(payablePrice * pointLimitRatio / exchangeRate)
      );
      pointDiscountAmount = maxUsablePoints * exchangeRate;
    }

    return res.status(200).json({
      cartItems: formattedItems,
      totalAmount,
      rewardPoints,
      payablePrice,
      couponDiscount: discountAmount,
      pointInfo: {
        userPointBalance,
        exchangeRate,
        minPointRequired,
        canUsePoints,
        maxUsablePoints,
        pointDiscountAmount
      }
    });
  } catch (err) {
    console.error("Lỗi lấy giỏ hàng:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}



  static async updateQuantity(req, res) {
    try {
      const userId = req.user.id;
      const { cartItemId, quantity } = req.body;
      console.log(`--- [updateQuantity] Bắt đầu cập nhật số lượng cho userId: ${userId}, cartItemId: ${cartItemId}, quantity: ${quantity} ---`);


      if (!cartItemId || !quantity || quantity < 1) {
        console.log(`[updateQuantity] Lỗi: Dữ liệu không hợp lệ. cartItemId: ${cartItemId}, quantity: ${quantity}`);
        return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      }

      // Fetch CartItem with necessary Sku and Product info
      const item = await CartItem.findOne({
        where: { id: cartItemId },
        include: [
          {
            model: Cart,
            where: { userId },
          },
          {
            model: Sku,
            attributes: ["id", "stock", "price", "originalPrice", "productId"],
            include: [
              {
                model: Product,
                as: "product",
                attributes: ["categoryId"],
              },
              {
                model: FlashSaleItem,
                as: "flashSaleSkus", // This alias is for the specific FlashSaleItem linked to this Sku
                required: false,
                attributes: [
                  "id",
                  "flashSaleId",
                  "skuId",
                  "salePrice",
                  "quantity",
                  "maxPerUser",
                ],
                include: [
                  {
                    model: FlashSale,
                    as: "flashSale",
                    where: {
                      startTime: { [Op.lte]: new Date() },
                      endTime: { [Op.gte]: new Date() },
                      isActive: true,
                    },
                    required: true,
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!item) {
        console.log(`[updateQuantity] Lỗi: Không tìm thấy sản phẩm trong giỏ hàng với cartItemId: ${cartItemId}`);
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
      }

      const sku = item.Sku;
      const availableStock = sku.stock || 0;
      console.log(`[updateQuantity] SKU ${sku.id} - Tồn kho hiện tại: ${availableStock}`);
      if (quantity > availableStock) {
        console.log(`[updateQuantity] Lỗi: Số lượng yêu cầu (${quantity}) vượt quá tồn kho (${availableStock}).`);
        return res.status(400).json({
          message: `Chỉ còn ${availableStock} sản phẩm trong kho.`,
        });
      }

      // LẤY TẤT CẢ DỮ LIỆU FLASH SALE ĐANG HOẠT ĐỘNG TRƯỚC VỚI CÁC THÔNG TIN CẦN THIẾT
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
            attributes: [
              "id",
              "flashSaleId",
              "skuId",
              "salePrice",
              "quantity",
              "maxPerUser",
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
      console.log(`[updateQuantity] Tìm thấy ${allActiveFlashSales.length} tổng số Flash Sale đang hoạt động.`);

      const allActiveFlashSaleItemsMap = new Map();
      const allActiveCategoryDealsMap = new Map();

      for (const saleEvent of allActiveFlashSales) {
        const saleEndTime = saleEvent.endTime;
        const saleId = saleEvent.id;

        for (const fsi of saleEvent.flashSaleItems || []) {
          const skuInFsi = fsi.sku;
          if (!skuInFsi) continue;
          const skuIdInFsi = skuInFsi.id;
          const flashItemSalePrice = parseFloat(fsi.salePrice);
          const flashLimit = fsi.quantity;

          const soldForThisItem = await OrderItem.sum('quantity', {
            where: {
              flashSaleId: saleId,
              skuId: skuIdInFsi,
            },
            include: [{
              model: Order,
              as: 'order',
              where: {
                status: { [Op.in]: ['completed', 'delivered'] }
              },
              attributes: [],
              required: true
            }]
          }) || 0;

          const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

          if (!isSoldOutForThisItem) {
            if (
              !allActiveFlashSaleItemsMap.has(skuIdInFsi) ||
              flashItemSalePrice <
                allActiveFlashSaleItemsMap.get(skuIdInFsi).salePrice
            ) {
              allActiveFlashSaleItemsMap.set(skuIdInFsi, {
                salePrice: flashItemSalePrice,
                quantity: flashLimit,
                soldQuantity: soldForThisItem,
                maxPerUser: fsi.maxPerUser,
                flashSaleId: saleId,
                flashSaleEndTime: saleEndTime,
              });
            }
          }
        }

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
      }
      console.log(`[updateQuantity] allActiveFlashSaleItemsMap (Item tốt nhất cho từng SKU đang còn suất): ${allActiveFlashSaleItemsMap.size} entries`);
      console.log(`[updateQuantity] allActiveCategoryDealsMap (Tất cả deals category cho từng Category ID đang hoạt động): ${allActiveCategoryDealsMap.size} entries`);


      let flashNotice = "";
      let flashViolated = false; // Khởi tạo biến cờ vi phạm
      let finalPrice = sku.price; // Start with base price
      let originalPriceForDisplay = sku.originalPrice || sku.price; // Base original price

      // Prepare skuData for the helper to get price info for the specific SKU
      const skuDataForHelper = {
        ...sku.toJSON(),
        Product: { category: { id: sku.product?.categoryId } },
      };
      const priceResultsForUpdate = processSkuPrices(
        skuDataForHelper,
        allActiveFlashSaleItemsMap,
        allActiveCategoryDealsMap
      );
      console.log(`[updateQuantity] SKU ${sku.id} - Kết quả tính giá từ helper:`, {
        price: priceResultsForUpdate.price,
        originalPrice: priceResultsForUpdate.originalPrice,
        flashSaleInfo: priceResultsForUpdate.flashSaleInfo ? { ...priceResultsForUpdate.flashSaleInfo, flashSaleEndTime: priceResultsForUpdate.flashSaleInfo.flashSaleEndTime?.toISOString() } : null
      });


      if (priceResultsForUpdate.flashSaleInfo && priceResultsForUpdate.flashSaleInfo.type === "item") {
        console.log(`[updateQuantity] SKU ${sku.id} đang nằm trong Flash Sale loại ITEM.`);
        const flashSaleLimitPerUser =
          priceResultsForUpdate.flashSaleInfo.maxPerUser || Infinity;

        // Get order IDs for the current user that are not cancelled
        const userOrders = await Order.findAll({
          attributes: ['id'],
          where: {
            userId,
            status: { [Op.ne]: "cancelled" },
          },
        });
        const userOrderIds = userOrders.map(order => order.id);
        console.log(`[updateQuantity] Các Order ID của user ${userId} không bị cancelled:`, userOrderIds);


        const previousOrderedQty =
          (await OrderItem.sum("quantity", {
            where: {
              skuId: sku.id,
              flashSaleId: priceResultsForUpdate.flashSaleInfo.flashSaleId,
              orderId: { [Op.in]: userOrderIds },
            },
          })) || 0;
        console.log(`[updateQuantity] Số lượng SKU ${sku.id} đã đặt hàng trước đó (không cancelled) bởi user ${userId} trong flash sale này: ${previousOrderedQty}`);

        const totalQuantityIncludingCart = quantity + previousOrderedQty; // Ở đây là quantity MỚI muốn cập nhật
        console.log(`[updateQuantity] Tổng số lượng SKU ${sku.id} (thêm mới + đã đặt hàng): ${totalQuantityIncludingCart}`);


        // Check per-user limit for flash sale
        if (totalQuantityIncludingCart > flashSaleLimitPerUser) {
          flashNotice = `Bạn đã vượt giới hạn Flash Sale (${flashSaleLimitPerUser} suất/người). Toàn bộ sản phẩm này sẽ được tính giá gốc.`;
          flashViolated = true;
          console.log(`[updateQuantity] VI PHẠM: Vượt giới hạn Flash Sale/người. flashNotice: ${flashNotice}`);
        } else {
          // If per-user limit is not exceeded, use the flash sale price from helper
          finalPrice = priceResultsForUpdate.price;
          originalPriceForDisplay = priceResultsForUpdate.originalPrice;
        }

        // Check overall flash sale stock limit
        const soldForThisFlashSaleItem = priceResultsForUpdate.flashSaleInfo.soldQuantity;
        const remainingFlashStock =
          (priceResultsForUpdate.flashSaleInfo.quantity || Infinity) - soldForThisFlashSaleItem;
        console.log(`[updateQuantity] Flash Sale SKU ${sku.id} - Giới hạn deal: ${priceResultsForUpdate.flashSaleInfo.quantity}, Đã bán: ${soldForThisFlashSaleItem}, Còn lại: ${remainingFlashStock}`);


        // SỬA ĐỔI LOGIC NÀY TRONG updateQuantity để khớp với getCart và addToCart
        // Nếu số lượng MỚI muốn cập nhật (quantity) lớn hơn số deal Flash Sale CÒN LẠI (remainingFlashStock)
        if (quantity > remainingFlashStock) { 
          flashNotice =
            (flashNotice ? flashNotice + " " : "") +
            `Chỉ còn ${remainingFlashStock} suất Flash Sale cho sản phẩm này. Toàn bộ sản phẩm này sẽ được tính giá gốc.`;
          flashViolated = true;
          console.log(`[updateQuantity] VI PHẠM: Vượt giới hạn tổng deal Flash Sale. flashNotice: ${flashNotice}`);
        }

        if (flashViolated) { // Nếu có bất kỳ vi phạm nào, giá sẽ được revert về gốc
          finalPrice = sku.originalPrice || sku.price;
          finalPrice = sku.originalPrice || sku.price; // Đảm bảo gán lại giá gốc
          originalPriceForDisplay = sku.originalPrice || sku.price;
          console.log(`[updateQuantity] Giá sản phẩm ${sku.id} đã được revert về giá gốc do vi phạm Flash Sale. Final Price: ${finalPrice}`);
        }

      } else {
        // If not in Flash Sale Item, apply Category Deal if any
        finalPrice = priceResultsForUpdate.price;
        originalPriceForDisplay = priceResultsForUpdate.originalPrice;
        console.log(`[updateQuantity] SKU ${sku.id} không nằm trong Flash Sale loại ITEM hoặc Flash Sale đã hết hạn/không hoạt động. Áp dụng giá từ Category Deal (nếu có). Final Price: ${finalPrice}`);
      }

      item.quantity = quantity;
      await item.save();
      console.log(`[updateQuantity] Cập nhật số lượng CartItem ${item.id} thành ${quantity}.`);


      // Return updated item with new price info for immediate UI update
      const isFlashSaleApplied = (flashNotice === "" && finalPrice < originalPriceForDisplay);
      console.log(`[updateQuantity] SKU ${sku.id} - Giá cuối cùng: ${finalPrice}, Giá gốc hiển thị: ${originalPriceForDisplay}, Thông báo Flash: "${flashNotice}", Áp dụng Flash Sale: ${isFlashSaleApplied}`);


      return res.status(200).json({
        message: "Cập nhật số lượng thành công",
        flashNotice: flashNotice, // Include flashNotice in the response
        item: {
          id: item.id,
          skuId: sku.id,
          productName: sku.product?.name || "",
          productSlug: sku.product?.slug || "",
          image:
            sku.ProductMedia?.[0]?.mediaUrl || sku.product?.thumbnail || null,
          quantity: item.quantity,
          isSelected: item.isSelected,
          stock: sku.stock || 0,
          variantValues: (sku.variantValues || []).map((v) => ({
            variant: v.variantValue?.variant?.name,
            value: v.variantValue?.value,
          })),
          originalPrice: originalPriceForDisplay,
          price: finalPrice,
          finalPrice: finalPrice,
          lineTotal: finalPrice * item.quantity,
          flashSaleInfo: priceResultsForUpdate.flashSaleInfo, // Use the updated flashSaleInfo from helper
          isFlashSaleApplied: isFlashSaleApplied,
        },
      });
    } catch (error) {
      console.error("Lỗi cập nhật số lượng:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async updateSelected(req, res) {
    try {
      const userId = req.user.id;
      const { cartItemId, isSelected } = req.body;
      console.log(`--- [updateSelected] Bắt đầu cập nhật trạng thái chọn cho userId: ${userId}, cartItemId: ${cartItemId}, isSelected: ${isSelected} ---`);


      if (typeof isSelected !== "boolean") {
        console.log(`[updateSelected] Lỗi: isSelected phải là kiểu boolean.`);
        return res
          .status(400)
          .json({ message: "isSelected phải là kiểu boolean" });
      }

      const item = await CartItem.findOne({
        where: { id: cartItemId },
        include: [{ model: Cart, where: { userId } }],
      });

      if (!item) {
        console.log(`[updateSelected] Lỗi: Không tìm thấy sản phẩm trong giỏ hàng với cartItemId: ${cartItemId}`);
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
      }

      item.isSelected = isSelected;
      await item.save();
      console.log(`[updateSelected] Cập nhật trạng thái chọn của CartItem ${item.id} thành ${isSelected}.`);


      return res
        .status(200)
        .json({ message: "Cập nhật trạng thái chọn thành công", item });
    } catch (error) {
      console.error("Lỗi update isSelected:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async deleteItem(req, res) {
    try {
      const userId = req.user.id;
      const cartItemId = req.params.id;
      console.log(`--- [deleteItem] Bắt đầu xóa sản phẩm khỏi giỏ hàng cho userId: ${userId}, cartItemId: ${cartItemId} ---`);


      if (!cartItemId) {
        console.log(`[deleteItem] Lỗi: cartItemId không hợp lệ.`);
        return res.status(400).json({ message: "cartItemId không hợp lệ" });
      }

      const item = await CartItem.findOne({
        where: { id: cartItemId },
        include: [{ model: Cart, where: { userId } }],
      });

      if (!item) {
        console.log(`[deleteItem] Lỗi: Không tìm thấy sản phẩm trong giỏ hàng với cartItemId: ${cartItemId}`);
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
      }

      await item.destroy();
      console.log(`[deleteItem] Xóa CartItem ${item.id} thành công.`);
      return res
        .status(200)
        .json({ message: "Xóa sản phẩm khỏi giỏ hàng thành công" });
    } catch (error) {
      console.error("Lỗi xóa sản phẩm giỏ hàng:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async deleteMultiple(req, res) {
    try {
      const userId = req.user.id;
      const { cartItemIds } = req.body;
      console.log(`--- [deleteMultiple] Bắt đầu xóa nhiều sản phẩm khỏi giỏ hàng cho userId: ${userId}, cartItemIds: ${cartItemIds} ---`);


      if (!Array.isArray(cartItemIds) || cartItemIds.length === 0) {
        console.log(`[deleteMultiple] Lỗi: cartItemIds không hợp lệ.`);
        return res
          .status(400)
          .json({ message: "cartItemIds phải là mảng chứa ít nhất 1 phần tử" });
      }

      const items = await CartItem.findAll({
        where: { id: cartItemIds },
        include: [{ model: Cart, where: { userId } }],
      });

      if (items.length === 0) {
        console.log(`[deleteMultiple] Không tìm thấy sản phẩm nào phù hợp để xóa.`);
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm nào phù hợp để xóa" });
      }

      const destroyedCount = await CartItem.destroy({
        where: { id: cartItemIds },
      });
      console.log(`[deleteMultiple] Xóa thành công ${destroyedCount} sản phẩm khỏi giỏ hàng.`);


      return res.status(200).json({
        message: `Xóa thành công ${destroyedCount} sản phẩm khỏi giỏ hàng`,
      });
    } catch (error) {
      console.error("Lỗi xóa nhiều sản phẩm giỏ hàng:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = CartController;