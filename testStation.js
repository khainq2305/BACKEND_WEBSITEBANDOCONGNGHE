const axios = require("axios");

async function testStation() {
  try {
    const { data } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/station/get",
      {
        district_id: 1442,
        ward_code: "20101",
        offset: 0,
        limit: 1000
      },
      {
        headers: {
          "token": "d66cf435-f4ac-11ef-ac14-f2515dcc8e8f", // 👈 token shop bạn
          "ShopId": "3677180",
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Kết quả bưu cục:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Lỗi test station:", err.response?.data || err.message);
  }
}

testStation();
