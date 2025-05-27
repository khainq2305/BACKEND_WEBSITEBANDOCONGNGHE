const express = require('express');
const router = express.Router();
const PostController = require('../../controllers/admin/postController');

router.post('/them-bai-viet', PostController.create);           
router.get('/', PostController.getAll);
router.get('/chinh-sua-bai-viet/:id', PostController.getById);
router.put('/cap-nhat-bai-viet/:id', PostController.update)
router.post('/chuyen-vao-thung-rac', PostController.softDelete);         
router.post('/khoi-phuc', PostController.restore);        
router.put('/:id', PostController.update);        
router.post('/xoa-vinh-vien', PostController.forceDelete);      

module.exports = router;
