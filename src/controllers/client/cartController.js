const { Cart, CartItem, Sku, Product, ProductMedia, SkuVariantValue, VariantValue, Variant } = require('../../models');

class CartController {
  static async addToCart(req, res) {
    try {
      const userId = req.user.id;
      const { skuId, quantity = 1 } = req.body;

      // Tìm cart theo user
      let cart = await Cart.findOne({ where: { userId } });
      if (!cart) {
        cart = await Cart.create({ userId });
      }

      // Kiểm tra đã có item chưa
      const existingItem = await CartItem.findOne({
        where: { cartId: cart.id, skuId }
      });

      if (existingItem) {
        existingItem.quantity += quantity;
        await existingItem.save();
      } else {
        const sku = await Sku.findByPk(skuId);
        if (!sku) return res.status(404).json({ message: 'Không tìm thấy SKU' });

        // ✅ Tính finalPrice nếu không có sẵn
        let finalPrice = sku.finalPrice;
        if (finalPrice == null) {
          if (sku.discountType === 'percentage') {
            finalPrice = sku.price - (sku.price * sku.discountValue / 100);
          } else if (sku.discountType === 'fixed') {
            finalPrice = sku.price - sku.discountValue;
          } else {
            finalPrice = sku.price; // Không giảm giá
          }
        }

        // Bảo vệ tránh lỗi kiểu dữ liệu
        if (finalPrice == null || isNaN(finalPrice)) {
          return res.status(400).json({ message: 'Không thể xác định finalPrice của sản phẩm' });
        }

        await CartItem.create({
          cartId: cart.id,
          skuId,
          quantity,
          price: sku.price,
          finalPrice,
          isSelected: true
        });
      }

      res.status(200).json({ message: 'Thêm vào giỏ hàng thành công' });
    } catch (error) {
      console.error('Lỗi thêm vào giỏ hàng:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
  static async getCart(req, res) {
    try {
      const userId = req.user.id;

      const cart = await Cart.findOne({
        where: { userId },
        include: [{
          model: CartItem,
          include: [
            {
              model: Sku,
              include: [
                {
                  model: Product,
                  as: 'product',
                  attributes: ['name', 'thumbnail']
                },
                {
                  model: ProductMedia,
                  as: 'media',
                  attributes: ['mediaUrl']
                },
                {
                  model: SkuVariantValue,
                  as: 'variantValues',
                  include: [{
                    model: VariantValue,
                    as: 'variantValue',
                    include: [{
                      model: Variant,
                      as: 'variant',
                      attributes: ['name']
                    }]
                  }]
                }
              ]
            }
          ]
        }]
      });

      if (!cart) {
        return res.status(200).json({ cartItems: [] });
      }

      // Format lại dữ liệu nếu cần
      const formattedItems = cart.CartItems.map(item => {
  const sku = item.Sku;
  const product = sku.product;
  const image = sku.media?.[0]?.mediaUrl || product?.thumbnail || null;

  const variantValues = (sku.variantValues || []).map(v => ({
    variant: v.variantValue?.variant?.name,
    value: v.variantValue?.value,
    variantType: v.variantValue?.variant?.type,
    colorCode: v.variantValue?.colorCode || null,
    imageUrl: v.variantValue?.imageUrl || null
  }));

  return {
    id: item.id,
    skuId: item.skuId,
    productName: product?.name || '',
    image,
    quantity: item.quantity,
    price: item.price,
    finalPrice: item.finalPrice,
    isSelected: item.isSelected,
    variantValues
  };
});


      res.status(200).json({ cartItems: formattedItems });
    } catch (error) {
      console.error('Lỗi lấy giỏ hàng:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
static async updateQuantity(req, res) {
  try {
    const userId = req.user.id;
    const { cartItemId, quantity } = req.body;

    if (!cartItemId || quantity < 1) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }

    const item = await CartItem.findOne({
      where: { id: cartItemId },
      include: [{ model: Cart, where: { userId } }],
    });

    if (!item) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
    }

    item.quantity = quantity;
    await item.save();

    res.status(200).json({ message: 'Cập nhật số lượng thành công', item });
  } catch (error) {
    console.error('Lỗi cập nhật số lượng:', error);
    res.status(500).json({ message: 'Lỗi server' });
  }
}

}

module.exports = CartController;
