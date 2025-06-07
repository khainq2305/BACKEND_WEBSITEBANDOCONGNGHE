// src/routes/client/shipping.routes.js
const express = require('express');
const router = express.Router();
const PostController = require('../../controllers/client/postController');

router.get('/', PostController.getFeaturePost);
router.get('/theo-danh-muc/:slug', PostController.getByCategorySlug)
router.get('/:slug', PostController.getBySlug)
router.get('/bai-viet-lien-quan/:slug', PostController.getRelatedPosts)
module.exports = router;
