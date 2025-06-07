const axios = require("axios");
const crypto = require("crypto");

const partnerCode = process.env.MOMO_PARTNER_CODE;
const accessKey = process.env.MOMO_ACCESS_KEY;
const secretKey = process.env.MOMO_SECRET_KEY;
const redirectUrl = process.env.MOMO_REDIRECT_URL;
const ipnUrl = process.env.MOMO_IPN_URL;

exports.createPaymentLink = async ({ orderId, amount, orderInfo }) => {
  const requestId = `${orderId}-${Date.now()}`;
 const requestType = "payWithATM"; // hoặc "payWithCC"

  const extraData = "";

  const rawSignature =
    "accessKey=" + accessKey +
    "&amount=" + `${Math.round(amount)}` +
    "&extraData=" + extraData +
    "&ipnUrl=" + ipnUrl +
    "&orderId=" + `${orderId}` +
    "&orderInfo=" + orderInfo +
    "&partnerCode=" + partnerCode +
    "&redirectUrl=" + redirectUrl +
    "&requestId=" + requestId +
    "&requestType=" + requestType;

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  const payload = {
    partnerCode,
    accessKey,
    requestId,
    amount: `${Math.round(amount)}`, // string
    orderId: `${orderId}`,           // string
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature,
    lang: "vi",
  };

  // ====================== 🔍 FULL LOG DEBUG ===========================
  console.log("📦 --- MoMo DEBUG START ---");
  console.log("🔐 rawSignature:", rawSignature);
  console.log("🖊️  Signature:", signature);
  console.log("📤 Payload gửi MoMo:", JSON.stringify(payload, null, 2));
  // ===================================================================

  try {
    const response = await axios.post(
      "https://test-payment.momo.vn/v2/gateway/api/create",
      payload,
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    console.log("✅ MoMo response:", JSON.stringify(response.data, null, 2));
    console.log("📦 --- MoMo DEBUG END ---\n");
    return response.data;
  } catch (error) {
    console.log("❌ MoMo request failed:");
    console.log("❌ Response:", error.response?.data || error.message);
    console.log("📦 --- MoMo DEBUG END ---\n");
    throw error;
  }
};
