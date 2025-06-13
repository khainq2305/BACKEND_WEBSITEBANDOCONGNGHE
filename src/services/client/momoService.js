const axios = require("axios");
const crypto = require("crypto");

const partnerCode = process.env.MOMO_PARTNER_CODE;
const accessKey = process.env.MOMO_ACCESS_KEY;
const secretKey = process.env.MOMO_SECRET_KEY;
const redirectUrl = process.env.MOMO_REDIRECT_URL;
const ipnUrl = process.env.MOMO_IPN_URL;

exports.createPaymentLink = async ({ orderId, amount, orderInfo }) => {
  const requestId = `${orderId}-${Date.now()}`;
 const requestType = "payWithATM"; 

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
    amount: `${Math.round(amount)}`, 
    orderId: `${orderId}`,         
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature,
    lang: "vi",
  };
  try {
    const response = await axios.post(
      "https://test-payment.momo.vn/v2/gateway/api/create",
      payload,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};
