const { Cart, CartItem, Sku,FlashSaleItem,Order, Product,FlashSale,OrderItem, ProductMedia, SkuVariantValue, VariantValue, Variant } = require('../../models');
const { Sequelize, Op } = require("sequelize");

class CartController {
static async addToCart(req, res) {
  try {
    const userId = req.user.id;
    const { skuId, quantity = 1 } = req.body;

    const sku = await Sku.findByPk(skuId);
    if (!sku) return res.status(404).json({ message: 'Không tìm thấy phiên bản sản phẩm này.' });

    if ((sku.stock || 0) <= 0) {
      return res.status(400).json({ message: 'Sản phẩm này đã hết hàng.' });
    }

    const [cart] = await Cart.findOrCreate({
      where: { userId },
      defaults: { userId }
    });

    const existingItem = await CartItem.findOne({ where: { cartId: cart.id, skuId } });
    const currentQty = existingItem?.quantity || 0;

    const flashSaleItem = await FlashSaleItem.findOne({
      where: { skuId },
      include: [{
        model: FlashSale,
        as: 'flashSale',
        where: {
          startTime: { [Op.lte]: new Date() },
          endTime: { [Op.gte]: new Date() },
          isActive: true
        }
      }]
    });

    let flashSaleLimit = Infinity;
    let isInFlashSale = false;
    let previousOrderedQty = 0;

    if (flashSaleItem?.maxPerUser > 0) {
      flashSaleLimit = flashSaleItem.maxPerUser;
      isInFlashSale = true;

      // ✅ JOIN trực tiếp Order trong OrderItem
      previousOrderedQty = await OrderItem.sum('quantity', {
  where: {
    skuId,
    flashSaleId: flashSaleItem.flashSaleId
  },
  include: [
    {
      model: Order,
      as: 'order',
      where: {
        userId,
        status: { [Op.ne]: 'cancelled' }
      },
      attributes: [], // 👈 thêm dòng này để KHÔNG SELECT order.*
      required: true
    }
  ]
}) || 0;

    }

    const totalQty = currentQty + quantity;
    const totalWithOrdered = totalQty + previousOrderedQty;

    if (isInFlashSale && totalWithOrdered > flashSaleLimit) {
      return res.status(400).json({
        message: `Bạn đã mua quá giới hạn Flash Sale (${flashSaleLimit}). Không thể thêm sản phẩm vào giỏ hàng.`
      });
    }

    if (existingItem) {
      existingItem.quantity = totalQty;
      await existingItem.save();
    } else {
      await CartItem.create({
        cartId: cart.id,
        skuId,
        quantity,
        isSelected: true
      });
    }

    return res.status(200).json({ message: 'Đã thêm vào giỏ hàng thành công.' });
  } catch (error) {
    console.error('Lỗi thêm vào giỏ hàng:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}








 static async getCart(req, res) {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({
      where: { userId },
      include: [{
        model: CartItem,
        include: [{
          model: Sku,
          include: [
            { model: Product, as: "product", attributes: ["name", "slug", "thumbnail"] },
            { model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl"] },
            {
              model: SkuVariantValue, as: "variantValues",
              include: [{
                model: VariantValue, as: "variantValue",
                include: [{ model: Variant, as: "variant", attributes: ["name"] }]
              }]
            },
            {
              model: FlashSaleItem,
              as: "flashSaleSkus",
              required: false,
              separate: true,
              include: [{
                model: FlashSale,
                as: "flashSale",
                where: {
                  startTime: { [Op.lte]: new Date() },
                  endTime: { [Op.gte]: new Date() },
                  isActive: true
                },
                required: true
              }]
            }
          ]
        }]
      }]
    });

    if (!cart || !cart.CartItems) {
      return res.status(200).json({ cartItems: [] });
    }

    const formattedItems = await Promise.all(cart.CartItems.map(async (item) => {
      const sku = item.Sku;
      const product = sku.product;
      const image = sku.ProductMedia?.[0]?.mediaUrl || product?.thumbnail || null;

      const variantValues = (sku.variantValues || []).map((v) => ({
        variant: v.variantValue?.variant?.name,
        value: v.variantValue?.value,
      }));

      const flashSaleItem = (sku.flashSaleSkus || []).find(f => f.flashSale);
      const isInFlashSale = !!flashSaleItem;
      const flashSalePrice = flashSaleItem?.salePrice;
      const flashSaleLimit = flashSaleItem?.maxPerUser || Infinity;

      let previousOrderedQty = 0;
      if (isInFlashSale) {
        const orderIds = await Order.findAll({
          attributes: ['id'],
          where: { userId, status: { [Op.ne]: 'cancelled' } },
          raw: true
        }).then(orders => orders.map(o => o.id));

        previousOrderedQty = await OrderItem.sum('quantity', {
          where: {
            skuId: sku.id,
            flashSaleId: flashSaleItem.flashSaleId,
            orderId: { [Op.in]: orderIds }
          }
        }) || 0;
      }

      const totalWithOrdered = item.quantity + previousOrderedQty;

   let finalPrice = sku.originalPrice || sku.price || 0;

if (isInFlashSale && flashSalePrice > 0) {
  const remainingFlashQty = Math.max(0, flashSaleLimit - previousOrderedQty);
console.log(`[getCart] skuId: ${sku.id}, ordered: ${previousOrderedQty}, flashLimit: ${flashSaleLimit}, quantity: ${item.quantity}, remainingFlashQty: ${remainingFlashQty}`);

  if (remainingFlashQty >= item.quantity) {
    // Tất cả nằm trong giới hạn → flash sale
    finalPrice = flashSalePrice;
  } else if (remainingFlashQty <= 0) {
    
    // Vượt hoàn toàn → giá gốc
    finalPrice = sku.originalPrice || sku.price || 0;
  } else {
    // Một phần flash, một phần gốc → chia trung bình
    const flashPart = remainingFlashQty * flashSalePrice;
    const normalPart = (item.quantity - remainingFlashQty) * (sku.originalPrice || sku.price || 0);
    console.log(`[getCart] skuId: ${sku.id}, ordered: ${previousOrderedQty}, flashLimit: ${flashSaleLimit}, quantity: ${item.quantity}, remainingFlashQty: ${remainingFlashQty}`);

    finalPrice = Math.round((flashPart + normalPart) / item.quantity);
  }
}

      return {
        id: item.id,
        skuId: item.skuId,
        productName: product?.name || "",
        productSlug: product?.slug || "",
        image,
        quantity: item.quantity,
        isSelected: item.isSelected,
        stock: sku.stock || 0,
        variantValues,
        price: sku.originalPrice || 0,
        finalPrice,
        flashSaleId: flashSaleItem?.flashSaleId || null
      };
    }));

    res.status(200).json({ cartItems: formattedItems });
  } catch (error) {
    console.error("Lỗi lấy giỏ hàng:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
}







    static async updateQuantity(req, res) {
  try {
    const userId = req.user.id;
    const { cartItemId, quantity } = req.body;

    if (!cartItemId || !quantity || quantity < 1) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }

    const item = await CartItem.findOne({
      where: { id: cartItemId },
      include: [
        {
          model: Cart,
          where: { userId }
        },
        {
          model: Sku,
          include: [
            {
              model: FlashSaleItem,
              as: 'flashSaleSkus',
              required: false,
              include: [
                {
                  model: FlashSale,
                  as: 'flashSale',
                  where: {
                    startTime: { [Op.lte]: new Date() },
                    endTime: { [Op.gte]: new Date() },
                    isActive: true,
                  },
                  required: true
                }
              ]
            }
          ],
          attributes: ['stock']
        }
      ]
    });

    if (!item) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
    }

    const availableStock = item.Sku.stock || 0;
    if (quantity > availableStock) {
      return res.status(400).json({
        message: `Chỉ còn ${availableStock} sản phẩm trong kho.`
      });
    }

    item.quantity = quantity;
    await item.save();

    // Kiểm tra giới hạn Flash Sale
    const flashSaleItem = item.Sku.flashSaleSkus?.[0];
    const maxPerUser = flashSaleItem?.maxPerUser || Infinity;

    let message = 'Cập nhật số lượng thành công';
    if (quantity > maxPerUser) {
      message += `. Đã vượt giới hạn Flash Sale (${maxPerUser}), giá sẽ được tính theo giá gốc.`;
    }

    return res.status(200).json({ message, item });
  } catch (error) {
    console.error('Lỗi cập nhật số lượng:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

static async updateSelected(req, res) {
  try {
    const userId = req.user.id;
    const { cartItemId, isSelected } = req.body;

    if (typeof isSelected !== 'boolean') {
      return res.status(400).json({ message: 'isSelected phải là kiểu boolean' });
    }

    const item = await CartItem.findOne({
      where: { id: cartItemId },
      include: [{ model: Cart, where: { userId } }]
    });

    if (!item) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
    }

    item.isSelected = isSelected;
    await item.save();

    return res.status(200).json({ message: 'Cập nhật trạng thái chọn thành công', item });
  } catch (error) {
    console.error('Lỗi update isSelected:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

    static async deleteItem(req, res) {
        try {
            const userId = req.user.id;
            const cartItemId = req.params.id;

            if (!cartItemId) {
                return res.status(400).json({ message: 'cartItemId không hợp lệ' });
            }

            const item = await CartItem.findOne({
                where: { id: cartItemId },
                include: [{ model: Cart, where: { userId } }]
            });

            if (!item) {
                return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
            }

            await item.destroy();
            return res.status(200).json({ message: 'Xóa sản phẩm khỏi giỏ hàng thành công' });
        } catch (error) {
            console.error('Lỗi xóa sản phẩm giỏ hàng:', error);
            return res.status(500).json({ message: 'Lỗi server' });
        }
    }

    static async deleteMultiple(req, res) {
        try {
            const userId = req.user.id;
            const { cartItemIds } = req.body;
            if (!Array.isArray(cartItemIds) || cartItemIds.length === 0) {
                return res.status(400).json({ message: 'cartItemIds phải là mảng chứa ít nhất 1 phần tử' });
            }
            
            const items = await CartItem.findAll({
                where: { id: cartItemIds },
                include: [{ model: Cart, where: { userId } }]
            });

            if (items.length === 0) {
                return res.status(404).json({ message: 'Không tìm thấy sản phẩm nào phù hợp để xóa' });
            }
            
            const destroyedCount = await CartItem.destroy({
                where: { id: cartItemIds }
            });

            return res.status(200).json({ 
                message: `Xóa thành công ${destroyedCount} sản phẩm khỏi giỏ hàng` 
            });
        } catch (error) {
            console.error('Lỗi xóa nhiều sản phẩm giỏ hàng:', error);
            return res.status(500).json({ message: 'Lỗi server' });
        }
    }
}

module.exports = CartController;