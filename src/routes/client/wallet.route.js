const express = require('express');
const router = express.Router();
const WalletController = require('../../controllers/client/WalletController');
const { checkJWT } = require('../../middlewares/checkJWT');

router.use(checkJWT);

router.get('/', WalletController.getWallet);
router.get('/transactions', WalletController.getTransactions);

router.post('/google-auth/enable', WalletController.enableGoogleAuth);  
router.post('/google-auth/verify', WalletController.verifyGoogleAuth);  
router.post('/google-auth/disable', WalletController.disableGoogleAuth); 
router.post('/auth/verify-payment', WalletController.verifyPayment);

module.exports = router;
