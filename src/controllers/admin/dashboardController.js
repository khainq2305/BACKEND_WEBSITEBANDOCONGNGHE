// controllers/admin/dashboardController.js

const { Op, fn, col, literal } = require("sequelize");
const { Order, OrderItem, Product, Wishlist, User, Sku, WishlistItem } = require("../../models");

class DashboardController {
    static getDateFilter(from, to) {
        const filter = {};
        if (from) filter[Op.gte] = new Date(from);
        if (to) filter[Op.lte] = new Date(to);
        return filter;
    }

    // 1. Lấy dữ liệu thống kê tổng quan (StatsCards)
    static async getDashboardStats(req, res) {
        try {
            const { from, to } = req.query;
            const dateFilter = DashboardController.getDateFilter(from, to);

            const fromDateObj = from ? new Date(from) : null;
            const toDateObj = to ? new Date(to) : null;

            let prevFromDateObj = null;
            let prevToDateObj = null;

            if (fromDateObj && toDateObj) {
                const durationMs = toDateObj.getTime() - fromDateObj.getTime();
                prevToDateObj = new Date(fromDateObj.getTime());
                prevFromDateObj = new Date(prevToDateObj.getTime() - durationMs);
            }
            const prevDateFilter = DashboardController.getDateFilter(prevFromDateObj, prevToDateObj);

            const [
                totalRevenueResult,
                totalOrdersCount,
                cancelledOrdersCount,
                newUsersCount,
                prevTotalRevenueResult,
                prevTotalOrdersCount,
                prevCancelledOrdersCount,
                prevNewUsersCount,
            ] = await Promise.all([
                Order.sum('totalPrice', {
                    where: { createdAt: dateFilter, status: 'completed' },
                }),
                Order.count({
                    where: { createdAt: dateFilter, status: { [Op.ne]: 'cancelled' } },
                }),
                Order.count({
                    where: { createdAt: dateFilter, status: 'cancelled' },
                }),
                User.count({
                    where: { createdAt: dateFilter }, // Dùng createdAt cho User model
                }),

                Order.sum('totalPrice', {
                    where: { createdAt: prevDateFilter, status: 'completed' },
                }),
                Order.count({
                    where: { createdAt: prevDateFilter, status: { [Op.ne]: 'cancelled' } },
                }),
                Order.count({
                    where: { createdAt: prevDateFilter, status: 'cancelled' },
                }),
                User.count({
                    where: { createdAt: prevDateFilter }, // Dùng createdAt cho User model
                }),
            ]);

            const totalRevenue = totalRevenueResult || 0;
            const totalOrders = totalOrdersCount || 0;
            const cancelledOrders = cancelledOrdersCount || 0;
            const newUsers = newUsersCount || 0;
            const averageRating = "4.6/5"; // Giữ tạm thời

            const prevTotalRevenue = prevTotalRevenueResult || 0;
            const prevTotalOrders = prevTotalOrdersCount || 0;
            const prevCancelledOrders = prevCancelledOrdersCount || 0;
            const prevNewUsers = prevNewUsersCount || 0;
            const prevAverageRating = 4.4; // Giữ tạm thời

            const calculateChange = (current, previous) => {
                if (previous === 0) return current > 0 ? 100 : 0;
                return ((current - previous) / previous) * 100;
            };

            const revenueChange = calculateChange(totalRevenue, prevTotalRevenue).toFixed(1);
            const ordersChange = calculateChange(totalOrders, prevTotalOrders).toFixed(1);
            const cancelledChange = calculateChange(cancelledOrders, prevCancelledOrders).toFixed(1);
            const usersChange = calculateChange(newUsers, prevNewUsers).toFixed(1);
            const ratingChange = (parseFloat(averageRating) - prevAverageRating).toFixed(1);

            res.json({
                totalRevenue, totalOrders, cancelledOrders, newUsers, averageRating,
                revenueChange: parseFloat(revenueChange), ordersChange: parseFloat(ordersChange),
                cancelledChange: parseFloat(cancelledChange), usersChange: parseFloat(usersChange),
                ratingChange: parseFloat(ratingChange),
            });
        } catch (error) {
            console.error("GET DASHBOARD STATS ERROR:", error);
            res.status(500).json({ message: "Lỗi server khi lấy thống kê dashboard", error: error.message });
        }
    }

    // 2. Lấy dữ liệu biểu đồ doanh thu theo ngày (RevenueChart)
    static async getRevenueChartData(req, res) {
        try {
            const { from, to } = req.query;
            const dateFilter = DashboardController.getDateFilter(from, to);

            const revenueData = await Order.findAll({
                attributes: [
                    [fn('DATE_FORMAT', col('createdAt'), '%Y-%m-%d'), 'date'],
                    [fn('SUM', col('totalPrice')), 'revenue'],
                ],
                where: { createdAt: dateFilter, status: 'completed' },
                group: [fn('DATE_FORMAT', col('createdAt'), '%Y-%m-%d')],
                order: [[fn('DATE_FORMAT', col('createdAt'), '%Y-%m-%d'), 'ASC']],
                raw: true,
            });

            res.json(revenueData.map(item => ({ date: item.date, revenue: parseFloat(item.revenue) })));
        } catch (error) {
            console.error("GET REVENUE CHART DATA ERROR:", error);
            res.status(500).json({ message: "Lỗi server khi lấy dữ liệu biểu đồ doanh thu", error: error.message });
        }
    }

    // 3. Lấy dữ liệu biểu đồ số lượng đơn hàng theo ngày (OrdersChart)
    static async getOrdersChartData(req, res) {
        try {
            const { from, to } = req.query;
            const dateFilter = DashboardController.getDateFilter(from, to);

            const ordersData = await Order.findAll({
                attributes: [
                    [fn('DATE_FORMAT', col('createdAt'), '%Y-%m-%d'), 'date'],
                    [fn('COUNT', col('id')), 'orders'],
                ],
                where: { createdAt: dateFilter, status: { [Op.ne]: 'cancelled' } },
                group: [fn('DATE_FORMAT', col('createdAt'), '%Y-%m-%d')],
                order: [[fn('DATE_FORMAT', col('createdAt'), '%Y-%m-%d'), 'ASC']],
                raw: true,
            });

            res.json(ordersData.map(item => ({ date: item.date, orders: parseInt(item.orders) })));
        } catch (error) {
            console.error("GET ORDERS CHART DATA ERROR:", error);
            res.status(500).json({ message: "Lỗi server khi lấy dữ liệu biểu đồ đơn hàng", error: error.message });
        }
    }

    // 4. Lấy dữ liệu Top sản phẩm bán chạy (TopProductsChart & TopProductsTable)
    static async getTopSellingProducts(req, res) {
        try {
            const { from, to } = req.query;
            const dateFilter = DashboardController.getDateFilter(from, to);

            const topProducts = await OrderItem.findAll({
                attributes: [
                    [fn('SUM', col('OrderItem.quantity')), 'sold'],
                    [fn('SUM', literal('OrderItem.quantity * OrderItem.price')), 'revenue'], // Dùng OrderItem.price
                    // THÊM CÁC THUỘC TÍNH CỦA PRODUCT VÀO CẤP CAO NHẤT (ALIAS)
                    [col('sku->product.id'), 'id'],
                    [col('sku->product.name'), 'name'],
                    [col('sku->product.thumbnail'), 'image'],
                    [col('sku->product.categoryId'), 'categoryId'], // Đảm bảo có categoryId cho Product
                ],
                include: [
                    {
                        model: Order,
                        as: 'order',
                        attributes: [],
                        where: {
                            createdAt: dateFilter,
                            status: 'completed',
                        },
                    },
                    {
                        model: Sku,
                        
                        attributes: ['productId'], // LẤY productId TỪ SKU
                        include: [
                            {
                                model: Product,
                                as: 'product', // Alias này phải khớp với Sku.belongsTo(Product, {as: 'product'})
                                attributes: [], // BỎ attributes ở đây vì đã lấy ở cấp trên
                            }
                        ]
                    },
                ],
                // SỬA CHÍNH XÁC MỆNH ĐỀ GROUP BY NÀY ĐỂ DÙNG ALIAS ĐẦY ĐỦ CỦA SEQUELIZE
                group: [
                    'sku.productId',
                    'sku->product.id',
                    'sku->product.name',
                    'sku->product.thumbnail',
                    'sku->product.categoryId'
                ],
                order: [[literal('sold'), 'DESC']],
                limit: 5,
                raw: true,
            });

            const formattedProducts = topProducts.map(item => ({
                id: item.id, // Lấy từ alias top-level
                name: item.name, // Lấy từ alias top-level
                image: item.image || '/placeholder.svg?height=50&width=50', // Lấy từ alias top-level
                sold: parseInt(item.sold),
                revenue: parseFloat(item.revenue),
                variant: 'Nhiều biến thể', // Giá trị mặc định
                category: item.categoryId // Lấy từ alias top-level
            }));

            res.json(formattedProducts);
        } catch (error) {
            console.error("GET TOP SELLING PRODUCTS ERROR:", error);
            res.status(500).json({ message: "Lỗi server khi lấy dữ liệu sản phẩm bán chạy", error: error.message });
        }
    }

    // 5. Lấy dữ liệu Top sản phẩm được yêu thích (FavoriteProductsChart & FavoriteProductsTable)
    static async getFavoriteProducts(req, res) {
        try {
            const { from, to } = req.query;

            const favoriteProducts = await WishlistItem.findAll({
                attributes: [
                    'productId',
                    [fn('COUNT', col('productId')), 'wishlistCount'], // Lấy wishlistCount
                    // THÊM CÁC THUỘC TÍNH CỦA PRODUCT VÀO CẤP CAO NHẤT (ALIAS)
                    [col('product.name'), 'name'],
                    [col('product.thumbnail'), 'image'],
                    [col('product.categoryId'), 'categoryId'],
                ],
                group: ['productId', 'product.id', 'product.name', 'product.thumbnail', 'product.categoryId'], // Group theo tất cả các cột được SELECT
                order: [[literal('wishlistCount'), 'DESC']],
                limit: 5,
                include: [
                    {
                        model: Product,
                        as: 'product',
                        attributes: [], // BỎ attributes ở đây vì đã lấy ở cấp trên
                    },
                ],
                raw: true,
            });

            const formattedProducts = favoriteProducts.map(item => ({
                id: item.productId,
                name: item.name,
                image: item.image || '/placeholder.svg?height=50&width=50',
                wishlistCount: parseInt(item.wishlistCount),
                category: item.categoryId,
            }));

            res.json(formattedProducts);
        } catch (error) {
            console.error("GET FAVORITE PRODUCTS ERROR:", error);
            res.status(500).json({ message: "Lỗi server khi lấy dữ liệu sản phẩm yêu thích", error: error.message });
        }
    }
}
module.exports = DashboardController;