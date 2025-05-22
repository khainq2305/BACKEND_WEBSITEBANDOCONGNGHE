const express = require('express');
const router = express.Router();
const CategoryController = require('../../controllers/admin/categoryPostController')

router.get('/', CategoryController.getAll);