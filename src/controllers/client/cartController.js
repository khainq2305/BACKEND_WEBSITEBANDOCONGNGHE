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
} = require("../../models");
const { Sequelize, Op } = require("sequelize");
const { processSkuPrices } = require("../../helpers/priceHelper");

class CartController {
  static async addToCart(req, res) {
    try {
      const userId = req.user.id;
      const { skuId, quantity = 1 } = req.body;

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
        console.log(
          `[addToCart] Lỗi: Sản phẩm SKU ${skuId} đã hết hàng (stock: ${sku.stock}).`
        );
        return res.status(400).json({ message: "Sản phẩm này đã hết hàng." });
      }
      console.log(`[addToCart] SKU ${skuId} (stock: ${sku.stock}) hợp lệ.`);

      const [cart, createdCart] = await Cart.findOrCreate({
        where: { userId },
        defaults: { userId },
      });
      console.log(
        `[addToCart] Giỏ hàng cho userId ${userId} đã ${
          createdCart ? "được tạo mới" : "tồn tại"
        } (cartId: ${cart.id}).`
      );

      const existingItem = await CartItem.findOne({
        where: { cartId: cart.id, skuId },
      });
      const currentQty = existingItem?.quantity || 0;
      console.log(
        `[addToCart] Sản phẩm SKU ${skuId} hiện có trong giỏ hàng: ${currentQty} sản phẩm.`
      );

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
      console.log(
        `[addToCart] Tìm thấy ${allActiveFlashSales.length} tổng số Flash Sale đang hoạt động.`
      );

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
          const soldForThisItem =
            (await OrderItem.sum("quantity", {
              where: {
                flashSaleId: saleId,
                skuId: itemSkuId,
              },
              include: [
                {
                  model: Order,
                  as: "order",
                  where: {
                    status: { [Op.in]: ["completed", "delivered"] },
                  },
                  attributes: [],
                  required: true,
                },
              ],
            })) || 0;

          const isSoldOutForThisItem =
            flashLimit != null && soldForThisItem >= flashLimit;

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

      const skuDataForHelper = {
        ...sku.toJSON(),
        Product: { category: { id: sku.product?.categoryId } },
      };
      const priceResults = processSkuPrices(
        skuDataForHelper,
        allActiveFlashSaleItemsMap,
        allActiveCategoryDealsMap
      );

      let flashNotice = "";
      let flashViolated = false;
      let finalPrice = priceResults.price;
      let originalPriceForDisplay = priceResults.originalPrice;

      if (
        priceResults.flashSaleInfo &&
        priceResults.flashSaleInfo.type === "item"
      ) {
        const flashSaleLimitPerUser =
          priceResults.flashSaleInfo.maxPerUser || Infinity;

        const userOrders = await Order.findAll({
          attributes: ["id"],
          where: {
            userId,
            status: { [Op.ne]: "cancelled" },
          },
        });

        const userOrderIds = userOrders.map((order) => order.id);

        const previousOrderedQty =
          (await OrderItem.sum("quantity", {
            where: {
              skuId: sku.id,
              flashSaleId: priceResults.flashSaleInfo.flashSaleId,
              orderId: { [Op.in]: userOrderIds },
            },
          })) || 0;

        const totalQuantityIncludingCart =
          currentQty + quantity + previousOrderedQty;

        const flashStockLimit = priceResults.flashSaleInfo.quantity;
        const flashSold = priceResults.flashSaleInfo.soldQuantity;
        const remainingFlashStock = flashStockLimit - flashSold;

        if (totalQuantityIncludingCart > flashSaleLimitPerUser) {
          flashNotice = `Flash Sale áp dụng tối đa ${flashSaleLimitPerUser} sản phẩm/người. Phần vượt giới hạn sẽ tính theo giá gốc.`;
          flashViolated = true;
        }

        if (currentQty + quantity > remainingFlashStock) {
          flashNotice +=
            (flashNotice ? " " : "") +
            `Chỉ còn ${remainingFlashStock} suất Flash Sale cho sản phẩm này. Phần vượt sẽ tính giá gốc.`;
          flashViolated = true;
        }

        if (flashViolated) {
        }
      } else {
      }

      const totalQtyAfterAdding = currentQty + quantity;
      if (totalQtyAfterAdding > (sku.stock || 0)) {
        return res
          .status(400)
          .json({ message: `Chỉ còn ${sku.stock || 0} sản phẩm trong kho.` });
      }

      if (existingItem) {
        existingItem.quantity = totalQtyAfterAdding;
        await existingItem.save();
      } else {
        await CartItem.create({
          cartId: cart.id,
          skuId,
          quantity: quantity,
          isSelected: true,
        });
      }

      return res.status(200).json({
        message: "Đã thêm vào giỏ hàng thành công.",
        flashNotice,
      });
    } catch (error) {
      console.error("Lỗi thêm vào giỏ hàng:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async getCart(req, res) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(200).json({
          cartItems: [],
          totalAmount: 0,
          rewardPoints: 0,
          payablePrice: 0,
          couponDiscount: 0,
          pointInfo: {
            userPointBalance: 0,
            exchangeRate: 10,
            minPointRequired: 20,
            canUsePoints: false,
            maxUsablePoints: 0,
            pointDiscountAmount: 0,
          },
        });
      }

      const userId = req.user.id;
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

          const soldForThisItem =
            (await OrderItem.sum("quantity", {
              where: { flashSaleId: saleId, skuId: skuIdInFsi },
              include: [
                {
                  model: Order,
                  as: "order",
                  where: { status: { [Op.in]: ["completed", "delivered"] } },
                  required: true,
                  attributes: [],
                },
              ],
            })) || 0;

          const isSoldOutForThisItem =
            flashLimit != null && soldForThisItem >= flashLimit;

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
                      "categoryId",
                    ],
                  },
                  {
                    model: ProductMedia,
                    as: "ProductMedia",
                    attributes: ["mediaUrl"],
                  },
                  {
                    model: SkuVariantValue,
                    as: "variantValues",
                    include: [
                      {
                        model: VariantValue,
                        as: "variantValue",
                        include: [
                          {
                            model: Variant,
                            as: "variant",
                            attributes: ["name"],
                          },
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
        return res.status(200).json({
          cartItems: [],
          totalAmount: 0,
          rewardPoints: 0,
          payablePrice: 0,
          couponDiscount: 0,
          pointInfo: {
            userPointBalance: 0,
            exchangeRate: 10,
            minPointRequired: 20,
            canUsePoints: false,
            maxUsablePoints: 0,
            pointDiscountAmount: 0,
          },
        });
      }

      const formattedItems = await Promise.all(
        cart.CartItems.map(async (ci) => {
          const sku = ci.Sku;
          const product = sku.product;
          const basePrice = sku.originalPrice || sku.price;

          const skuDataForHelper = {
            ...sku.toJSON(),
            Product: { category: { id: product?.categoryId } },
          };
          const priceResults = processSkuPrices(
            skuDataForHelper,
            allActiveFlashSaleItemsMap,
            allActiveCategoryDealsMap
          );

          const flashInfo = priceResults.flashSaleInfo;
          const unitFlash =
            priceResults.price && priceResults.price > 0
              ? priceResults.price
              : basePrice;

          let previousOrderedQty = 0;
          if (flashInfo?.type === "item") {
            const userOrders = await Order.findAll({
              attributes: ["id"],
              where: { userId, status: { [Op.ne]: "cancelled" } },
            });
            const userOrderIds = userOrders.map((o) => o.id);

            previousOrderedQty =
              (await OrderItem.sum("quantity", {
                where: {
                  skuId: sku.id,
                  flashSaleId: flashInfo.flashSaleId,
                  orderId: { [Op.in]: userOrderIds },
                },
              })) || 0;
          }

          let qtyFlash = 0;
          let qtyBase = ci.quantity;
          let flashNotice = "";
          let isFlashSaleApplied = false;

          if (flashInfo?.type === "item") {
            const perUserLimit = flashInfo.maxPerUser ?? Infinity;
            const perUserLeft = Math.max(0, perUserLimit - previousOrderedQty);
            const eventRemaining =
              (flashInfo.quantity ?? Infinity) - (flashInfo.soldQuantity ?? 0);

            qtyFlash = Math.min(ci.quantity, perUserLeft, eventRemaining);
            qtyBase = ci.quantity - qtyFlash;

            if (qtyBase > 0) {
              flashNotice = `Flash Sale áp dụng tối đa ${qtyFlash} sản phẩm. Phần vượt giới hạn sẽ áp dụng giá gốc.`;
            }

            isFlashSaleApplied = qtyFlash > 0;
          } else if (flashInfo?.type === "category") {
            qtyFlash = ci.quantity;
            qtyBase = 0;
            isFlashSaleApplied = true;
          }

          const lineTotal = qtyFlash * unitFlash + qtyBase * basePrice;
          const originalPriceForDisplay = basePrice;
          const finalUnitForDisplay =
            isFlashSaleApplied && qtyBase === 0 ? unitFlash : basePrice;

          return {
            id: ci.id,
            skuId: sku.id,
            productName: product?.name || "",
            productSlug: product?.slug || "",
            image:
              sku.ProductMedia?.[0]?.mediaUrl || product?.thumbnail || null,
            quantity: ci.quantity,
            isSelected: ci.isSelected,
            stock: sku.stock || 0,
            variantValues: (sku.variantValues || []).map((v) => ({
              variant: v.variantValue?.variant?.name,
              value: v.variantValue?.value,
            })),
            originalPrice: originalPriceForDisplay,
            price: finalUnitForDisplay,
            finalPrice: finalUnitForDisplay,
            lineTotal,
            flashSaleInfo: flashInfo,
            flashNotice,
            isFlashSaleApplied,
            breakdown: { qtyFlash, unitFlash, qtyBase, unitBase: basePrice },
          };
        })
      );

      const totalAmount = formattedItems.reduce((sum, item) => {
        return sum + (item.isSelected ? item.lineTotal : 0);
      }, 0);

      const couponCode = req.query.couponCode || null;
      let discountAmount = 0;

      if (couponCode) {
        const couponRes = await couponService.applyCoupon({
          code: couponCode,
          skuIds: formattedItems
            .filter((i) => i.isSelected)
            .map((i) => i.skuId),
          orderTotal: totalAmount,
        });

        if (couponRes?.isValid && couponRes?.coupon?.discountAmount) {
          discountAmount = parseFloat(couponRes.coupon.discountAmount);
        }
      }

      const payablePrice = Math.max(0, totalAmount - discountAmount);
      const rewardPoints = Math.floor(payablePrice / 4000);

      const totalEarned =
        (await UserPoint.sum("points", {
          where: {
            userId,
            type: "earn",
            [Op.or]: [
              { expiresAt: null },
              { expiresAt: { [Op.gt]: new Date() } },
            ],
          },
        })) || 0;

      const totalSpent =
        (await UserPoint.sum("points", {
          where: { userId, type: "spend" },
        })) || 0;

      const totalRefunded =
        (await UserPoint.sum("points", {
          where: { userId, type: "refund" },
        })) || 0;

      const totalExpired =
        (await UserPoint.sum("points", {
          where: {
            userId,
            type: "expired",
            expiresAt: { [Op.lte]: new Date() },
          },
        })) || 0;

      const userPointBalance =
        totalEarned + totalRefunded - totalSpent - totalExpired;

      const exchangeRate = 10;
      const minPointRequired = 20;
      const pointLimitRatio = 0.5;

      const canUsePoints = userPointBalance >= minPointRequired;
      let maxUsablePoints = 0;
      let pointDiscountAmount = 0;

      if (canUsePoints) {
        maxUsablePoints = Math.min(
          userPointBalance,
          Math.floor((payablePrice * pointLimitRatio) / exchangeRate)
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
          pointDiscountAmount,
        },
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

      if (!cartItemId || !quantity || quantity < 1) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      }

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
                as: "flashSaleSkus",
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
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
      }

      const sku = item.Sku;
      const availableStock = sku.stock || 0;

      if (quantity > availableStock) {
        return res.status(400).json({
          message: `Chỉ còn ${availableStock} sản phẩm trong kho.`,
        });
      }

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

          const soldForThisItem =
            (await OrderItem.sum("quantity", {
              where: {
                flashSaleId: saleId,
                skuId: skuIdInFsi,
              },
              include: [
                {
                  model: Order,
                  as: "order",
                  where: {
                    status: { [Op.in]: ["completed", "delivered"] },
                  },
                  attributes: [],
                  required: true,
                },
              ],
            })) || 0;

          const isSoldOutForThisItem =
            flashLimit != null && soldForThisItem >= flashLimit;

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

      const skuDataForHelper = {
        ...sku.toJSON(),
        Product: { category: { id: sku.product?.categoryId } },
      };
      const priceResultsForUpdate = processSkuPrices(
        skuDataForHelper,
        allActiveFlashSaleItemsMap,
        allActiveCategoryDealsMap
      );

      const basePrice = sku.originalPrice || sku.price;
      const pr = priceResultsForUpdate;
      const flashInfo = pr.flashSaleInfo;
      const unitFlash = pr.price && pr.price > 0 ? pr.price : basePrice;

      let previousOrderedQty = 0;
      if (flashInfo?.type === "item") {
        const userOrders = await Order.findAll({
          attributes: ["id"],
          where: { userId, status: { [Op.ne]: "cancelled" } },
        });
        const userOrderIds = userOrders.map((o) => o.id);

        previousOrderedQty =
          (await OrderItem.sum("quantity", {
            where: {
              skuId: sku.id,
              flashSaleId: flashInfo.flashSaleId,
              orderId: { [Op.in]: userOrderIds },
            },
          })) || 0;
      }

      let qtyFlash = 0,
        qtyBase = quantity,
        flashNotice = "",
        isFlashSaleApplied = false;

      if (flashInfo?.type === "item") {
        const perUserLimit = flashInfo.maxPerUser ?? Infinity;
        const perUserLeft = Math.max(0, perUserLimit - previousOrderedQty);
        const eventRemaining =
          (flashInfo.quantity ?? Infinity) - (flashInfo.soldQuantity ?? 0);

        qtyFlash = Math.min(quantity, perUserLeft, eventRemaining);
        qtyBase = quantity - qtyFlash;

        if (qtyBase > 0) {
          flashNotice = `Flash Sale áp dụng tối đa ${qtyFlash} sản phẩm. Phần vượt giới hạn sẽ áp dụng giá gốc.`;
        }

        isFlashSaleApplied = qtyFlash > 0;
      } else if (flashInfo?.type === "category") {
        qtyFlash = quantity;
        qtyBase = 0;
        isFlashSaleApplied = true;
      }

      item.quantity = quantity;
      await item.save();

      const lineTotal = qtyFlash * unitFlash + qtyBase * basePrice;
      const originalPriceForDisplay = basePrice;
      const finalUnitForDisplay =
        isFlashSaleApplied && qtyBase === 0 ? unitFlash : basePrice;

      return res.status(200).json({
        message: "Cập nhật số lượng thành công",
        flashNotice,
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
          price: finalUnitForDisplay,
          finalPrice: finalUnitForDisplay,
          lineTotal,
          flashSaleInfo: flashInfo,
          isFlashSaleApplied,
          breakdown: { qtyFlash, unitFlash, qtyBase, unitBase: basePrice },
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

      if (typeof isSelected !== "boolean") {
        return res
          .status(400)
          .json({ message: "isSelected phải là kiểu boolean" });
      }

      const item = await CartItem.findOne({
        where: { id: cartItemId },
        include: [{ model: Cart, where: { userId } }],
      });

      if (!item) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
      }

      item.isSelected = isSelected;
      await item.save();

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

      if (!cartItemId) {
        return res.status(400).json({ message: "cartItemId không hợp lệ" });
      }

      const item = await CartItem.findOne({
        where: { id: cartItemId },
        include: [{ model: Cart, where: { userId } }],
      });

      if (!item) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm trong giỏ hàng" });
      }

      await item.destroy();

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

      if (!Array.isArray(cartItemIds) || cartItemIds.length === 0) {
       
        return res
          .status(400)
          .json({ message: "cartItemIds phải là mảng chứa ít nhất 1 phần tử" });
      }

      const items = await CartItem.findAll({
        where: { id: cartItemIds },
        include: [{ model: Cart, where: { userId } }],
      });

      if (items.length === 0) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm nào phù hợp để xóa" });
      }

      const destroyedCount = await CartItem.destroy({
        where: { id: cartItemIds },
      });

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
