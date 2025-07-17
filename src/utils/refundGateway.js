const vnpay = require('../services/client/vnpayService');
const momo  = require('../services/client/momoService');
const zalopay = require('../services/client/zalopayService'); // ⬅️ THÊM DÒNG NÀY
module.exports = async function refundGateway(gateway, payload) {
  switch (gateway) {

    /* ─────────────────────── VNPay ─────────────────────── */
    case 'vnpay': {
      console.log('[refundGateway] Gọi VNPAY refund:', payload);

      const { orderCode, amount, vnpTransactionId, transDate } = payload;

      if (!vnpTransactionId || !transDate) {
        console.error('[refundGateway] ❌ Thiếu transactionId hoặc transDate cho VNPay');
        return {
          ok      : false,
          transId : null,
          rawResp : { RspCode: '99', Message: 'Missing transactionId or transDate' }
        };
      }

      const resp = await vnpay.refund({
        orderCode,
        transactionId: vnpTransactionId,
        amount,
        transDate,
        user: 'admin',
      });

      console.log('[refundGateway] VNPAY trả về:', resp);

      return {
  ok      : resp?.vnp_ResponseCode === '00',
  transId : resp?.vnp_TransactionNo || null,
  rawResp : resp,
};

    }

    /* ─────────────────────── MoMo ──────────────────────── */
    case 'momo': {
      console.log('[refundGateway] Gọi MoMo refund:', payload);

      if (!payload.momoTransId) {
        throw new Error('Thiếu momoTransId – không thể hoàn tiền MoMo');
      }

      const resp = await momo.refund({
        orderCode   : payload.orderCode,
        momoTransId : payload.momoTransId,
        amount      : payload.amount,
        user        : 'admin',
      });

      console.dir(resp, { depth: null });

      return {
        ok      : resp?.resultCode === 0,
        transId : resp?.transId || null,
        rawResp : resp,
      };
    }
  case 'zalopay': {
      console.log('[refundGateway] Gọi ZaloPay refund:', payload);

      const { app_trans_id, zp_trans_id, amount } = payload;

      if (!app_trans_id || !zp_trans_id) {
        console.error('[refundGateway] ❌ Thiếu app_trans_id hoặc zp_trans_id cho ZaloPay');
        return {
          ok      : false,
          transId : null,
          rawResp : { code: -1, message: 'Missing app_trans_id or zp_trans_id' }
        };
      }

      const resp = await zalopay.refund({
        app_trans_id,
        zp_trans_id,
        amount,
        user: 'admin',
      });

      console.log('[refundGateway] ZaloPay trả về:', resp);

      return {
        ok      : resp?.return_code === 1, // ZaloPay: 1 = success
        transId : resp?.zp_trans_id || null,
        rawResp : resp,
      };
    }
    /* ───────────────────── Gateway khác ─────────────────── */
    default: {
      console.error(`[refundGateway] ❌ Không hỗ trợ gateway: ${gateway}`);
      return {
        ok      : false,
        transId : null,
        rawResp : null,
      };
    }
  }
};
