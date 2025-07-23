const express = require('express');
const router = express.Router();
const { Sequelize } = require('sequelize');
const { Category} = require('../../models/index')
const CategoryController = require('../../controllers/admin/categoryPostController')
const autoSlug = require('../../middlewares/autoSlug')
const checkDuplicateCategory = require('../../validations/checkDuplicateCategory')
const pagination = require('../../middlewares/pagination')
const validatePostCategory = require('../../validations/postCategoryValidator')
const {upload} = require('../../config/cloudinary')
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("PostCategory"))
router.get('/',pagination, CategoryController.getAll);
router.post('/create',upload.none(), validatePostCategory, autoSlug(Category), checkDuplicateCategory(Category) , CategoryController.create)
router.get('/edit/:slug' , CategoryController.getBySlug)
router.post('/update/:slug',upload.none(), validatePostCategory, autoSlug(Category), checkDuplicateCategory(Category) , CategoryController.update)
router.post('/trash', CategoryController.trashBySlug)
router.post('/restore', CategoryController.restoreBySlug)
router.get('/total-post', CategoryController.getPostCountsByCategory)
module.exports = router