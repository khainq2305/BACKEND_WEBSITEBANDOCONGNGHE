const express = require('express');
const router = express.Router();
const SectionController = require('../../controllers/admin/sectionController');

// === SECTIONS ===
router.get('/sections', SectionController.getAllSections);
router.post('/sections', SectionController.createSection);
router.put('/sections/:id', SectionController.updateSection);
router.delete('/sections/:id', SectionController.deleteSection);

router.get('/sections/skus', SectionController.getAllSkus); // 🆕
module.exports = router;
