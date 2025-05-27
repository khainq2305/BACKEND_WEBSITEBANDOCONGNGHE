const express = require('express');
const router = express.Router();
const VariantValueController = require('../../controllers/admin/variantValueController');
const { validateVariantValue } = require('../../validations/variantValueValidator');
const upload = require('../../middlewares/upload');

router.get('/variant-values/:id', VariantValueController.getByVariant); // Lấy theo variantId

router.post(
  '/variant-values/create',
  upload.single('image'),
  validateVariantValue,
  VariantValueController.create
);
router.post('/variant-values/reorder', VariantValueController.reorder);
router.post('/variant-values/create-quick', VariantValueController.createQuick);
router.put(
  '/variant-values/:id',
  upload.single('image'),
  validateVariantValue,
  VariantValueController.update
);

router.delete('/variant-values/:id', VariantValueController.softDelete);
router.delete('/variant-values/:id/force', VariantValueController.forceDelete);
router.patch('/variant-values/:id/restore', VariantValueController.restore);

router.post('/variant-values/delete-many', VariantValueController.deleteMany);
router.post('/variant-values/force-delete-many', VariantValueController.forceDeleteMany);
router.post('/variant-values/restore-many', VariantValueController.restoreMany);

module.exports = router;
