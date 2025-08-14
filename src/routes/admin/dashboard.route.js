// routes/admin/dashboard.routes.js

const express = require('express');
const router = express.Router();
const DashboardController = require('../../controllers/admin/dashboardController');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');

router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("Dashboard"))

// Các route cũ, giữ nguyên
router.get('/stats', DashboardController.getDashboardStats);
router.get('/revenue-by-date', DashboardController.getRevenueChartData);
router.get('/orders-by-date', DashboardController.getOrdersChartData);
router.get('/top-selling-products', DashboardController.getTopSellingProducts);
router.get('/favorite-products', DashboardController.getFavoriteProducts);
router.get('/all-top-selling-products', DashboardController.getAllTopSellingProducts);
router.get('/all-favorite-products', DashboardController.getAllFavoriteProducts);

module.exports = router;