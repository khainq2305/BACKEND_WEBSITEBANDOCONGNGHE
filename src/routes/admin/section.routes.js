const express = require('express');
const router = express.Router();
const SectionController = require('../../controllers/admin/sectionController');
const upload = require('../../middlewares/upload');
const { validateSection } = require('../../validations/sectionValidator');

// === SECTIONS ===
router.get('/sections', SectionController.getAllSections);
router.get('/sections/skus', SectionController.getAllSkus); 
// routes/admin/sectionRoutes.js
router.post(
  '/sections',
  upload.array('bannerFiles'),
  validateSection,
  SectionController.createSection
);


router.put('/sections/:id', SectionController.updateSection);
router.delete('/sections/:id', SectionController.deleteSection);
router.get('/sections/:id', SectionController.getSectionById); 
router.patch('/sections/update-order', SectionController.updateOrderIndexes);

module.exports = router;
