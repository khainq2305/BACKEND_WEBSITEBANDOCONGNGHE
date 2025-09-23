// controllers/admin/dashboardController.js

const { Op, fn, col, literal } = require("sequelize");
const {
  Order,
  OrderItem,
  Product,
  Wishlist,
  User,
  Sku,
  WishlistItem,
  Review,
} = require("../../models");

// Hàm format số: bỏ .0 nếu là số nguyên, giữ 1 số lẻ nếu có
function formatNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return Number.isInteger(num) ? num : parseFloat(num.toFixed(1));
}

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
      const prevDateFilter = DashboardController.getDateFilter(
        prevFromDateObj,
        prevToDateObj
      );

      const [
        totalRevenueResult,
        totalOrdersCount,
        cancelledOrdersCount,
        newUsersCount,
        prevTotalRevenueResult,
        prevTotalOrdersCount,
        prevCancelledOrdersCount,
        prevNewUsersCount,
        averageRatingResult,
        prevAverageRatingResult,
      ] = await Promise.all([
        Order.sum("totalPrice", {
          where: { createdAt: dateFilter, status: "completed" },
        }),
        Order.count({
          where: { createdAt: dateFilter, status: { [Op.ne]: "cancelled" } },
        }),
        Order.count({
          where: { createdAt: dateFilter, status: "cancelled" },
        }),
        User.count({
          where: { createdAt: dateFilter },
        }),

        Order.sum("totalPrice", {
          where: { createdAt: prevDateFilter, status: "completed" },
        }),
        Order.count({
          where: {
            createdAt: prevDateFilter,
            status: { [Op.ne]: "cancelled" },
          },
        }),
        Order.count({
          where: { createdAt: prevDateFilter, status: "cancelled" },
        }),
        User.count({
          where: { createdAt: prevDateFilter },
        }),

        Review.findOne({
          attributes: [[fn("AVG", col("rating")), "avgRating"]],
          where: { createdAt: dateFilter },
          raw: true,
        }),

        Review.findOne({
          attributes: [[fn("AVG", col("rating")), "avgRating"]],
          where: { createdAt: prevDateFilter },
          raw: true,
        }),
      ]);

      const totalRevenue = totalRevenueResult || 0;
      const totalOrders = totalOrdersCount || 0;
      const cancelledOrders = cancelledOrdersCount || 0;
      const newUsers = newUsersCount || 0;

      const prevTotalRevenue = prevTotalRevenueResult || 0;
      const prevTotalOrders = prevTotalOrdersCount || 0;
      const prevCancelledOrders = prevCancelledOrdersCount || 0;
      const prevNewUsers = prevNewUsersCount || 0;

      const averageRating = averageRatingResult?.avgRating
        ? formatNumber(averageRatingResult.avgRating)
        : 0;

      const prevAverageRating = prevAverageRatingResult?.avgRating
        ? formatNumber(prevAverageRatingResult.avgRating)
        : 0;

      const calculateChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const revenueChange = formatNumber(
        calculateChange(totalRevenue, prevTotalRevenue)
      );
      const ordersChange = formatNumber(
        calculateChange(totalOrders, prevTotalOrders)
      );
      const cancelledChange = formatNumber(
        calculateChange(cancelledOrders, prevCancelledOrders)
      );
      const usersChange = formatNumber(
        calculateChange(newUsers, prevNewUsers)
      );
      const ratingChange = formatNumber(
        calculateChange(averageRating, prevAverageRating)
      );

      res.json({
        totalRevenue,
        totalOrders,
        cancelledOrders,
        newUsers,
        averageRating,
        revenueChange,
        ordersChange,
        cancelledChange,
        usersChange,
        ratingChange,
        currentPeriod: {
          from: fromDateObj,
          to: toDateObj,
        },
        previousPeriod: {
          from: prevFromDateObj,
          to: prevToDateObj,
        },
      });
    } catch (error) {
      console.error("GET DASHBOARD STATS ERROR:", error);
      res.status(500).json({
        message: "Lỗi server khi lấy thống kê dashboard",
        error: error.message,
      });
    }
  }

  // 2. Lấy dữ liệu biểu đồ doanh thu theo ngày (RevenueChart)
  static async getRevenueChartData(req, res) {
    try {
      const { from, to } = req.query;
      const dateFilter = DashboardController.getDateFilter(from, to);

      const revenueData = await Order.findAll({
        attributes: [
          [fn("DATE_FORMAT", col("createdAt"), "%Y-%m-%d"), "date"],
          [fn("SUM", col("totalPrice")), "revenue"],
        ],
        where: { createdAt: dateFilter, status: "completed" },
        group: [fn("DATE_FORMAT", col("createdAt"), "%Y-%m-%d")],
        order: [[fn("DATE_FORMAT", col("createdAt"), "%Y-%m-%d"), "ASC"]],
        raw: true,
      });

      res.json(
        revenueData.map((item) => ({
          date: item.date,
          revenue: parseFloat(item.revenue),
        }))
      );
    } catch (error) {
      console.error("GET REVENUE CHART DATA ERROR:", error);
      res.status(500).json({
        message: "Lỗi server khi lấy dữ liệu biểu đồ doanh thu",
        error: error.message,
      });
    }
  }

  // 3. Lấy dữ liệu biểu đồ số lượng đơn hàng theo ngày (OrdersChart)
  static async getOrdersChartData(req, res) {
    try {
      const { from, to } = req.query;
      const dateFilter = DashboardController.getDateFilter(from, to);

      const ordersData = await Order.findAll({
        attributes: [
          [fn("DATE_FORMAT", col("createdAt"), "%Y-%m-%d"), "date"],
          [fn("COUNT", col("id")), "orders"],
        ],
        where: { createdAt: dateFilter, status: { [Op.ne]: "cancelled" } },
        group: [fn("DATE_FORMAT", col("createdAt"), "%Y-%m-%d")],
        order: [[fn("DATE_FORMAT", col("createdAt"), "%Y-%m-%d"), "ASC"]],
        raw: true,
      });

      res.json(
        ordersData.map((item) => ({
          date: item.date,
          orders: parseInt(item.orders),
        }))
      );
    } catch (error) {
      console.error("GET ORDERS CHART DATA ERROR:", error);
      res.status(500).json({
        message: "Lỗi server khi lấy dữ liệu biểu đồ đơn hàng",
        error: error.message,
      });
    }
  }
  // 4. Lấy dữ liệu Top 5 sản phẩm bán chạy (có lọc theo thời gian)
  static async getTopSellingProducts(req, res) {
    try {
      const { from, to } = req.query;
      const dateFilter = DashboardController.getDateFilter(from, to);

      const topProducts = await OrderItem.findAll({
        attributes: [
          [fn("SUM", col("OrderItem.quantity")), "sold"],
          [fn("SUM", literal("OrderItem.quantity * OrderItem.price")), "revenue"],
          [col("Sku->product.id"), "id"],
          [col("Sku->product.name"), "name"],
          [col("Sku->product.thumbnail"), "image"],
          [col("Sku->product.categoryId"), "categoryId"],
          [col("Sku->product.hasVariants"), "hasVariants"],
        ],
        include: [
          {
            model: Order,
            as: "order",
            attributes: [],
            where: {
              status: "completed",
              createdAt: dateFilter,   // 👈 lọc theo thời gian
            },
          },
          {
            model: Sku,
            attributes: [],
            where: { deletedAt: null },
            required: true,
            paranoid: false,
            include: [
              {
                model: Product,
                as: "product",
                attributes: [],
                where: { deletedAt: null, isActive: 1 },
                required: true,
                paranoid: false,
              },
            ],
          },
        ],
        group: [
          "Sku->product.id",
          "Sku->product.name",
          "Sku->product.thumbnail",
          "Sku->product.categoryId",
          "Sku->product.hasVariants",
        ],
        order: [[literal("sold"), "DESC"]],
        limit: 5,
        raw: true,
      });

      const formattedProducts = topProducts.map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image || "/placeholder.svg?height=50&width=50",
        sold: parseInt(item.sold, 10) || 0,
        revenue: parseFloat(item.revenue) || 0,
        variant: item.hasVariants ? "Nhiều biến thể" : "1 biến thể",
        category: item.categoryId,
      }));

      res.json({ data: formattedProducts });
    } catch (error) {
      console.error("GET TOP SELLING PRODUCTS ERROR:", error);
      res.status(500).json({
        message: "Lỗi server khi lấy dữ liệu sản phẩm bán chạy",
        error: error.message,
      });
    }
  }


  // 5. Lấy dữ liệu Top 5 sản phẩm được yêu thích (có lọc theo thời gian)
  static async getFavoriteProducts(req, res) {
    try {
      const { from, to } = req.query;
      const dateFilter = DashboardController.getDateFilter(from, to);

      const favoriteProducts = await WishlistItem.findAll({
        attributes: [
          "productId",
          [fn("COUNT", col("productId")), "wishlistCount"],
          [col("product.name"), "name"],
          [col("product.thumbnail"), "image"],
          [col("product.categoryId"), "categoryId"],
        ],
        group: [
          "productId",
          "product.id",
          "product.name",
          "product.thumbnail",
          "product.categoryId",
        ],
        order: [[literal("wishlistCount"), "DESC"]],
        limit: 5,
        include: [
          {
            model: Product,
            as: "product",
            attributes: [],
            where: { deletedAt: null, isActive: 1 },
            paranoid: false,
          },
        ],
        where: {
          createdAt: dateFilter,   // 👈 lọc theo thời gian
        },
        raw: true,
      });

      const formattedProducts = favoriteProducts.map((item) => ({
        id: item.productId,
        name: item.name,
        image: item.image || "/placeholder.svg?height=50&width=50",
        wishlistCount: parseInt(item.wishlistCount),
        category: item.categoryId,
      }));

      res.json(formattedProducts);
    } catch (error) {
      console.error("GET FAVORITE PRODUCTS ERROR:", error);
      res.status(500).json({
        message: "Lỗi server khi lấy dữ liệu sản phẩm yêu thích",
        error: error.message,
      });
    }
  }


  static async getAllTopSellingProducts(req, res) {
    try {
      const topProducts = await OrderItem.findAll({
        attributes: [
          [fn("SUM", col("OrderItem.quantity")), "sold"],
          [
            fn("SUM", literal("OrderItem.quantity * OrderItem.price")),
            "revenue",
          ],
          [col("Sku.product.id"), "id"],
          [col("Sku.product.name"), "name"],
          [col("Sku.product.thumbnail"), "image"],
          [col("Sku.product.categoryId"), "categoryId"],
          [col("Sku.product.hasVariants"), "hasVariants"],
        ],
        include: [
          {
            model: Order,
            as: "order",
            attributes: [],
            where: { status: "completed" },
          },
          {
            model: Sku,
            attributes: [],
            required: true,
            where: { deletedAt: null },
            paranoid: false,
            include: [
              {
                model: Product,
                as: "product",
                attributes: [],
                where: { deletedAt: null, isActive: 1 },
                required: true,
                paranoid: false,
              },
            ],
          },
        ],
        group: [
          "Sku.product.id",
          "Sku.product.name",
          "Sku.product.thumbnail",
          "Sku.product.categoryId",
          "Sku.product.hasVariants",
        ],
        order: [[literal("sold"), "DESC"]],
        raw: true,
      });

      const formattedProducts = topProducts.map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image || "/placeholder.svg?height=50&width=50",
        sold: parseInt(item.sold, 10) || 0,
        revenue: parseFloat(item.revenue) || 0,
        variant: item.hasVariants ? "Nhiều biến thể" : "1 biến thể",
        category: item.categoryId,
      }));

      res.json({ data: formattedProducts });
    } catch (error) {
      console.error("GET ALL TOP SELLING PRODUCTS ERROR:", error);
      res.status(500).json({
        message: "Lỗi server khi lấy dữ liệu toàn bộ sản phẩm bán chạy",
        error: error.message,
      });
    }
  }

  static async getAllFavoriteProducts(req, res) {
    try {
      const favoriteProducts = await WishlistItem.findAll({
        attributes: [
          "productId",
          [fn("COUNT", col("productId")), "wishlistCount"],
          [col("product.name"), "name"],
          [col("product.thumbnail"), "image"],
          [col("product.categoryId"), "categoryId"],
        ],
        group: [
          "productId",
          "product.id",
          "product.name",
          "product.thumbnail",
          "product.categoryId",
        ],
        order: [[literal("wishlistCount"), "DESC"]],
        include: [
          {
            model: Product,
            as: "product",
            attributes: [],
            where: {
              deletedAt: null,
              isActive: 1,
            },
            paranoid: false,
          },
        ],
        raw: true,
      });

      const formattedProducts = favoriteProducts.map((item) => ({
        id: item.productId,
        name: item.name,
        image: item.image || "/placeholder.svg?height=50&width=50",
        wishlistCount: parseInt(item.wishlistCount),
        category: item.categoryId,
      }));

      res.json({
        data: formattedProducts,
      });
    } catch (error) {
      console.error("GET ALL FAVORITE PRODUCTS ERROR:", error);
      res
        .status(500)
        .json({
          message: "Lỗi server khi lấy dữ liệu toàn bộ sản phẩm yêu thích",
          error: error.message,
        });
    }
  }
}

module.exports = DashboardController;
