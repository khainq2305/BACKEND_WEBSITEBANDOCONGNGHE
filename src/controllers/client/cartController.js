const { Cart, CartItem, Sku, Product, ProductMedia, SkuVariantValue, VariantValue, Variant } = require('../../models');

class CartController {
    static async addToCart(req, res) {
        try {
            const userId = req.user.id;
            const { skuId, quantity = 1 } = req.body;

            // ✅ BƯỚC 1: KIỂM TRA TỒN KHO NGAY LẬP TỨC
            const sku = await Sku.findByPk(skuId);
            if (!sku) {
                return res.status(404).json({ message: 'Không tìm thấy phiên bản sản phẩm này.' });
            }
            const availableStock = sku.stock || 0;

            // Nếu sản phẩm đã hết hàng, không cho thêm vào giỏ
            if (availableStock <= 0) {
                return res.status(400).json({ message: 'Sản phẩm này đã hết hàng và không thể thêm vào giỏ.' });
            }

            // --- Các logic còn lại giữ nguyên ---

            // Bước 2: Lấy hoặc tạo giỏ hàng cho người dùng
            const [cart] = await Cart.findOrCreate({
                where: { userId },
                defaults: { userId }
            });

            // Bước 3: Kiểm tra sản phẩm đã có trong giỏ chưa
            const existingItem = await CartItem.findOne({
                where: { cartId: cart.id, skuId }
            });

            if (existingItem) {
                // Nếu đã có, cập nhật số lượng
                const newQuantity = existingItem.quantity + quantity;
                if (newQuantity > availableStock) {
                    return res.status(400).json({
                        message: `Số lượng trong giỏ (${existingItem.quantity}) và số lượng thêm (${quantity}) vượt quá tồn kho (${availableStock}).`
                    });
                }
                existingItem.quantity = newQuantity;
                await existingItem.save();
            } else {
                // Nếu chưa có, tạo mới
                if (quantity > availableStock) {
                    return res.status(400).json({
                        message: `Số lượng bạn chọn (${quantity}) vượt quá tồn kho hiện tại (${availableStock}).`
                    });
                }
                
                const basePrice = sku.originalPrice && sku.originalPrice > 0 ? sku.originalPrice : sku.price;
                const finalPrice = sku.price && sku.price > 0 ? sku.price : sku.originalPrice;

                if (!finalPrice || finalPrice <= 0) {
                    return res.status(400).json({ message: 'Sản phẩm này hiện không có giá bán.' });
                }

                await CartItem.create({
                    cartId: cart.id,
                    skuId,
                    quantity,
                    price: basePrice,
                    finalPrice: finalPrice,
                    isSelected: true
                });
            }

            return res.status(200).json({ message: 'Thêm vào giỏ hàng thành công' });
        } catch (error) {
            console.error('Lỗi thêm vào giỏ hàng:', error);
            if (error.name === 'SequelizeValidationError') {
                const messages = error.errors.map(e => e.message).join(', ');
                return res.status(400).json({ message: `Dữ liệu không hợp lệ: ${messages}` });
            }
            return res.status(500).json({ message: 'Lỗi server' });
        }
    }

    // --- CÁC HÀM KHÁC GIỮ NGUYÊN ---

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
                                attributes: ['name', 'slug', 'thumbnail']
                            },
                            {
                                model: ProductMedia,
                                as: 'ProductMedia',
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

        if (!cart || !cart.CartItems) {
            return res.status(200).json({ cartItems: [] });
        }

        const formattedItems = cart.CartItems.map(item => {
            const sku = item.Sku;
            const product = sku.product;
            const image = sku.ProductMedia?.[0]?.mediaUrl || product?.thumbnail || null;
            const variantValues = (sku.variantValues || []).map(v => `${v.variantValue?.variant?.name}: ${v.variantValue?.value}`).join(' | ');

            return {
                id: item.id,
                skuId: item.skuId,
                productName: product?.name || '',
                productSlug: product?.slug || '',
                image,
                quantity: item.quantity,
                price: item.price,
                finalPrice: item.finalPrice,
                isSelected: item.isSelected,
                variantDisplay: variantValues,
                stock: sku.stock || 0
            };
        });

        // ✅ SỬA LẠI DÒNG NÀY ĐỂ TRẢ VỀ ĐÚNG CẤU TRÚC CHO FRONTEND
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