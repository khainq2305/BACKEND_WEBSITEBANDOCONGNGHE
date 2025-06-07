const express = require('express');
const router = express.Router();

const UserController = require('../../controllers/admin/userController'); // 👈 Class with static methods
const { checkJWT, isAdmin } = require('../../middlewares/checkJWT');
const { createUserValidator } = require('../../validations/userValidator');

router.get('/users', checkJWT, UserController.getAllUsers);

router.post('/users', checkJWT, createUserValidator, UserController.createUser);

router.get('/roles', checkJWT, UserController.getAllRoles);

router.put('/users/:id/status', checkJWT, UserController.updateUserStatus);

router.post('/users/:id/reset-password', checkJWT, UserController.resetUserPassword);

router.delete('/users/inactive', checkJWT, UserController.deleteInactiveUsers);

router.get('/users/deleted', checkJWT, UserController.getDeletedUsers);

router.get('/users/:id', checkJWT, UserController.getUserById);

router.post('/users/force-delete-many', checkJWT, UserController.forceDeleteManyUsers);

module.exports = router;
