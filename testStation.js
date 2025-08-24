const axios = require("axios");

const GHN_TOKEN = "d66cf435-f4ac-11ef-ac14-f2515dcc8e8f"; // token shop bạn
const GHN_SHOP_ID = "3677180";

async function testStation() {
  try {
    const { data } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/station/get",
      {
        district_id: 1442,
        ward_code: "20101",
        offset: 0,
        limit: 10
      },
      {
        headers: {
          "Token": GHN_TOKEN,   // 👈 phải viết hoa T
          "ShopId": GHN_SHOP_ID,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    console.log("✅ Kết quả bưu cục:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("❌ Lỗi test station:", err.response?.data || err.message);
  }
}

testStation();
