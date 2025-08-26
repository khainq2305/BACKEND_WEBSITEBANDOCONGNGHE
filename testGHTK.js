// testGHTK.js
const axios = require("axios");

const GHTK_TOKEN = "2MXR4ZWV5jUDdqzwmFDFU4MHbeYhQCoOlnOAFP9"; // token thật
const PARTNER_CODE = "S22856075"; // mã shop (góc dashboard)

async function testCreateOrder() {
  try {
    // ⚡ PHẢI có ?ver=1.5
    const url = "https://services.giaohangtietkiem.vn/services/shipment/order/?ver=1.5";

    const orderPayload = {
      products: [
        { name: "Áo thun test", weight: 0.5, quantity: 1, product_code: "SP001" },
        { name: "Bút bi test", weight: 0.1, quantity: 2, product_code: "SP002" }
      ],
      order: {
        id: "TEST_" + Date.now(),
        pick_name: "Cyberzone Shop",
        pick_address: "590 CMT8 P.11",          // đổi sang địa chỉ thật
        pick_province: "TP. Hồ Chí Minh",
        pick_district: "Quận 3",
        pick_ward: "Phường 1",
        pick_tel: "0911222333",
        pick_email: "shop@cyberzone.com",

        name: "Nguyễn Văn A",
        address: "123 Nguyễn Trãi",
        province: "Hà Nội",
        district: "Thanh Xuân",
        ward: "Khương Trung",
        hamlet: "Khác",
        tel: "0912345678",
        email: "customer@gmail.com",

        is_freeship: 1,
        pick_money: 0,
        value: 300000,
        transport: "fly",
        pick_option: "cod",   // bắt buộc
        note: "Đơn hàng test API"
      },
    };

    console.log("👉 URL:", url);
    console.log("👉 Headers:", {
      Token: GHTK_TOKEN,
      "X-Client-Source": PARTNER_CODE,
      "Content-Type": "application/json",
    });

    const { data } = await axios.post(url, orderPayload, {
      headers: {
        Token: GHTK_TOKEN,
        "X-Client-Source": PARTNER_CODE,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log("✅ Response:", data);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
}

testCreateOrder();
