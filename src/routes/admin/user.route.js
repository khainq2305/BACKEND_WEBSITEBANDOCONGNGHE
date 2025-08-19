const express = require('express');
const router = express.Router();

const UserController = require('../../controllers/admin/userController'); // 👈 Class with static methods
const { checkJWT ,isAdmin } = require('../../middlewares/checkJWT');
const { createUserValidator } = require('../../validations/userValidator');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
console.log('đã gọi router user')
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("User"))
router.get('/', UserController.getAllUsers);

router.post('/', createUserValidator, UserController.createUser);

router.get('/roles', UserController.getAllRoles);

router.put('/:id/status', UserController.updateUserStatus);

router.post('/:id/reset-password', UserController.resetUserPassword);

router.delete('/inactive', UserController.deleteInactiveUsers);

router.get('/deleted', UserController.getDeletedUsers);

router.get('/:id', UserController.getUserById);

router.post('/force-delete-many',UserController.forceDeleteManyUsers);

router.put('/:userId/roles', UserController.updateUserRoles);

module.exports = router;
