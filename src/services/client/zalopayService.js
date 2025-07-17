const crypto = require("crypto");
const axios = require("axios");

// Lấy giá trị từ biến môi trường
const ZALOPAY_APP_ID = process.env.ZALOPAY_APP_ID;
const ZALOPAY_KEY1 = process.env.ZALOPAY_KEY1;
const ZALOPAY_KEY2 = process.env.ZALOPAY_KEY2;
const ZALOPAY_CALLBACK_URL = process.env.ZALOPAY_CALLBACK_URL;
const ZALOPAY_REDIRECT_URL = process.env.ZALOPAY_REDIRECT_URL;

const ZALO_ENDPOINT = "https://sb-openapi.zalopay.vn/v2/create";


exports.createPaymentLink = async ({ orderId, amount, orderInfo }) => {
    console.log("DEBUG: ZALOPAY_APP_ID:", ZALOPAY_APP_ID);
    console.log("DEBUG: ZALOPAY_KEY1:", ZALOPAY_KEY1);
    console.log("DEBUG: ZALOPAY_CALLBACK_URL:", ZALOPAY_CALLBACK_URL);

    if (!ZALOPAY_APP_ID || !ZALOPAY_KEY1 || !ZALOPAY_CALLBACK_URL) {
        console.error("LỖI CẤU HÌNH ZALOPAY: Thiếu các biến môi trường ZALOPAY_APP_ID, ZALOPAY_KEY1, hoặc ZALOPAY_CALLBACK_URL.");
        throw new Error("Thiếu cấu hình ZaloPay trong .env");
    }

    const transId = Math.floor(Math.random() * 1000000);
    const app_trans_id_value = `${new Date().toISOString().slice(2, 10).replace(/-/g, "")}_${transId}`; // Tên mới để tránh nhầm lẫn
    const app_time_value = Date.now(); // Tên mới

    const itemData = [
        { itemid: "product_001", itemname: "Sản phẩm test", itemquantity: 1, itemprice: Math.round(amount) }
    ];
    
  const embedData = {
  redirecturl: `${ZALOPAY_REDIRECT_URL}?orderCode=${orderId}`, // orderId ở đây là order.orderCode
};


    // TẠO ĐỐI TƯỢNG order ĐỂ GỬI ĐI VỚI TÊN TRƯỜNG CÓ DẤU GẠCH DƯỚI NHƯ TRONG PAYLOAD MẪU CỦA ZALOPAY
    const orderPayload = {
        app_id: Number(ZALOPAY_APP_ID), // DÙNG app_id có gạch dưới trong payload gửi đi
        app_trans_id: app_trans_id_value, // DÙNG app_trans_id có gạch dưới trong payload gửi đi
        app_user: "ZaloPayDemo",         // DÙNG app_user có gạch dưới trong payload gửi đi
        amount: Math.round(amount),
        app_time: app_time_value,
        description: `Thanh toan don hang ${orderInfo?.replace(/[^a-zA-Z0-9-]/g, "") || "ZaloOrder"}`,
      bank_code: "atm",

        item: JSON.stringify(itemData),
        embed_data: JSON.stringify(embedData), // DÙNG embed_data có gạch dưới trong payload gửi đi
        callback_url: ZALOPAY_CALLBACK_URL,  // DÙNG callback_url có gạch dưới trong payload gửi đi
    };


    // TÍNH MAC VẪN DÙNG CÁC TÊN TRƯỜNG KHÔNG CÓ DẤU GẠCH DƯỚI VÀ DỮ LIỆU ĐỂ TÍNH MAC
    // Vì công thức MAC yêu cầu: appid|apptransid|appuser|amount|apptime|embed_data|item
    // CHÚ Ý: CÁC TRƯỜNG embed_data và item VẪN PHẢI LÀ STRING JSON ĐỂ TÍNH MAC ĐÚNG
    const dataForMac = `${Number(ZALOPAY_APP_ID)}|${app_trans_id_value}|ZaloPayDemo|${Math.round(amount)}|${app_time_value}|${JSON.stringify(embedData)}|${JSON.stringify(itemData)}`;
    
    console.log("DEBUG FINAL: Chuỗi DATA để tính MAC:", dataForMac);
    console.log("DEBUG FINAL: ZALOPAY_KEY1 dùng để tính MAC:", ZALOPAY_KEY1);

    orderPayload.mac = crypto.createHmac("sha256", ZALOPAY_KEY1).update(dataForMac).digest("hex");

    console.log("DEBUG FINAL: MAC đã tính:", orderPayload.mac);

    console.log("📤 Sending to ZaloPay (FULL ORDER PAYLOAD):", JSON.stringify(orderPayload, null, 2));

    try {
        const response = await axios.post(ZALO_ENDPOINT, orderPayload, { // Gửi orderPayload đi
            headers: {
                "Content-Type": "application/json"
            }
        });

        console.log("✅ ZaloPay response:", response.data);
        return response.data;
    } catch (err) {
        console.error("❌ ZaloPay error:", err?.response?.data || err.message);
        throw err;
    }
};
exports.refund = async ({ app_trans_id, zp_trans_id, amount, user = "admin" }) => {
  const endpoint = "https://sb-openapi.zalopay.vn/v2/refund";

  const requestId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
  const timestamp = Date.now();

  const dataMac = `${ZALOPAY_APP_ID}|${zp_trans_id}|${app_trans_id}|${Math.round(amount)}|${timestamp}`;
  const mac = crypto.createHmac("sha256", ZALOPAY_KEY1).update(dataMac).digest("hex");

  const payload = {
    app_id: ZALOPAY_APP_ID,
    zp_trans_id,        // mã giao dịch ZaloPay trả về khi thanh toán
    app_trans_id,       // mã giao dịch nội bộ (giống lúc tạo đơn)
    amount: Math.round(amount),
    timestamp,
    mac
  };

  console.log("📤 Gửi refund ZaloPay:", payload);

  try {
    const res = await axios.post(endpoint, payload, {
      headers: {
        "Content-Type": "application/json"
      }
    });

    console.log("✅ Kết quả hoàn tiền ZaloPay:", res.data);
    return res.data;
  } catch (err) {
    console.error("❌ Lỗi hoàn tiền ZaloPay:", err?.response?.data || err.message);
    throw err;
  }
};
