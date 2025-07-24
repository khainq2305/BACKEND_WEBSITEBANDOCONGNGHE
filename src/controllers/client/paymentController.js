const { Order, sequelize, PaymentMethod, User } = require("../../models");

const sendEmail = require("../../utils/sendEmail");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const momoService = require("../../services/client/momoService");
const zaloPayService = require("../../services/client/zalopayService");
const vnpayService = require("../../services/client/vnpayService");
const viettelMoneyService = require("../../services/client/viettelMoneyService");
const refundGateway = require("../../utils/refundGateway");

const moment = require("moment");

const { Op } = require("sequelize");

class PaymentController {
  static async momoPay(req, res) {
    try {
      const { orderId } = req.body;
      const order = await Order.findByPk(orderId);

      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      // ✅ Gửi orderCode cho MoMo (sẽ nhận lại trong callback)
      const momoOrderId = order.orderCode;

      const momoRes = await momoService.createPaymentLink({
        orderId: momoOrderId, // ✅ gửi orderCode
        amount: order.finalPrice,
        orderInfo: `Thanh toán đơn hàng ${order.orderCode}`,
      });

      if (momoRes.resultCode !== 0) {
        return res.status(400).json({
          message: "Lỗi tạo thanh toán MoMo",
          momoRes,
        });
      }

      // ✅ Lưu orderCode vào cột riêng nếu cần kiểm tra
      order.momoOrderId = momoOrderId;
      order.paymentStatus = "waiting";
      await order.save();

      return res.json({ payUrl: momoRes.payUrl });
    } catch (error) {
      console.error("MoMo error:", error);
      return res
        .status(500)
        .json({ message: "Lỗi khi tạo link thanh toán MoMo" });
    }
  }

  static async momoCallback(req, res) {
    try {
      const isPost = Object.keys(req.body).length > 0;
      const data = isPost ? req.body : req.query;

      const { orderId, resultCode, transId } = data;

      console.log("🟣 [MoMo CALLBACK] HEADERS:", req.headers);
      console.log("🟡 [MoMo CALLBACK] BODY:", data);
      console.log("🔍 orderId:", orderId);
      console.log("🔍 resultCode:", resultCode);
      console.log("🔍 transId:", transId);

      const isSuccess = Number(resultCode) === 0;

      // Nếu transId không có thì không lưu (chặn redirect giả mạo)
      if (!transId) {
        console.warn("⚠️ transId không tồn tại. Bỏ qua callback từ redirect.");
        return res.end("OK");
      }

      let order = await Order.findOne({ where: { momoOrderId: orderId } });
      if (!order)
        order = await Order.findOne({ where: { orderCode: orderId } });
      if (!order) return res.end("ORDER_NOT_FOUND");

      order.paymentStatus = "paid";
      order.momoTransId = transId;
      order.paymentTime = new Date();
      await order.save();

      console.log("✅ Ghi nhận thanh toán MoMo:", order.toJSON());

      return res.end("OK");
    } catch (err) {
      console.error("[MoMo CALLBACK] ❌ Lỗi xử lý:", err);
      return res.status(500).end("ERROR");
    }
  }
  static async zaloPay(req, res) {
    try {
      const { orderId } = req.body;
      const order = await Order.findByPk(orderId);
      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      const zaloRes = await zaloPayService.createPaymentLink({
        orderId: order.orderCode,
        amount: order.finalPrice,
        orderInfo: order.orderCode,
      });
      console.log("🧾 ZaloPay response:", zaloRes);

      console.log("🧾 ZaloPay response:", zaloRes); // ✅ thêm dòng này để xem lỗi chi tiết

      if (zaloRes.return_code !== 1) {
        return res
          .status(400)
          .json({ message: "Lỗi tạo thanh toán ZaloPay", zaloRes });
      }

      // Optionally: lưu zaloOrderId nếu cần
      // order.zaloOrderId = zaloRes.app_trans_id;
      // await order.save();

      return res.json({ payUrl: zaloRes.order_url });
    } catch (err) {
      console.error("ZaloPay error:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi tạo thanh toán ZaloPay" });
    }
  }
  static async zaloCallback(req, res) {
    try {
      console.log("📥 [ZaloPay Callback] BẮT ĐẦU ==========================");
      console.log("➡️ req.body:", req.body);
      console.log("➡️ req.query:", req.query);

      const rawData = req.body?.data || "{}";
      const parsedData = JSON.parse(rawData);

      console.log("🧾 DỮ LIỆU CALLBACK đã parse:", parsedData);

      const { embed_data, zp_trans_id, app_trans_id } = parsedData;
      console.log("🧾 CALLBACK app_id:", parsedData.app_id); // ← THÊM DÒNG NÀY

      // ✅ Lấy orderCode từ embed_data
      let orderCode = null;
      try {
        const embed = JSON.parse(embed_data);
        orderCode = embed.orderCode;
      } catch (err) {
        console.error("❌ Lỗi parse embed_data:", err);
      }

      if (!orderCode) {
        console.warn("⚠️ Thiếu orderCode trong embed_data");
        return res.status(400).send("Thiếu orderCode");
      }

      const order = await Order.findOne({ where: { orderCode } });
      if (!order) {
        console.warn("⚠️ Không tìm thấy đơn hàng:", orderCode);
        return res.status(404).send("Không tìm thấy đơn hàng");
      }

      // ✅ Cập nhật trạng thái thanh toán
      order.paymentStatus = "paid";
      order.paymentTime = new Date();
      if (zp_trans_id) order.zaloTransId = zp_trans_id;
      if (app_trans_id) order.zaloAppTransId = app_trans_id; // ← THÊM DÒNG NÀY
      await order.save();
      console.log("✅ Cập nhật đơn hàng thành công:", order.orderCode);

      const redirectUrl = `${process.env.BASE_URL}/order-confirmation?orderCode=${order.orderCode}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("❌ Lỗi xử lý ZaloPay callback:", err);
      return res.status(500).send("Server Error");
    }
  }

  static async vnpay(req, res) {
    try {
      const { orderId } = req.body;
      const { bankCode } = req.body;
      const order = await Order.findByPk(orderId);
      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      const payUrl = vnpayService.createPaymentLink({
        orderId: order.orderCode,
        amount: order.finalPrice,
        orderInfo: order.orderCode,
        bankCode, // ✅ TRUYỀN THẰNG NÀY
      });

      return res.json({ payUrl });
    } catch (err) {
      console.error("VNPay error:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi tạo thanh toán VNPay" });
    }
  }
  // trong OrderController
  static async vnpayCallback(req, res) {
    try {
      const raw = req.body.rawQuery;
      const isFromFrontend = Boolean(raw);

      // Parse query params (raw từ FE fetch hoặc query từ redirect)
      const qs = raw
        ? require("querystring").parse(raw, null, null, {
            decodeURIComponent: (v) => v, // KHÔNG decode 2 lần
          })
        : req.query;

      const vnpTxnRef = qs.vnp_TxnRef; // Đây là vnpOrderId
      const rspCode = qs.vnp_ResponseCode;
      const secureHash = qs.vnp_SecureHash;

      console.log("[VNPay CALLBACK] vnpTxnRef:", vnpTxnRef);
      console.log("[VNPay CALLBACK] Response Code:", rspCode);

      // 1. Kiểm tra chữ ký
      const isValid = vnpayService.verifySignature(qs, secureHash);
      if (!isValid) {
        console.warn("❌ Sai chữ ký!");
        return res.status(400).end("INVALID_CHECKSUM");
      }

      // 2. Tìm đơn theo vnpOrderId
      const order = await Order.findOne({
        where: {
          vnpOrderId: {
            [Op.like]: `${vnpTxnRef}%`, // dùng LIKE để match bản ghi có thêm timestamp
          },
        },
      });
      if (!order) {
        console.warn("❌ Không tìm thấy đơn với vnpOrderId:", vnpTxnRef);
        return res.status(404).end("ORDER_NOT_FOUND");
      }

      // 3. Nếu thanh toán thành công
      if (rspCode === "00") {
        order.paymentStatus = "paid";
        order.paymentTime = new Date();
        order.vnpTransactionId = qs.vnp_TransactionNo;
        await order.save();
        console.log(
          `✅ Đơn ${order.orderCode} đã thanh toán VNPay thành công.`
        );
      } else {
        // Giữ trạng thái "waiting", để CRON xử lý sau hoặc cho phép thanh toán lại
        console.log(
          `🔁 Đơn ${order.orderCode} bị huỷ hoặc lỗi VNPay, giữ trạng thái waiting.`
        );
      }

      // 4. Nếu gọi từ frontend (fetch) → chỉ trả kết quả đơn giản
      if (isFromFrontend) return res.end("OK");

      // 5. Nếu redirect từ VNPay → điều hướng về trang xác nhận
      const redirectUrl = `${process.env.BASE_URL}/order-confirmation?orderCode=${order.orderCode}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("[VNPay CALLBACK] Lỗi xử lý:", err);
      return res.status(500).end("ERROR");
    }
  }

  static async stripePay(req, res) {
    try {
      const { orderId } = req.body;
      console.log(
        `[stripePay] Bắt đầu xử lý yêu cầu thanh toán Stripe cho Order ID: ${orderId}`
      );

      const order = await Order.findByPk(orderId);
      if (!order) {
        console.warn(
          `[stripePay] Không tìm thấy đơn hàng với Order ID: ${orderId}`
        );
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }
      console.log(
        `[stripePay] Đã tìm thấy đơn hàng: ${order.orderCode} với tổng giá: ${order.finalPrice}`
      );

      // Đảm bảo rằng process.env.CLIENT_URL có scheme (http:// hoặc https://)
      // Đây là điểm mấu chốt để khắc phục lỗi "Invalid URL: An explicit scheme must be provided."
      // Bạn nên kiểm tra và sửa biến môi trường CLIENT_URL trong file .env của mình.
      // Ví dụ: CLIENT_URL=https://yourdomain.com hoặc CLIENT_URL=http://localhost:3000
      if (
        !process.env.CLIENT_URL.startsWith("http://") &&
        !process.env.CLIENT_URL.startsWith("https://")
      ) {
        console.error(
          `[stripePay] Lỗi cấu hình CLIENT_URL: Thiếu scheme (http:// hoặc https://).`
        );
        console.error(
          `[stripePay] CLIENT_URL hiện tại: ${process.env.CLIENT_URL}`
        );
        return res.status(500).json({
          message:
            "Lỗi cấu hình URL máy khách. Vui lòng kiểm tra biến môi trường CLIENT_URL.",
        });
      }

      const successUrl = `${process.env.CLIENT_URL}/order-confirmation?orderCode=${order.orderCode}`;
      const cancelUrl = `${process.env.CLIENT_URL}/checkout`;

      console.log(`[stripePay] Success URL: ${successUrl}`);
      console.log(`[stripePay] Cancel URL: ${cancelUrl}`);
      console.log(
        `[stripePay] Chuẩn bị tạo Stripe Checkout Session với giá: ${Math.round(
          order.finalPrice
        )} VND`
      );

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "vnd",
              unit_amount: Math.round(order.finalPrice), // đơn vị nhỏ nhất (ví dụ: 10000 VND -> 10000)
              product_data: {
                name: `Thanh toán đơn hàng ${order.orderCode}`,
                description: `Mã đơn hàng: ${order.orderCode}, Tổng tiền: ${order.finalPrice} VND`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          orderId: order.id,
          orderCode: order.orderCode,
        },
      });

      console.log(
        `[stripePay] Đã tạo Stripe Checkout Session thành công. Session ID: ${session.id}`
      );
      console.log(
        `[stripePay] Chuyển hướng người dùng đến URL: ${session.url}`
      );
      return res.json({ url: session.url });
    } catch (error) {
      console.error(
        "[stripePay] Đã xảy ra lỗi khi tạo session thanh toán Stripe:",
        error
      );
      // Log chi tiết lỗi Stripe nếu có
      if (error.type === "StripeInvalidRequestError") {
        console.error(
          `[stripePay] Lỗi StripeInvalidRequestError: ${error.message}`
        );
        console.error(`[stripePay] Param lỗi: ${error.param}`);
        console.error(`[stripePay] Doc URL: ${error.doc_url}`);
      }
      return res.status(500).json({
        message: "Không thể tạo session thanh toán Stripe",
        error: error.message,
      });
    }
  }
  static async handleStripeWebhook(req, res) {
    console.log("--- [Stripe Webhook] Request Received ---");
    console.log("Headers:", req.headers);
    // req.body ở đây *phải* là một Buffer (dạng raw), không phải JSON đã parse
    console.log(
      "Raw Body (should be Buffer/Text):",
      req.body
        ? req.body.toString().substring(0, 500) + "..."
        : "Body is empty/not buffer"
    ); // Log 500 ký tự đầu của body
    console.log("Stripe-Signature Header:", req.headers["stripe-signature"]);

    const sig = req.headers["stripe-signature"];

    let event;
    try {
      // stripe.webhooks.constructEvent cần raw body, KHÔNG phải JSON đã parse
      event = stripe.webhooks.constructEvent(
        req.body, // Đảm bảo đây là Buffer hoặc chuỗi raw
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      console.log(
        `✅ [Stripe Webhook] Event Constructed Successfully. Type: ${event.type}`
      );
    } catch (err) {
      console.error(
        "❌ [Stripe Webhook] Signature Verification Failed or Event Construction Error:",
        err.message
      );
      // Ghi lại toàn bộ lỗi nếu có để debug
      console.error("[Stripe Webhook] Full Error:", err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Xử lý các loại sự kiện khác nhau
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        const { orderCode, orderId } = session.metadata || {};

        console.log(
          `✨ [Stripe Webhook] Checkout Session Completed Event Received!`
        );
        console.log(`Session ID: ${session.id}`);
        console.log(`Payment Status (from Stripe): ${session.payment_status}`);
        console.log(`Metadata - OrderCode: ${orderCode}, OrderID: ${orderId}`);
        console.log(`Customer Email: ${session.customer_details?.email}`);
        console.log(`Amount Total: ${session.amount_total}`); // amount_total là cent/vnd, bạn cần chia lại nếu lưu theo đơn vị lớn

        if (!orderCode) {
          console.warn(
            `[Stripe Webhook] Metadata 'orderCode' missing from session for Session ID: ${session.id}`
          );
          return res.status(400).send("Metadata orderCode missing.");
        }

        const t = await sequelize.transaction(); // Bắt đầu transaction
        try {
          const order = await Order.findOne({
            where: { orderCode },
            transaction: t,
          });
          if (!order) {
            console.warn(
              `[Stripe Webhook] Order not found in DB for OrderCode: ${orderCode}`
            );
            await t.rollback();
            return res.status(404).send("Order not found.");
          }
          console.log(
            `[Stripe Webhook] Found Order in DB. Current Status: ${order.status}, PaymentStatus: ${order.paymentStatus}`
          );

          // Kiểm tra nếu thanh toán đã được xử lý trước đó để tránh trùng lặp
          if (order.paymentStatus === "paid" && order.status === "processing") {
            console.log(
              `[Stripe Webhook] Order ${orderCode} already marked as paid/processing. Skipping update.`
            );
            await t.commit(); // Commit transaction dù không thay đổi gì
            return res.status(200).send("OK - Already processed.");
          }

          // Lấy PaymentMethodId cho Stripe
          // Đảm bảo bạn có một record 'Stripe' trong bảng PaymentMethods của mình
          const stripePaymentMethod = await PaymentMethod.findOne({
            where: { code: "stripe" }, // Giả sử code cho Stripe là 'stripe'
            transaction: t,
          });

          if (!stripePaymentMethod) {
            console.error(
              `[Stripe Webhook] ERROR: PaymentMethod with code 'stripe' not found in database!`
            );
            await t.rollback();
            return res
              .status(500)
              .send(
                "Internal Server Error: Stripe payment method not configured."
              );
          }

          // Cập nhật trạng thái đơn hàng
          order.status = "processing"; // Hoặc 'completed' nếu bạn muốn thanh toán xong là hoàn thành luôn
          order.paymentStatus = "paid";
          order.paymentTime = new Date();
          order.stripeSessionId = session.id; // Lưu Stripe Session ID
          order.stripePaymentIntentId = session.payment_intent; // ✅ Dòng bạn thiếu
          order.paymentMethodId = stripePaymentMethod.id; // Gán ID phương thức thanh toán Stripe

          await order.save({ transaction: t });
          console.log(
            `[Stripe Webhook] ✅ Order ${orderCode} updated to status '${order.status}' and paymentStatus '${order.paymentStatus}'.`
          );

          // Gửi email xác nhận, thông báo cho admin, v.v.
          // ... (ví dụ: email cho user)
          const user = await order.getUser(); // Giả sử mối quan hệ User với Order
          if (user) {
            const emailHtml = `
                  <h2>Đơn hàng ${
                    order.orderCode
                  } của bạn đã thanh toán thành công!</h2>
                  <p>Xin chào ${user.fullName || "khách hàng"},</p>
                  <p>Chúng tôi đã nhận được thanh toán cho đơn hàng của bạn.</p>
                  <p>Mã đơn hàng: <b>${order.orderCode}</b></p>
                  <p>Tổng tiền đã thanh toán: <b>${order.finalPrice.toLocaleString(
                    "vi-VN"
                  )}₫</b></p>
                  <p>Phương thức thanh toán: <b>Stripe</b></p>
                  <p>Đơn hàng của bạn đang được xử lý và sẽ sớm được giao.</p>
                  <br />
                  <p>Trân trọng,</p>
                  <p>Đội ngũ hỗ trợ PHT Shop</p>
              `;
            try {
              await sendEmail(
                user.email,
                `Xác nhận thanh toán đơn hàng ${order.orderCode} thành công!`,
                emailHtml
              );
              console.log(
                `[Stripe Webhook] Email xác nhận đã gửi cho ${user.email}`
              );
            } catch (emailErr) {
              console.error(
                "[Stripe Webhook] Lỗi gửi email xác nhận:",
                emailErr
              );
            }
          }

          await t.commit(); // Commit transaction nếu mọi thứ thành công
          console.log(
            `[Stripe Webhook] Transaction committed for Order ${orderCode}.`
          );
          return res.status(200).send("OK");
        } catch (err) {
          await t.rollback(); // Rollback transaction nếu có lỗi
          console.error(
            `[Stripe Webhook] ❌ Error processing checkout.session.completed for OrderCode ${orderCode}:`,
            err
          );
          return res.status(500).send("Server Error processing event.");
        }

      case "payment_intent.succeeded":
        // Đây là sự kiện cho Payment Intent (nếu bạn dùng Payment Element/Card Element)
        // Hiện tại code của bạn dùng Checkout Session, nhưng nếu mở rộng bạn sẽ cần cái này.
        console.log(
          "✨ [Stripe Webhook] Payment Intent Succeeded Event Received."
        );
        console.log("Payment Intent ID:", event.data.object.id);
        // Logic xử lý Payment Intent (nếu có)
        return res.status(200).send("OK"); // Trả về 200 để Stripe biết bạn đã nhận

      case "payment_intent.payment_failed":
        // Xử lý khi Payment Intent thất bại
        console.log(
          "⚠️ [Stripe Webhook] Payment Intent Failed Event Received."
        );
        console.log("Payment Intent ID:", event.data.object.id);
        // Logic xử lý thất bại (cập nhật trạng thái đơn hàng về failed, gửi thông báo...)
        return res.status(200).send("OK");

      // Thêm các trường hợp khác nếu cần (ví dụ: invoice.payment_succeeded, customer.subscription.created, etc.)
      default:
        console.log(`🤷 [Stripe Webhook] Unhandled event type: ${event.type}`);
        // Luôn trả về 200 OK cho các sự kiện không xử lý để tránh Stripe gửi lại nhiều lần
        return res.status(200).send("OK - Unhandled event type.");
    }
  }

  static async generateVietQR(req, res) {
    try {
      const { accountNumber, accountName, bankCode, amount, message } =
        req.body;

      console.log("⚡ [generate VietQR] Nhận request với dữ liệu:", {
        accountNumber,
        accountName,
        bankCode,
        amount,
        message,
      });

      if (!accountNumber || !accountName || !bankCode || !amount || !message) {
        console.warn("⚠️ [generate VietQR] Thiếu thông tin cần thiết:", {
          accountNumber: !!accountNumber,
          accountName: !!accountName,
          bankCode: !!bankCode,
          amount: !!amount,
          message: !!message,
        });
        return res.status(400).json({ message: "Thiếu thông tin cần thiết." });
      }

      const encodedMessage = encodeURIComponent(message);

      const vietqrUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-basic.png?amount=${amount}&addInfo=${encodedMessage}`;

      console.log("✅ [generate VietQR] URL QR đã tạo:", vietqrUrl);

      return res.json({
        qrImage: vietqrUrl,
        accountNumber,
        accountName,
        bankCode,
        message,
      });
    } catch (error) {
      console.error(
        "❌ [generate VietQR] Lỗi khi sinh QR VietQR:",
        error.message || error
      );
      res.status(500).json({ message: "Không thể tạo VietQR." });
    }
  }

  static async payAgain(req, res) {
    try {
      const { id } = req.params;
      const { bankCode = "" } = req.body;

      const order = await Order.findByPk(id, {
        include: {
          model: PaymentMethod,
          as: "paymentMethod",
          attributes: ["code"],
        },
      });

      // 1. Kiểm tra hợp lệ
      if (
        !order ||
        order.paymentStatus !== "waiting" ||
        order.status !== "processing"
      ) {
        return res
          .status(400)
          .json({ message: "Đơn không hợp lệ để thanh toán lại" });
      }

      const gateway = order.paymentMethod.code.toLowerCase();
      let payUrl = null;

      switch (gateway) {
        case "momo": {
          const momoOrderId = `${order.orderCode}${Date.now()
            .toString()
            .slice(-6)}`;
          const momoRes = await momoService.createPaymentLink({
            orderId: momoOrderId,
            amount: order.finalPrice,
            orderInfo: `Thanh toán lại đơn ${order.orderCode}`,
          });

          if (momoRes.resultCode !== 0)
            return res.status(400).json({ message: "MoMo lỗi", momoRes });

          order.momoOrderId = momoOrderId;
          payUrl = momoRes.payUrl;
          break;
        }

        case "vnpay": {
          const suffix = moment().format("HHmmss"); // hoặc Date.now().toString().slice(-6)
          const vnpOrderId = `${order.orderCode}${suffix}`; // KHÔNG DÙNG DẤU `-`

          order.vnpOrderId = vnpOrderId;

          const amount = order.finalPrice;
          const orderInfo = `Thanh toán lại đơn ${order.orderCode}`;

          payUrl = vnpayService.createPaymentLink({
            orderId: vnpOrderId,
            amount,
            orderInfo,
            bankCode,
          });

          // 🔍 LOG THÔNG TIN DEBUG
          console.log("\n--- [payAgain: VNPAY] ---");
          console.log("✅ orderCode:", order.orderCode);
          console.log("✅ vnpOrderId:", vnpOrderId);
          console.log("✅ amount:", amount);
          console.log("✅ bankCode:", bankCode);
          console.log("✅ orderInfo:", orderInfo);
          console.log("✅ payUrl:", payUrl);
          console.log("--------------------------\n");

          break;
        }

        case "zalopay": {
          const zaloRes = await zaloPayService.createPaymentLink({
            orderId: order.orderCode,
            amount: order.finalPrice,
            orderInfo: order.orderCode,
          });

          if (zaloRes.return_code !== 1)
            return res.status(400).json({ message: "ZaloPay lỗi", zaloRes });

          payUrl = zaloRes.order_url;
          break;
        }
        case "stripe": {
          const successUrl = `${process.env.CLIENT_URL}/order-confirmation?orderCode=${order.orderCode}`;
          const cancelUrl = `${process.env.CLIENT_URL}/checkout`;

          const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items: [
              {
                price_data: {
                  currency: "vnd",
                  unit_amount: Math.round(order.finalPrice),
                  product_data: {
                    name: `Thanh toán lại đơn hàng ${order.orderCode}`,
                    description: `Mã: ${order.orderCode}, Tổng tiền: ${order.finalPrice} VND`,
                  },
                },
                quantity: 1,
              },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
              orderId: order.id,
              orderCode: order.orderCode,
            },
          });

          order.stripeSessionId = session.id;

          payUrl = session.url;

          console.log("\n--- [payAgain: STRIPE] ---");
          console.log("✅ orderCode:", order.orderCode);
          console.log("✅ amount:", order.finalPrice);
          console.log("✅ sessionId:", session.id);
          console.log("✅ payUrl:", payUrl);
          console.log("--------------------------\n");

          break;
        }

        case "viettel_money": {
          const billCode = `VT${order.orderCode}${Date.now()
            .toString()
            .slice(-6)}`;
          payUrl = viettelMoneyService.createPaymentLink({
            orderId: order.orderCode,
            billCode,
            amount: order.finalPrice,
            orderInfo: `Thanh toán lại đơn ${order.orderCode}`,
          });
          break;
        }

        default:
          return res.status(400).json({
            message: "Phương thức thanh toán không hỗ trợ thanh toán lại",
          });
      }

      await order.save(); // 💾 Lưu vnpOrderId / momoOrderId nếu có

      return res.json({ payUrl });
    } catch (err) {
      console.error("[payAgain]", err);
      return res
        .status(500)
        .json({ message: "Không tạo được link thanh toán lại" });
    }
  }
  static async getPaymentMethods(req, res) {
    try {
      const methods = await PaymentMethod.findAll({
        where: { isActive: true },
        attributes: ["id", "code", "name"],
        order: [["id", "ASC"]],
      });

      return res.json({
        message: "Lấy danh sách phương thức thanh toán thành công",
        data: methods,
      });
    } catch (err) {
      console.error("[getPaymentMethods] Lỗi:", err);
      return res.status(500).json({
        message: "Không thể lấy danh sách phương thức thanh toán",
      });
    }
  }
  static async uploadProof(req, res) {
    try {
      const { id } = req.params;
      if (!req.file || !req.file.path) {
        return res.status(400).json({ message: "Thiếu file chứng từ" });
      }

      const order = await Order.findByPk(id);
      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      // Lưu URL lên trường proofUrl
      order.proofUrl = req.file.path;
      await order.save();

      return res.json({
        message: "Upload chứng từ thành công",
        proofUrl: order.proofUrl,
      });
    } catch (err) {
      console.error("Lỗi upload chứng từ:", err);
      return res.status(500).json({ message: "Không thể upload chứng từ" });
    }
  }
}

module.exports = PaymentController;
