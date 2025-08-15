// src/services/client/momoService.js
const axios = require("axios");
const crypto = require("crypto");

const partnerCode = process.env.MOMO_PARTNER_CODE;
const accessKey   = process.env.MOMO_ACCESS_KEY;
const secretKey   = process.env.MOMO_SECRET_KEY;
const redirectUrl = process.env.MOMO_REDIRECT_URL;

// Chọn endpoint theo môi trường
const MOMO_BASE =
  process.env.NODE_ENV === "production"
    ? "https://payment.momo.vn"
    : "https://test-payment.momo.vn";

function mask(str, keep = 4) {
  if (!str) return str;
  const s = String(str);
  return s.length <= keep ? "*".repeat(s.length) : s.slice(0, keep) + "****";
}

function logEnvOnce() {
  if (logEnvOnce._printed) return;
  logEnvOnce._printed = true;
  console.log("[MoMo ENV] ", {
    MOMO_PARTNER_CODE : partnerCode,
    MOMO_ACCESS_KEY   : mask(accessKey),
    MOMO_SECRET_KEY   : mask(secretKey),
    MOMO_REDIRECT_URL : redirectUrl,
    NODE_ENV          : process.env.NODE_ENV,
    MOMO_IPN_URL      : process.env.MOMO_IPN_URL, // để chắc IPN đang dùng URL nào
  });
}

/**
 * Tạo link thanh toán MoMo
 * - TRẢ VỀ: response của MoMo + requestId (để lưu DB phục vụ fallback query)
 */
async function createPaymentLink({ orderId, amount, orderInfo }) {
  logEnvOnce();
  const ipnUrl = process.env.MOMO_IPN_URL;

  if (!partnerCode || !accessKey || !secretKey || !redirectUrl || !ipnUrl) {
    console.error("[MoMo CREATE] Thiếu ENV!", {
      hasPartner  : !!partnerCode,
      hasAccess   : !!accessKey,
      hasSecret   : !!secretKey,
      hasRedirect : !!redirectUrl,
      hasIpn      : !!ipnUrl,
    });
    throw new Error("Thiếu biến môi trường MoMo");
  }

  const requestType = "payWithATM"; // hoặc "captureWallet" tuỳ phương thức
  const requestId   = `${orderId}-${Date.now()}`;
  const extraData   = "";

  // rawSignature theo tài liệu /create
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
    accessKey : mask(accessKey),
    signature : mask(signature, 8),
    secretKey : undefined, // không log secret
  });
  console.log("[MoMo CREATE] rawSignature:", rawSignature);

  const http = axios.create({
    timeout: 15000,
    headers: { "Content-Type": "application/json" },
  });

  try {
    const { data } = await http.post(
      `${MOMO_BASE}/v2/gateway/api/create`,
      payload
    );
    console.log("[MoMo CREATE] Response:", data);
    // Trả về cả requestId để lưu vào DB (order.momoRequestId)
    return { ...data, requestId };
  } catch (err) {
    console.error(
      "[MoMo CREATE] Error:",
      err.response?.status,
      err.response?.data || err.message
    );
    throw err;
  }
}

/**
 * Fallback query MoMo để lấy transId khi callback thiếu (redirect)
 * Signature format:
 *   accessKey=$accessKey&orderId=$orderId&partnerCode=$partnerCode&requestId=$requestId
 */
async function queryPayment({ orderId, requestId }) {
  logEnvOnce();

  if (!partnerCode || !accessKey || !secretKey || !requestId) {
    console.warn("[MoMo QUERY] Missing env/requestId", {
      hasPartner: !!partnerCode,
      hasAccess : !!accessKey,
      hasSecret : !!secretKey,
      hasReqId  : !!requestId,
    });
    return null;
  }

  const raw = `accessKey=${accessKey}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}`;
  const signature = crypto.createHmac("sha256", secretKey).update(raw).digest("hex");
  const payload = { partnerCode, requestId, orderId, signature, lang: "vi" };

  try {
    console.log("[MoMo QUERY] request:", {
      orderId,
      requestId,
      accessKey: mask(accessKey, 6),
      partnerCode: mask(partnerCode, 6),
      sigPrefix: mask(signature, 10),
      endpoint: `${MOMO_BASE}/v2/gateway/api/query`,
    });

    const { data } = await axios.post(
      `${MOMO_BASE}/v2/gateway/api/query`,
      payload,
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );

    console.log("[MoMo QUERY] response:", {
      orderId: data.orderId,
      requestId: data.requestId,
      resultCode: data.resultCode,
      message: data.message,
      transId: data.transId,
      amount: data.amount,
      responseTime: data.responseTime,
    });

    if (Number(data.resultCode) === 0 && data.transId) {
      return {
        transId: String(data.transId),
        amount: data.amount != null ? Number(data.amount) : null,
        responseTime: Number(data.responseTime) || Date.now(),
      };
    }
    return null;
  } catch (err) {
    console.error(
      "[MoMo QUERY] Error:",
      err.response?.status,
      err.response?.data || err.message
    );
    return null;
  }
}

/**
 * Hoàn tiền
 */
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

  console.log("[MoMo REFUND] Payload:", {
    ...payload,
    accessKey : mask(accessKey),
    signature : mask(signature, 8),
  });
  console.log("[MoMo REFUND] rawSignature:", rawSignature);

  try {
    const { data } = await axios.post(
      `${MOMO_BASE}/v2/gateway/api/refund`,
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

module.exports = {
  createPaymentLink,
  queryPayment,  // <— thêm export cho fallback
  refund,
};
