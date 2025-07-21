// zalo-refund-test.js
require('dotenv').config(); // nếu dùng .env
const zaloPayService = require('./src/services/client/zalopayService'); // chỉnh đúng path

(async () => {
  try {
    const result = await zaloPayService.refund({
       app_trans_id: '250717_891066',
  zp_trans_id: '250717000013974',
  amount: 6020001,
    });

    console.log('🎉 REFUND OK:', result);
  } catch (err) {
    console.error('❌ REFUND ERROR:', err.message || err);
  }
})();
