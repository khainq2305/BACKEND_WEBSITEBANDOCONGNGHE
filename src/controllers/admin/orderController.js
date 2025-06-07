const Order = require('../../models/order');
const User = require('../../models/userModel');
const OrderItem = require('../../models/orderItem');
const Product = require('../../models/product');
const { Op } = require('sequelize');

// Lấy danh sách đơn hàng với phân trang, lọc và tìm kiếm
exports.getAll = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status = '',
            search = ''
        } = req.query;
        const offset = (page - 1) * limit;
        const whereConditions = {};
        if (status) {
            whereConditions.status = status;
        }
        if (search) {
            whereConditions[Op.or] = [
                //search theo mã đơn hàng
                { id: { [Op.like]: `%${search}%` } },
                //search theo tên người dùng
                { '$User.fullName$': { [Op.like]: `%${search}%` } },
            ];
        }
        // Fetch các đơn hàng với điều kiện lọc, tìm kiếm và phân trang
        const { count, rows: orders } = await Order.findAndCountAll({
            where: whereConditions,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: User,
                    attributes: ['id', 'fullName', 'email', 'phone']
                }
            ]
        });

        return res.status(200).json({
            success: true,
            data: {
                orders,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(count / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Lấy chi tiết đơn hàng theo ID
exports.getById = async (req, res) => {
    try {
        const { id } = req.params;
        const Sku = require('../../models/skuModel');
        const UserAddress = require('../../models/userAddress');

        // Lấy thông tin đơn hàng theo ID
        const order = await Order.findByPk(id, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'fullName', 'email', 'phone']
                }
            ]
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        //  Lấy địa chỉ người dùng từ userAddressId
        let address = null;
        if (order.userAddressId) {
            const Ward = require('../../models/ward');
            const District = require('../../models/district');
            const Province = require('../../models/province');

            // Fetch user address bằng userAddressId
            address = await UserAddress.findByPk(order.userAddressId);

            if (address) {
                // Fetch  địa chỉ đầy đủ từ Ward, District, Province models
                const ward = await Ward.findByPk(address.wardCode);
                const district = await District.findByPk(address.districtId);
                const province = await Province.findByPk(address.provinceId);

                // tạo biến fullAddress để lưu địa chỉ đầy đủ
                address = address.toJSON(); // Convert sang JSON để dễ dàng thao tác
                address.fullAddress = `${address.streetAddress}, ${ward ? ward.name : address.wardCode}, ${district ? district.name : address.districtId}, ${province ? province.name : address.provinceId}`;
            }
        }

        // Lấy các sản phẩm trong đơn hàng
        const orderItems = await OrderItem.findAll({
            where: { orderId: id },
            include: [
                {
                    model: Sku,
                    attributes: ['id', 'skuCode', 'price'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'thumbnail']
                        }
                    ]
                }
            ]
        });

        // Format các sản phẩm trong đơn hàng
        const formattedItems = orderItems.map(item => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price,
            skuCode: item.Sku?.skuCode || 'N/A',
            productName: item.Sku?.product?.name || 'Product Not Found',
            productImage: item.Sku?.product?.thumbnail || null,
            skuId: item.skuId,
            orderId: item.orderId
        }));

        return res.status(200).json({
            success: true,
            data: {
                order: order,
                orderItems: formattedItems,
                address: address
            }
        });

    } catch (error) {
        console.error('Error fetching order details:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};


// Cập nhật trạng thái đơn hàng
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'confirmed', 'shipping', 'completed', 'cancelled','refunded' ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const order = await Order.findByPk(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        await order.update({ status });

        return res.status(200).json({
            success: true,
            message: 'Order status updated successfully',
            data: order
        });

    } catch (error) {
        console.error('Error updating order status:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

// Hủy đơn hàng
exports.cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { cancelReason } = req.body;

        if (!cancelReason) {
            return res.status(400).json({
                success: false,
                message: 'Cancel reason is required'
            });
        }

        const order = await Order.findByPk(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        await order.update({
            status: 'cancelled',
            cancelReason
        });

        return res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            data: order
        });

    } catch (error) {
        console.error('Error cancelling order:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};