const express = require('express');
const router = express.Router();
const { Sequelize } = require('sequelize');
const { Category} = require('../../models/index')
const CategoryController = require('../../controllers/admin/categoryPostController')
const autoSlug = require('../../middlewares/autoSlug')
const checkDuplicateCategory = require('../../validations/checkDuplicateCategory')
const pagination = require('../../middlewares/pagination')

router.get('/',pagination, CategoryController.getAll);
router.post('/them-danh-muc-moi',autoSlug(Category), checkDuplicateCategory(Category) , CategoryController.create)
router.get('/chinh-sua-danh-muc/:slug' , CategoryController.getBySlug)
router.post('/cap-nhat-danh-muc/:slug',autoSlug(Category), checkDuplicateCategory(Category) , CategoryController.update)
router.post('/chuyen-vao-thung-rac', CategoryController.trashBySlug)
router.post('/khoi-phuc', CategoryController.restoreBySlug)
router.get('/tong-so-bai-viet', CategoryController.getPostCountsByCategory)
module.exports = router