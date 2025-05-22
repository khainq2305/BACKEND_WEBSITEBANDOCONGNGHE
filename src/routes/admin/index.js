const express = require('express');
const router = express.Router();

const productRoutes = require('./productRoutes');
const variantRoutes = require('./variantRoutes');
router.use('/', variantRoutes);

// Mount route vào path gốc
router.use('/', productRoutes); // 👉 /api/admin/products

module.exports = router;
