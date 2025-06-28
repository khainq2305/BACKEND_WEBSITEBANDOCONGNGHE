const express = require('express');
const router = express.Router();
const SystemSettingController = require('../../controllers/admin/systemSettingController');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { checkPermission } = require('../../middlewares/casl.middleware');

const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.use(checkJWT);
router.use(attachUserDetail);

router.get('/', checkPermission('read', 'systemSettings'), SystemSettingController.get);
router.put(
  '/update',
  checkPermission('update', 'systemSettings'),
  upload.fields([
    { name: 'site_logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
  ]),
  SystemSettingController.update
);

module.exports = router;
