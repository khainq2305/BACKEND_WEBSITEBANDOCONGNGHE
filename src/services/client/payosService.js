require("dotenv").config();
const axios = require("axios");

const payosClientId = process.env.PAYOS_CLIENT_ID;
const payosApiKey = process.env.PAYOS_API_KEY;
const clientUrl = process.env.CLIENT_URL;

exports.createPaymentLink = async ({ orderId, amount, orderInfo }) => {
  try {
    const numericOrderCode = parseInt(orderId.replace(/\D/g, ""), 10);

    const payload = {
      orderCode: numericOrderCode,
      amount: Number(amount),
      description: orderInfo,
      returnUrl: `${clientUrl}/order-confirmation?orderCode=${orderId}`,
      cancelUrl: `${clientUrl}/checkout`,
      customerEmail: "test@example.com",
      phoneNumber: "0912345678",
    };

    

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

  
    return res.data;
  } catch (error) {
    console.error(
      "❌ [PayOS] Lỗi khi tạo link thanh toán:",
      error?.response?.data || error.message
    );
    throw error;
  }
};
