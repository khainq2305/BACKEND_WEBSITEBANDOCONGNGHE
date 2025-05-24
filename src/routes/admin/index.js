const express = require('express');
const router = express.Router();

const productRoutes = require('./productRoutes');
const variantRoutes = require('./variantRoutes');
const brandRoutes = require('./brand.route'); 
const postRoutes = require('./post.routes');
const postCategoryRoutes = require('./categoryPost.routes')
const userRoutes = require('./user.route'); 

router.use('/', userRoutes); 

router.use('/', variantRoutes);

// const categoryRoutes = require('./category');
// const userRoutes = require('./user');

// Gắn route con vào prefix
router.use('/quan-ly-bai-viet', postRoutes);
router.use('/quan-ly-danh-muc', postCategoryRoutes);
router.use('/brands', brandRoutes);

// Mount route vào path gốc
router.use('/', productRoutes); // 👉 /api/admin/products

module.exports = router;
