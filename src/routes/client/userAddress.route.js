const express = require('express');
const router = express.Router();
const UserAddressController = require('../../controllers/client/userAddressController');
const {checkJWT} = require("../../middlewares/checkJWT");
router.post('/', checkJWT, UserAddressController.create);
router.get('/', checkJWT, UserAddressController.getByUser);
router.put('/set-default/:id', checkJWT, UserAddressController.setDefault);
router.put('/:id', checkJWT, UserAddressController.update); // ✅
router.delete('/:id', checkJWT, UserAddressController.remove); // ✅
module.exports = router;
