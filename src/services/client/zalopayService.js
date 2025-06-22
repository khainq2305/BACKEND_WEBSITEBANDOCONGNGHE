const crypto = require("crypto");
const axios = require("axios");

const ZALO_APP_ID = process.env.ZALOPAY_APP_ID;
const ZALO_KEY1 = process.env.ZALOPAY_KEY1;
const ZALO_CALLBACK_URL = process.env.ZALOPAY_CALLBACK_URL;
const ZALO_ENDPOINT = "https://sandbox.zalopay.com.vn/v001/tpe/createorder";

exports.createPaymentLink = async ({ orderId, amount, orderInfo }) => {
  if (!ZALO_APP_ID || !ZALO_KEY1 || !ZALO_CALLBACK_URL) {
    throw new Error("Thiếu cấu hình ZaloPay trong .env");
  }

  const transId = Math.floor(Math.random() * 1000000);
  const app_trans_id = `${new Date().toISOString().slice(2, 10).replace(/-/g, "")}_${transId}`;

  const order = {
    app_id: Number(ZALO_APP_ID),
    app_trans_id,
    app_user: "demo_user",
    app_time: Date.now(),
    amount: Math.round(amount),
    item: JSON.stringify([]), // <- Không được để undefined hoặc null
    embed_data: JSON.stringify({}),
    bank_code: "",
    description: `Thanh toan don hang ${orderInfo?.replace(/[^a-zA-Z0-9-]/g, "") || "ZaloOrder"}`,
    callback_url: ZALO_CALLBACK_URL
  };

  const data = `${order.app_id}|${order.app_trans_id}|${order.app_user}|${order.amount}|${order.app_time}|${order.embed_data}|${order.item}`;
  order.mac = crypto.createHmac("sha256", ZALO_KEY1).update(data).digest("hex");

  console.log("📤 Sending to ZaloPay:", JSON.stringify(order, null, 2));

  try {
    const response = await axios.post(ZALO_ENDPOINT, order, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    console.log("✅ ZaloPay response:", response.data);
    return response.data;
  } catch (err) {
    console.error("❌ ZaloPay error:", err?.response?.data || err.message);
    throw err;
  }
};
