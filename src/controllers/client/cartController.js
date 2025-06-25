const { Cart, CartItem, Sku,FlashSaleItem,Order, Product,FlashSale,OrderItem, ProductMedia, SkuVariantValue, VariantValue, Variant } = require('../../models');
const { Sequelize, Op } = require("sequelize");

class CartController {
static async addToCart(req, res) {
  try {
    const userId = req.user.id;
    const { skuId, quantity = 1 } = req.body;

    /* -------------------- 1. Kiểm tra SKU -------------------- */
    const sku = await Sku.findByPk(skuId);
    if (!sku) {
      return res.status(404).json({ message: 'Không tìm thấy phiên bản sản phẩm này.' });
    }
    if ((sku.stock || 0) <= 0) {
      return res.status(400).json({ message: 'Sản phẩm này đã hết hàng.' });
    }

    /* -------------------- 2. Tìm / tạo giỏ ------------------- */
    const [cart] = await Cart.findOrCreate({
      where: { userId },
      defaults: { userId }
    });

    const existingItem = await CartItem.findOne({
      where: { cartId: cart.id, skuId }
    });
    const currentQty = existingItem?.quantity || 0;

    /* -------------------- 3. Thông tin Flash-Sale ------------- */
    const flashSaleItem = await FlashSaleItem.findOne({
      where: { skuId },
      include: [
        {
          model: FlashSale,
          as: 'flashSale',
          where: {
            startTime: { [Op.lte]: new Date() },
            endTime:   { [Op.gte]: new Date() },
            isActive:  true
          }
        }
      ]
    });

    let flashSaleLimit     = Infinity;   // số lượng tối đa / user
    let isInFlashSale      = false;
    let previousOrderedQty = 0;          // đã mua trước đó (đơn KHÔNG huỷ)

    if (flashSaleItem?.maxPerUser > 0) {
      isInFlashSale  = true;
      flashSaleLimit = flashSaleItem.maxPerUser;

      // tổng qty (đã đặt) của user cho SKU này trong Flash-Sale đang chạy
      previousOrderedQty =
        (await OrderItem.sum('quantity', {
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
              attributes: [],      // không lấy order.*, chỉ dùng join
              required: true
            }
          ]
        })) || 0;
    }

    /* -------------------- 4. Tính tổng sau khi thêm ------------ */
    const totalQty         = currentQty + quantity;            // trên cart
    const totalWithOrdered = totalQty + previousOrderedQty;    // + đơn trước

    // KHÔNG chặn – chỉ ghi nhận cảnh báo nếu vượt giới hạn
    let flashNotice = '';
   // CartController.addToCart
if (isInFlashSale && totalWithOrdered > flashSaleLimit) {
  flashNotice = `Bạn đã vượt giới hạn Flash-Sale (${flashSaleLimit}). `
              + `Toàn bộ sản phẩm sẽ được tính **giá gốc**.`;
}


    /* -------------------- 5. Lưu / cập nhật CartItem ---------- */
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

    /* -------------------- 6. Phản hồi ------------------------- */
    return res.status(200).json({
      message: 'Đã thêm vào giỏ hàng thành công.',
      flashNotice          // chuỗi rỗng nếu chưa vượt giới hạn
    });
  } catch (error) {
    console.error('Lỗi thêm vào giỏ hàng:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}









// controllers/CartController.js
static async getCart(req, res) {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOne({
      where: { userId },
      include: [
        {
          model: CartItem,
          include: [
            {
              model: Sku,
              include: [
                { model: Product,        as: 'product',       attributes: ['name', 'slug', 'thumbnail'] },
                { model: ProductMedia,   as: 'ProductMedia',  attributes: ['mediaUrl'] },

                // biến thể (màu, dung lượng…)
                {
                  model: SkuVariantValue,
                  as   : 'variantValues',
                  include: [
                    {
                      model: VariantValue,
                      as   : 'variantValue',
                      include: [{ model: Variant, as: 'variant', attributes: ['name'] }]
                    }
                  ]
                },

                // Flash-sale đang hoạt động (nếu có)
                {
                  model  : FlashSaleItem,
                  as     : 'flashSaleSkus',
                  required : false,
                  separate : true,
                  include  : [
                    {
                      model: FlashSale,
                      as   : 'flashSale',
                      where: {
                        startTime: { [Op.lte]: new Date() },
                        endTime  : { [Op.gte]: new Date() },
                        isActive : true
                      },
                      required: true
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    if (!cart || !cart.CartItems) {
      return res.status(200).json({ cartItems: [] });
    }

    /* ----- 2. Chuẩn hoá từng CartItem ----- */
    const formattedItems = await Promise.all(
      cart.CartItems.map(async (ci) => {
        const sku     = ci.Sku;
        const product = sku.product;

        /* ===== Thông tin flash-sale (nếu có) ===== */
        const flashItem   = (sku.flashSaleSkus || []).find((f) => f.flashSale);
        const inFlashSale = !!flashItem;
        const flashPrice  = flashItem?.salePrice;
        const flashLimit  = flashItem?.maxPerUser ?? Infinity;

        /* ===== Qty đã đặt ở những đơn KHÔNG huỷ ===== */
        let orderedQty = 0;
        if (inFlashSale) {
          const orderIds = await Order.findAll({
            attributes: ['id'],
            where : { userId, status: { [Op.ne]: 'cancelled' } },
            raw   : true
          }).then((os) => os.map((o) => o.id));

          orderedQty =
            (await OrderItem.sum('quantity', {
              where: {
                skuId      : sku.id,
                flashSaleId: flashItem.flashSaleId,
                orderId    : { [Op.in]: orderIds }
              }
            })) || 0;
        }

        /* ===== Tính giá =====
           Ưu tiên sku.price, rỗng thì dùng originalPrice */
        const normalUnit = sku.price || sku.originalPrice || 0;
        let   finalUnit  = normalUnit;

        if (inFlashSale && flashPrice > 0) {
          const remainFS = Math.max(0, flashLimit - orderedQty);

          // Chỉ khi toàn bộ qty nằm trong ngưỡng => giá flash
          if (remainFS >= ci.quantity) {
            finalUnit = flashPrice;
          }
          // Nếu đã vượt/hết ngưỡng ⇒ giữ giá gốc (finalUnit = normalUnit)
        }

        /* ===== Kết quả gửi về FE ===== */
        return {
          id           : ci.id,
          skuId        : sku.id,
          productName  : product?.name || '',
          productSlug  : product?.slug || '',
          image        : sku.ProductMedia?.[0]?.mediaUrl || product?.thumbnail || null,

          quantity     : ci.quantity,
          isSelected   : ci.isSelected,
          stock        : sku.stock || 0,

          variantValues: (sku.variantValues || []).map((v) => ({
            variant: v.variantValue?.variant?.name,
            value  : v.variantValue?.value
          })),
originalPrice: sku.originalPrice || 0, // luôn có giá gốc
          price        : normalUnit,          // giá niêm yết (để gạch xoá)
          finalPrice   : finalUnit,           // đơn giá thực tế
          lineTotal    : finalUnit * ci.quantity,

          flashSaleId  : flashItem?.flashSaleId || null
        };
      })
    );

    /* ----- 3. Trả về client ----- */
    return res.status(200).json({ cartItems: formattedItems });
  } catch (err) {
    console.error('Lỗi lấy giỏ hàng:', err);
    return res.status(500).json({ message: 'Lỗi server' });
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