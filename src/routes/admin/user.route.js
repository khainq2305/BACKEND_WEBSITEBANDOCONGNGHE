const express = require('express');
const router = express.Router();

const UserController = require('../../controllers/admin/userController'); // 👈 Class with static methods
const { checkJWT, isAdmin } = require('../../middlewares/checkJWT');
const { createUserValidator } = require('../../validations/userValidator');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
const { upload } = require('../../config/cloudinary'); // <-- multer cloudinary
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("User"))
router.get('/', checkJWT, UserController.getAllUsers);

router.post(
    '/',
    upload.single('avatar'),       // <--- nhận file từ field 'avatar'
    createUserValidator,           // <--- validate cơ bản
    UserController.createUser
);

router.get('/roles', checkJWT, UserController.getAllRoles);

router.put('/:id/status', checkJWT, UserController.updateUserStatus);

router.post('/:id/reset-password', checkJWT, UserController.resetUserPassword);

router.delete('/inactive', checkJWT, UserController.deleteInactiveUsers);

router.get('/deleted', checkJWT, UserController.getDeletedUsers);

router.get('/:id', checkJWT, UserController.getUserById);

router.post('/force-delete-many', checkJWT, UserController.forceDeleteManyUsers);

router.put('/:userId/roles', checkJWT, UserController.updateUserRoles);

module.exports = router;
