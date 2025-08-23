require('dotenv').config();
const axios = require('axios');

const TOKEN = process.env.GHN_TOKEN;
const SHOP_ID = process.env.GHN_SHOP_ID;

// ⚡ Test: tạo đơn GHN trực tiếp, bỏ DB mapping
(async () => {
  try {
    const payload = {
      payment_type_id: 1, // 1 = shop trả phí, 2 = khách trả phí
      required_note: "KHONGCHOXEMHANG",

      // From: shop
      from_name: "Cyberzone Shop",
      from_phone: "0987654321",   // số thật, hợp lệ

      from_address: "Địa chỉ shop",
      from_ward_code: "21009",      // ⚠️ phải dùng wardCode GHN thật của shop em
      from_district_id: 1450,       // ⚠️ districtId GHN thật của shop em

      // To: khách
      to_name: "Khải Quốc",
      to_phone: "0878999894",
      to_address: "fhdgh",
      to_ward_code: "1B2102",       // ⚠️ thử code chữ
      to_district_id: 1915,         // ⚠️ GHN districtId tương ứng

      // Dịch vụ GHN (lấy từ available-services API)
      service_id: 53321,
      service_type_id: 2,

      // Hàng hóa
      weight: 100,
      length: 20,
      width: 20,
      height: 20,

      cod_amount: 60001,
      client_order_code: "TEST-" + Date.now(),
      content: "Đơn hàng test từ script",
    };

    console.log("===== PAYLOAD GỬI GHN =====");
    console.dir(payload, { depth: null });

    const { data: responseData } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Token: TOKEN,
          ShopId: SHOP_ID,
        },
        timeout: 10000,
      }
    );

    console.log("===== RESPONSE GHN =====");
    console.dir(responseData, { depth: null });

  } catch (err) {
    console.error("❌ Lỗi tạo đơn:", err.response?.data || err.message);
  }
})();
