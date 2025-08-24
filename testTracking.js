require('dotenv').config();
const { getTrackingByClientCode, getTrackingByOrderCode } = require('./src/services/client/drivers/ghnService');

(async () => {
  try {
    console.log("===== TEST TRACKING GHN =====");

    // ⚡ Thay mã thật từ DB hoặc mã GHN trả về
    const clientOrderCode = "DH20250824-00766";
    const orderCode = "GYCYQNYM";

    // Test tracking bằng client_order_code
    console.log("\n👉 Test getTrackingByClientCode...");
    const trackingByClient = await getTrackingByClientCode(clientOrderCode);
    console.dir(trackingByClient, { depth: null });

    // Test tracking bằng order_code
    console.log("\n👉 Test getTrackingByOrderCode...");
    const trackingByOrder = await getTrackingByOrderCode(orderCode);
    console.dir(trackingByOrder, { depth: null });

    console.log("\n===== DONE =====");
  } catch (err) {
    console.error("❌ Test tracking lỗi:", err.message);
  }
})();
