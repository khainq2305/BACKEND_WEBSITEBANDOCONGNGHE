const express = require('express');
const router = express.Router();
const ClientComboController = require('../../controllers/client/combo.controller');
// 🚩 Debug: log mọi request đi qua combo router
router.use((req, _res, next) => {
  console.log(
    `[COMBO][ROUTER] ${req.method} ${req.originalUrl} ` +
    `auth=${req.headers.authorization ? 'yes' : 'no'}`
  );
  next();
});
router.get('/', ClientComboController.getAll);
router.get('/available', ClientComboController.getAvailable);
router.get('/:slug', ClientComboController.getBySlug);

module.exports = router;
