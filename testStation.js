require('dotenv').config();
const axios = require('axios');

// ⚠️ GHN yêu cầu JWT cho /station/get
// Nếu bạn chưa có JWT thì thay thử bằng token mock (eyJ.xxx.yyy)
const GHN_TOKEN = process.env.GHN_TOKEN || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.mock";
const GHN_SHOP_ID = process.env.GHN_SHOP_ID || "3677180";

async function testStation() {
  try {
    console.log("===== TEST /station/get =====");
    console.log("📌 districtId: 1442, wardCode: 20101");
    console.log("📌 GHN_TOKEN:", GHN_TOKEN);
    console.log("📌 GHN_SHOP_ID:", GHN_SHOP_ID);

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
          "token": GHN_TOKEN,
          "ShopId": GHN_SHOP_ID,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    console.log("===== KẾT QUẢ BƯU CỤC =====");
    console.dir(data, { depth: null });
  } catch (err) {
    console.error("❌ Lỗi test station:", err.response?.data || err.message);
  }
}

testStation();
