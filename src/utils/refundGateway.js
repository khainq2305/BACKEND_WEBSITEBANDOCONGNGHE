const vnpay = require("../services/client/vnpayService");
const momo = require("../services/client/momoService");
const zalopay = require("../services/client/zalopayService");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function refundGateway(gateway, payload) {
  switch (gateway) {
    /* ─────────────────────── VNPay ─────────────────────── */
    case "vnpay": {
      const { orderCode, amount, vnpTransactionId, transDate, originalAmount } =
        payload;

      if (!vnpTransactionId || !transDate) {
        return {
          ok: false,
          transId: null,
          rawResp: {
            RspCode: "99",
            Message: "Missing transactionId or transDate",
          },
        };
      }

      const resp = await vnpay.refund({
        orderCode,
        transactionId: vnpTransactionId,
        amount,
        transDate,
        originalAmount,
        user: "admin",
      });

      return {
        ok: resp?.vnp_ResponseCode === "00",
        transId: resp?.vnp_TransactionNo || null,
        rawResp: resp,
      };
    }
    case "stripe": {
      const { stripePaymentIntentId, amount } = payload;

      if (!stripePaymentIntentId) {
        return {
          ok: false,
          transId: null,
          rawResp: {
            code: "missing_intent_id",
            message: "Missing stripePaymentIntentId",
          },
        };
      }

      try {
        const refund = await stripe.refunds.create({
          payment_intent: stripePaymentIntentId,
          amount: Math.round(Number(amount)), // VND nếu account là VND
          reason: "requested_by_customer",
        });

        return {
          ok: refund?.status === "succeeded",
          transId: refund?.id || null,
          rawResp: refund,
        };
      } catch (err) {
        return {
          ok: false,
          transId: null,
          rawResp: err?.raw || err.message,
        };
      }
    }

    /* ─────────────────────── MoMo ──────────────────────── */
    case "momo": {
      if (!payload.momoTransId) {
        throw new Error("Thiếu momoTransId – không thể hoàn tiền MoMo");
      }

      const resp = await momo.refund({
        orderCode: payload.orderCode,
        momoTransId: payload.momoTransId,
        amount: Number(payload.amount), // ← Ép kiểu đúng

        user: "admin",
      });

      console.dir(resp, { depth: null });

      return {
        ok: resp?.resultCode === 0,
        transId: resp?.transId || null,
        rawResp: resp,
      };
    }
    case "zalopay": {
      const { app_trans_id, zp_trans_id, amount } = payload;

      // Kiểm tra dữ liệu đầu vào
      if (!app_trans_id || !zp_trans_id || !amount) {
        return {
          ok: false,
          transId: null,
          rawResp: {
            code: -1,
            message: "Thiếu app_trans_id, zp_trans_id hoặc amount",
          },
        };
      }

      // Làm tròn số tiền và ép kiểu chắc chắn
      const roundedAmount = Math.round(Number(amount));

      try {
        // Gọi service refund
        const resp = await zalopay.refund({
          app_trans_id,
          zp_trans_id,
          amount: roundedAmount,
          description: "Hoan tien", // Đảm bảo description không có kí tự đặc biệt
          user: "admin",
        });

        return {
          ok: resp?.return_code === 1,
          transId: resp?.refund_id || resp?.m_refund_id || null,
          rawResp: resp,
        };
      } catch (err) {
        return {
          ok: false,
          transId: null,
          rawResp: err?.response?.data || err.message,
        };
      }
    }

    /* ───────────────────── Gateway khác ─────────────────── */
    default: {
      return {
        ok: false,
        transId: null,
        rawResp: null,
      };
    }
  }
};
