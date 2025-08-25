// src/services/client/momoService.js
const axios = require("axios");
const crypto = require("crypto");

const partnerCode = process.env.MOMO_PARTNER_CODE;
const accessKey   = process.env.MOMO_ACCESS_KEY;
const secretKey   = process.env.MOMO_SECRET_KEY;
const redirectUrl = process.env.MOMO_REDIRECT_URL;

function mask(str, keep = 4) {
  if (!str) return str;
  const s = String(str);
  return s.length <= keep ? "*".repeat(s.length) : s.slice(0, keep) + "****";
}

function logEnvOnce() {
  if (logEnvOnce._printed) return;
  logEnvOnce._printed = true;
  console.log("[MoMo ENV] ",
    {
      MOMO_PARTNER_CODE : partnerCode,
      MOMO_ACCESS_KEY   : mask(accessKey),
      MOMO_SECRET_KEY   : mask(secretKey),
      MOMO_REDIRECT_URL : redirectUrl,
      NODE_ENV          : process.env.NODE_ENV,
      // để chắc chắn Render đang dùng IPN nào
      MOMO_IPN_URL      : process.env.MOMO_IPN_URL
    }
  );
}

async function createPaymentLink({ orderId, amount, orderInfo }) {
  logEnvOnce();
  const ipnUrl = process.env.MOMO_IPN_URL;

  if (!partnerCode || !accessKey || !secretKey || !redirectUrl || !ipnUrl) {
    console.error("[MoMo CREATE] Thiếu ENV!", {
      hasPartner    : !!partnerCode,
      hasAccess     : !!accessKey,
      hasSecret     : !!secretKey,
      hasRedirect   : !!redirectUrl,
      hasIpn        : !!ipnUrl,
    });
    throw new Error("Thiếu biến môi trường MoMo");
  }

  const requestType = "captureWallet"; // dùng ví/QR (MoMo wallet / QR / deeplink)

  const requestId   = `${orderId}-${Date.now()}`;
  const extraData   = "";

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

  // ==== DEBUG ====
  console.log("[MoMo CREATE] Payload:", {
    ...payload,
    accessKey  : mask(accessKey),
    signature  : mask(signature, 8),
    secretKey  : undefined, // ko log secret
  });


  const http = axios.create({
    timeout: 15000,
    headers: { "Content-Type": "application/json" },
  });

  try {
    const { data } = await http.post(
      "https://test-payment.momo.vn/v2/gateway/api/create",
      payload
    );

    return data;
  } catch (err) {
    console.error(
      "[MoMo CREATE] Error:",
      err.response?.status,
      err.response?.data || err.message
    );
    throw err;
  }
}

async function refund({ orderCode, amount, momoTransId, description = "" }) {
  logEnvOnce();

  if (!momoTransId) throw new Error("Thiếu momoTransId – không thể hoàn tiền");

  const requestId = `${orderCode}-RF-${Date.now()}`;
  const orderId   = requestId;
  const transId   = String(momoTransId);

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
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    console.log("[MoMo REFUND] Response:", data);
    return data;
  } catch (error) {
    console.error(
      "[MoMo REFUND] Error:",
      error.response?.status,
      error.response?.data || error.message
    );
    throw error;
  }
}
async function queryTransaction({ orderId, requestId }) {
  logEnvOnce();

  if (!partnerCode || !accessKey || !secretKey) {
    throw new Error("Thiếu biến môi trường MoMo");
  }

  // MoMo yêu cầu sign theo format này
  const rawSignature = [
    `accessKey=${accessKey}`,
    `orderId=${orderId}`,
    `partnerCode=${partnerCode}`,
    `requestId=${requestId}`,
  ].join("&");

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  const payload = {
    partnerCode,
    accessKey,
    requestId,
    orderId,
    signature,
    lang: "vi",
  };



  try {
    const { data } = await axios.post(
      "https://test-payment.momo.vn/v2/gateway/api/query",
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    console.log("[MoMo QUERY] Response:", data);
    return data;
  } catch (err) {
    console.error("[MoMo QUERY] Error:", err.response?.data || err.message);
    throw err;
  }
}

module.exports = { createPaymentLink, refund, queryTransaction };
