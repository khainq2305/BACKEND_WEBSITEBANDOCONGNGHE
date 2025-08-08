require('dotenv').config(); // Đảm bảo biến môi trường hoạt động
const axios = require("axios");

const payosClientId = process.env.PAYOS_CLIENT_ID;
const payosApiKey = process.env.PAYOS_API_KEY;
const clientUrl = process.env.CLIENT_URL;

exports.createPaymentLink = async ({ orderId, amount, orderInfo }) => {
  try {
    console.log("🔗 [PayOS] Tạo link thanh toán:");
    console.log("🧾 orderId:", orderId);
    console.log("💰 amount:", amount);
    console.log("📝 orderInfo:", orderInfo);

    // orderCode phải là SỐ NGUYÊN, không chứa chữ
    const numericOrderCode = parseInt(orderId.replace(/\D/g, ""), 10);

  const payload = {
  orderCode: numericOrderCode,
  amount: Number(amount),
  description: orderInfo,
  returnUrl: `${clientUrl}/order-confirmation?orderCode=${orderId}`,
  cancelUrl: `${clientUrl}/checkout`,
  customerEmail: 'test@example.com',      // ✅ Email test
  phoneNumber: '0912345678',              // ✅ Số điện thoại hợp lệ
};


    console.log("📤 Payload gửi PayOS:", payload);

    const res = await axios.post(
      "https://api-merchant.payos.vn/v2/payment-requests",
      payload,
      {
        headers: {
          "x-client-id": payosClientId,
          "x-api-key": payosApiKey,
        },
      }
    );

    console.log("✅ [PayOS] Phản hồi:", res.data);
    return res.data;
  } catch (error) {
    console.error("❌ [PayOS] Lỗi khi tạo link thanh toán:", error?.response?.data || error.message);
    throw error;
  }
};
