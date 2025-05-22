const express = require('express');
const router = express.Router();

const userController = require('../../controllers/admin/userController');
const { checkJWT, isAdmin } = require('../../middlewares/checkJWT');
const { createUserValidator } = require('../../validations/userValidator');
router.get('/users', checkJWT, userController.getAllUsers);

router.post('/users', checkJWT, createUserValidator, userController.createUser);

router.get('/roles', checkJWT, userController.getAllRoles);
router.put('/users/:id/status', checkJWT, userController.updateUserStatus);
router.post('/users/:id/reset-password', checkJWT, userController.resetUserPassword);
router.put('/users/:id/cancel-block', checkJWT, userController.cancelUserScheduledBlock);


module.exports = router;
