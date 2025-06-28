/**
 * Viettel Money payment helper
 * Doc: ViettelPay Payment Gateway v2.0
 */
const crypto = require("crypto");
const qs     = require("querystring");

/**
 * Tạo URL redirect tới cổng thanh toán Viettel Money
 * @param {Object} opts
 * @param {string} opts.orderId   – Mã đơn trong hệ thống (duy nhất)
 * @param {string} opts.billCode  – Mã hoá đơn hiển thị cho khách (tùy ý)
 * @param {number} opts.amount    – Số tiền VNĐ (số nguyên)
 * @param {string} opts.orderInfo – Mô tả ngắn cho giao dịch
 * @returns {string} payUrl
 */
function createPaymentLink({ orderId, billCode, amount, orderInfo = "" }) {
  const {
    VT_GATEWAY_URL,   // https://pay.bankplus.vn:8450/PaymentGateway/payment
    VT_MERCHANT_CODE, // do Viettel cấp
    VT_ACCESS_CODE,   // do Viettel cấp
    VT_SECRET_KEY,    // do Viettel cấp
    VT_RETURN_URL,    // redirect (GET)
    VT_NOTIFY_URL,    // server-to-server (POST)
  } = process.env;

  const params = {
    merchant_code : VT_MERCHANT_CODE,
    access_code   : VT_ACCESS_CODE,
    order_id      : orderId,
    billcode      : billCode || orderId,
    trans_amount  : amount,
    lang          : "VN",
    currency      : "VND",
    order_desc    : orderInfo,
    return_url    : VT_RETURN_URL,
    cancel_url    : VT_RETURN_URL,
    notify_url    : VT_NOTIFY_URL,
  };

  // check_sum = HMAC-SHA256(access_code + billcode + merchant_code + order_id + trans_amount)
  const raw = [
    params.access_code,
    params.billcode,
    params.merchant_code,
    params.order_id,
    params.trans_amount,
  ].join("");

  params.check_sum = crypto
    .createHmac("sha256", VT_SECRET_KEY)
    .update(raw, "utf8")
    .digest("base64");

  return `${VT_GATEWAY_URL}?${qs.stringify(params)}`;
}

/**
 * Xác minh callback / IPN từ Viettel Money
 * @param {Object} payload – Toàn bộ query/body Viettel gửi về
 * @returns {boolean}
 */
function verifySignature(payload = {}) {
  const {
    access_code,
    billcode,
    merchant_code,
    order_id,
    payment_status,
    trans_amount,
    vt_transaction_id,
    check_sum,
  } = payload;

  const raw = [
    access_code,
    billcode,
    merchant_code,
    order_id,
    payment_status,
    trans_amount,
    vt_transaction_id,
  ].join("");

  const mySig = crypto
    .createHmac("sha256", process.env.VT_SECRET_KEY)
    .update(raw, "utf8")
    .digest("base64");

  return mySig === check_sum;
}

module.exports = { createPaymentLink, verifySignature };
