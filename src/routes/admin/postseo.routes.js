const express = require('express');
const router = express.Router();
const postSEOController = require('../../controllers/admin/postseoController');
const { checkJWT } = require('../../middlewares/checkJWT');

// Middleware xác thực cho tất cả routes
router.use(checkJWT);

// Routes cho Post SEO
router.get('/', postSEOController.getAllPostSEO);
router.get('/posts', postSEOController.getPosts); // Lấy danh sách posts với thông tin SEO
router.get('/posts-without-seo', postSEOController.getPostsWithoutSEO);
router.get('/stats', postSEOController.getSEOStats);
router.get('/post/:postId', postSEOController.getPostSEOByPostId);
router.get('/:id', postSEOController.getPostSEOById);
router.post('/', postSEOController.createPostSEO);
router.put('/:id', postSEOController.updatePostSEO);
router.delete('/:id', postSEOController.deletePostSEO);
router.post('/analyze/:postId', postSEOController.analyzePostSEO);
router.post('/bulk-analyze', postSEOController.bulkAnalyzePosts);
router.post('/create-all', postSEOController.createSEOForAllPosts);

// Schema routes
router.get('/:postId/schema', postSEOController.getPostSchema);
router.put('/:postId/schema', postSEOController.updatePostSchema);

module.exports = router;