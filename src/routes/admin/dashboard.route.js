// routes/admin/dashboard.routes.js

const express = require('express');
const router = express.Router();
const DashboardController = require('../../controllers/admin/dashboardController');

// const { checkJWT } = require('../../middlewares/checkJWT'); 

// router.use(checkJWT);

router.get('/stats', DashboardController.getDashboardStats);
router.get('/revenue-by-date', DashboardController.getRevenueChartData);
router.get('/orders-by-date', DashboardController.getOrdersChartData);
router.get('/top-selling-products', DashboardController.getTopSellingProducts);
router.get('/favorite-products', DashboardController.getFavoriteProducts);

module.exports = router;