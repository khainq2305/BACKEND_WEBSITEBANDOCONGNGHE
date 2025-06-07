const express = require('express');
const router = express.Router();

const productRoutes = require('./productRoutes');
const variantRoutes = require('./variantRoutes');
const brandRoutes = require('./brand.route'); 
const postRoutes = require('./post.routes');
const userRoutes = require('./user.route');
const reviewRoutes = require('./review.route');

router.use('/', userRoutes); 

router.use('/', variantRoutes);

// const categoryRoutes = require('./category');
// const userRoutes = require('./user');


router.use('/reviews', reviewRoutes);

// Gắn route con vào prefix
const OrderRoutes = require('./orders.routes'); //order
router.use('/quan-ly-bai-viet', postRoutes);
router.use('/brands', brandRoutes);
router.use('/orders', OrderRoutes);

// Mount route vào path gốc
router.use('/', productRoutes); // 👉 /api/admin/products


module.exports = router;
