const crypto = require("crypto");
const moment = require("moment-timezone");

function encodeRFC3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

exports.createPaymentLink = ({ orderId, amount, orderInfo }) => {
  const vnp_TmnCode = process.env.VNP_TMNCODE;
  const vnp_HashSecret = process.env.VNP_HASH_SECRET;
  const vnp_Url = process.env.VNP_URL;
  const vnp_ReturnUrl = process.env.VNP_RETURN_URL;

  const createDate = moment().tz("Asia/Ho_Chi_Minh").format("YYYYMMDDHHmmss");
  const txnRef = `${orderId}-${Date.now()}`;
  const vnpAmount = Math.round(amount) * 100;
  const ipAddr = "127.0.0.1";

  const vnp_Params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Amount: vnpAmount,
    vnp_ReturnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  const sortedKeys = Object.keys(vnp_Params).sort();
  const signData = sortedKeys
    .map(key => `${key}=${encodeRFC3986(vnp_Params[key])}`)
    .join('&');

  const secureHash = crypto
    .createHmac('sha512', vnp_HashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  const paymentUrl = `${vnp_Url}?${signData}&vnp_SecureHashType=SHA512&vnp_SecureHash=${secureHash}`;

  // LOG ĐỂ DEBUG
  console.log("🔐 signData:", signData);
  console.log("🔒 secureHash:", secureHash);
  console.log("🔗 paymentUrl:", paymentUrl);

  return paymentUrl;
};
