const crypto = require('crypto');
const moment = require('moment-timezone');
const qs = require('qs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

function toLatin(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\-]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function createPaymentLink({
  orderId,
  amount,
  orderInfo,
  locale = 'vn',
  bankCode = '',
  orderType = 'other',
  expireMin = 15
}) {
  const VNP_TMN_CODE = process.env.VNP_TMNCODE;
  const VNP_HASHSECRET = process.env.VNP_HASH_SECRET.trim();
  const VNP_URL = process.env.VNP_URL;
  const VNP_RETURN_URL = process.env.VNP_RETURN_URL;

  const now = moment().tz('Asia/Ho_Chi_Minh');

  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: VNP_TMN_CODE,
    vnp_Amount: Math.round(+amount) * 100,
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId,
  vnp_OrderInfo: toLatin(orderInfo).replace(/\s+/g, '+'),

    vnp_OrderType: orderType,
    vnp_Locale: locale,
    vnp_ReturnUrl: VNP_RETURN_URL,
    vnp_IpAddr: '127.0.0.1',
    vnp_CreateDate: now.format('YYYYMMDDHHmmss'),
    vnp_ExpireDate: now.add(expireMin, 'm').format('YYYYMMDDHHmmss')
  };

  if (bankCode) params.vnp_BankCode = bankCode;

  const signData = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const secureHash = crypto
    .createHmac('sha512', VNP_HASHSECRET)
    .update(Buffer.from(signData, 'utf8'))
    .digest('hex');

  return (
    VNP_URL +
    '?' +
    signData +
    `&vnp_SecureHashType=SHA512&vnp_SecureHash=${secureHash}`
  );
}

function verifySignature(params, secureHash) {
  const VNP_HASHSECRET = process.env.VNP_HASH_SECRET.trim();

  const filtered = { ...params };
  delete filtered.vnp_SecureHash;
  delete filtered.vnp_SecureHashType;

  const signData = qs.stringify(filtered, {
    encode: false,
    sort: (a, b) => a.localeCompare(b)
  });

  const hash = crypto
    .createHmac('sha512', VNP_HASHSECRET)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  return hash === secureHash;
}

async function refund({
  orderCode,
  transactionId,
  amount,
  transDate,
  user = 'admin'
}) {
  const VNP_TMN_CODE = process.env.VNP_TMNCODE;
const VNP_HASHSECRET = process.env.VNP_HASH_SECRET.trim();

  const REFUND_URL = 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

  const now = moment().tz('Asia/Ho_Chi_Minh');

  const vnp_RequestId = uuidv4().replace(/-/g, '').slice(0, 32);
  const vnp_Version = '2.1.0';
  const vnp_Command = 'refund';
  const vnp_TransactionType = '02'; // Full refund
  const vnp_TxnRef = orderCode;
  const vnp_Amount = Math.round(+amount) * 100;
  const vnp_TransactionNo = transactionId;
  const vnp_TransactionDate = moment(transDate).format('YYYYMMDDHHmmss');
  const vnp_CreateBy = user;
  const vnp_CreateDate = now.format('YYYYMMDDHHmmss');
  const vnp_IpAddr = '127.0.0.1';
  const vnp_OrderInfo = `Refund order ${orderCode}`;

  const rawData = [
    vnp_RequestId,
    vnp_Version,
    vnp_Command,
    VNP_TMN_CODE,
    vnp_TransactionType,
    vnp_TxnRef,
    vnp_Amount,
    vnp_TransactionNo,
    vnp_TransactionDate,
    vnp_CreateBy,
    vnp_CreateDate,
    vnp_IpAddr,
    vnp_OrderInfo
  ].join('|');

const vnp_SecureHash = crypto
  .createHmac('sha512', VNP_HASHSECRET)
  .update(rawData)
  .digest('hex');


  const body = {
    vnp_RequestId,
    vnp_Version,
    vnp_Command,
    vnp_TmnCode: VNP_TMN_CODE,
    vnp_TransactionType,
    vnp_TxnRef,
    vnp_Amount,
    vnp_TransactionNo,
    vnp_TransactionDate,
    vnp_CreateBy,
    vnp_CreateDate,
    vnp_IpAddr,
    vnp_OrderInfo,
    vnp_SecureHash
  };

  try {
    const { data } = await axios.post(REFUND_URL, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

   
    return data;
  } catch (err) {
    console.error('❌ Lỗi khi gọi VNPAY refund:', err?.response?.data || err.message);
    throw err;
  }
}


module.exports = {
  createPaymentLink,
  verifySignature,
  refund
};
