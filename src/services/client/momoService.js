// src/services/client/momoService.js
const axios = require("axios");
const crypto = require("crypto");

const partnerCode = process.env.MOMO_PARTNER_CODE;
const accessKey = process.env.MOMO_ACCESS_KEY;
const secretKey = process.env.MOMO_SECRET_KEY;
const redirectUrl = process.env.MOMO_REDIRECT_URL;
async function createPaymentLink({ orderId, amount, orderInfo }) {
const ipnUrl = process.env.MOMO_IPN_URL;

  const requestType = "captureWallet";
  const requestId = `${orderId}-${Date.now()}`;
  const extraData = "";

  const rawSignature = [
    `accessKey=${accessKey}`,
    `amount=${Math.round(amount)}`,
    `extraData=${extraData}`,
    `ipnUrl=${ipnUrl}`,
    
    `orderId=${orderId}`,
    `orderInfo=${orderInfo}`,
    `partnerCode=${partnerCode}`,
    `redirectUrl=${redirectUrl}`,
    `requestId=${requestId}`,
    `requestType=${requestType}`,
  ].join("&");

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

  const { data } = await axios.post(
    "https://test-payment.momo.vn/v2/gateway/api/create",
    payload,
    { headers: { "Content-Type": "application/json" } }
  );

  return data;
}

async function refund({ orderCode, amount, momoTransId, description = "" }) {
  if (!momoTransId) throw new Error("Thiếu momoTransId – không thể hoàn tiền");

  const requestId = `${orderCode}-RF-${Date.now()}`;
  const orderId = requestId;
  const transId = String(momoTransId);

  const rawSignature =
    `accessKey=${accessKey}&amount=${Math.round(amount)}` +
    `&description=${description}&orderId=${orderId}` +
    `&partnerCode=${partnerCode}&requestId=${requestId}` +
    `&transId=${transId}`;

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  const payload = {
    partnerCode,
    accessKey,
    requestId,
    orderId,
    amount: `${Math.round(amount)}`,
    transId,
    description,
    signature,
    lang: "vi",
   
  };

  try {
    const { data } = await axios.post(
      "https://test-payment.momo.vn/v2/gateway/api/refund",
      payload,
      { headers: { "Content-Type": "application/json" } }
    );

    return data;
  } catch (error) {
    throw error;
  }

  return data;
}

module.exports = {
  createPaymentLink,
  refund,
};
