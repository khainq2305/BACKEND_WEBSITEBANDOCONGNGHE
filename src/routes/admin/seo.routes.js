const express = require('express');
const router = express.Router();
const seoController = require('../../controllers/admin/seoController');
const {checkJWT} = require('../../middlewares/checkJWT');

// Middleware to check admin authentication
router.use(checkJWT);

// Test route (public)
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'SEO routes working!' });
});

// SEO Analysis Routes
router.post('/analyze', (req, res) => seoController.analyzeURL(req, res));
router.post('/bulk-analyze', (req, res) => seoController.bulkAnalyze(req, res));

// SEO Reports Routes
router.get('/reports', (req, res) => seoController.getSEOReports(req, res));
router.get('/reports/:id', (req, res) => seoController.getSEOReport(req, res));
router.delete('/reports/:id', (req, res) => seoController.deleteSEOReport(req, res));

// SEO Configuration Routes
router.get('/config', (req, res) => seoController.getSEOConfig(req, res));
router.put('/config', (req, res) => seoController.updateSEOConfig(req, res));

// SEO Statistics
router.get('/stats', (req, res) => seoController.getSEOStats(req, res));

// Sitemap Generation
router.get('/sitemap.xml', (req, res) => seoController.generateSitemap(req, res));
router.get('/sitemap/status', (req, res) => seoController.getSitemapStatus(req, res));

module.exports = router;
