const { Cart, CartItem, Sku, Product, ProductMedia, SkuVariantValue, VariantValue, Variant } = require('../../models');

class CartController {
 static async addToCart(req, res) {
  try {
    const userId = req.user.id;
    const { skuId, quantity = 1 } = req.body;

    // Bước 1: Lấy SKU và kiểm tra tồn kho hiện tại
    const sku = await Sku.findByPk(skuId);
    if (!sku) {
      return res.status(404).json({ message: 'Không tìm thấy SKU của sản phẩm.' });
    }
    const availableStock = sku.stock || 0;

    // Bước 2: Lấy hoặc tạo Cart của user
    let cart = await Cart.findOne({ where: { userId } });
    if (!cart) {
      cart = await Cart.create({ userId });
    }

    // Bước 3: Kiểm tra xem CartItem đã có sẵn chưa?
    const existingItem = await CartItem.findOne({
      where: { cartId: cart.id, skuId }
    });

    if (existingItem) {
      // Tính tổng số lượng mới nếu user thêm tiếp
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > availableStock) {
        // Nếu tổng vượt tồn kho, trả về lỗi
        return res.status(400).json({
          message: `Bạn đã có sẵn ${existingItem.quantity} sản phẩm trong giỏ. Chỉ còn ${availableStock - existingItem.quantity} sản phẩm có thể thêm.`
        });
      }
      // Nếu không vượt, cập nhật quantity
      existingItem.quantity = newQuantity;
      await existingItem.save();

    } else {
      // Chưa có trong giỏ, kiểm tra quantity lần đầu không vượt tồn kho
      if (quantity > availableStock) {
        return res.status(400).json({
          message: `Số lượng bạn chọn (${quantity}) vượt quá tồn kho hiện tại (${availableStock}).`
        });
      }
      // Nếu ok, tạo CartItem mới
      let finalPrice = sku.finalPrice;
      if (finalPrice == null) {
        if (sku.discountType === 'percentage') {
          finalPrice = sku.price - (sku.price * sku.discountValue / 100);
        } else if (sku.discountType === 'fixed') {
          finalPrice = sku.price - sku.discountValue;
        } else {
          finalPrice = sku.price;
        }
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

    return res.status(200).json({ message: 'Thêm vào giỏ hàng thành công' });
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
                as: 'ProductMedia', // ✅ Đổi đúng alias như đã khai báo
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
      const image = sku.ProductMedia?.[0]?.mediaUrl || product?.thumbnail || null;

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

      if (!cartItemId || !quantity || quantity < 1) {
        return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
      }

      
      const item = await CartItem.findOne({
        where: { id: cartItemId },
        include: [
          { model: Cart, where: { userId } },
          { model: Sku, attributes: ['stock'] } 
        ],
      });

      if (!item) {
        return res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
      }
      

      const availableStock = item.Sku.stock || 0;
      if (quantity > availableStock) {
          return res.status(400).json({
              message: `Bạn chỉ được mua tối đa ${availableStock} sản phẩm.`
          });
      }

      
      item.quantity = quantity;
      await item.save();

      res.status(200).json({ message: 'Cập nhật số lượng thành công', item });
    } catch (error) {
      console.error('Lỗi cập nhật số lượng:', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

static async deleteItem(req, res) {
  try {
    const userId = req.user.id;
    const cartItemId = req.params.id;     // ← Lấy id từ URL

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

     
      for (const item of items) {
        await item.destroy();
      }

      return res.status(200).json({ 
        message: `Xóa thành công ${items.length} sản phẩm khỏi giỏ hàng` 
      });
    } catch (error) {
      console.error('Lỗi xóa nhiều sản phẩm giỏ hàng:', error);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = CartController;
