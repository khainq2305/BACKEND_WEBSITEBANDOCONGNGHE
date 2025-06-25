const express = require('express');
const router = express.Router();
const { upload } = require('../../config/cloudinary'); 

const HighlightedCategoryItemController = require('../../controllers/admin/highlightedCategoryItemController');
const { checkJWT, isAdmin } = require('../../middlewares/checkJWT');
router.use(checkJWT);
const { validateHighlightedCategoryItem } = require('../../validations/validateHighlightedCategoryItem');

router.get('/highlighted-category-items/list', HighlightedCategoryItemController.list);





router.post(
  '/highlighted-category-items',
  upload.single('image'),
  validateHighlightedCategoryItem,
  HighlightedCategoryItemController.create
);


router.put(
  '/highlighted-category-items/:slug',
  upload.single('image'),
  validateHighlightedCategoryItem,
  HighlightedCategoryItemController.update
);

router.post('/highlighted-category-items/delete-many', HighlightedCategoryItemController.deleteMany);


router.post('/highlighted-category-items/reorder', HighlightedCategoryItemController.reorder);

router.delete('/highlighted-category-items/:id', HighlightedCategoryItemController.delete);

router.get('/highlighted-category-items/categories/list', HighlightedCategoryItemController.getCategories);


router.get('/highlighted-category-items/:slug', HighlightedCategoryItemController.getById);

module.exports = router;
