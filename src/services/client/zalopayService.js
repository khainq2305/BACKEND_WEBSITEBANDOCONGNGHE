const crypto = require("crypto");
const axios = require("axios");

// Lấy giá trị từ biến môi trường
const ZALOPAY_APP_ID = process.env.ZALOPAY_APP_ID;
const ZALOPAY_KEY1 = process.env.ZALOPAY_KEY1; // Key1 dùng cho tạo đơn hàng
const ZALOPAY_KEY2 = process.env.ZALOPAY_KEY2; // Key2 dùng cho hoàn tiền và kiểm tra trạng thái
const ZALOPAY_CALLBACK_URL = process.env.ZALOPAY_CALLBACK_URL;
const ZALOPAY_REDIRECT_URL = process.env.ZALOPAY_REDIRECT_URL;

const ZALO_CREATE_ORDER_ENDPOINT = "https://sb-openapi.zalopay.vn/v2/create"; // Endpoint tạo đơn hàng
const ZALO_QUERY_ENDPOINT = 'https://sb-openapi.zalopay.vn/v2/query'; // Endpoint truy vấn trạng thái
const ZALO_REFUND_ENDPOINT = 'https://sb-openapi.zalopay.vn/v2/refund'; // Endpoint hoàn tiền

// Hàm tạo link thanh toán ZaloPay
exports.createPaymentLink = async ({ orderId, amount, orderInfo, paymentMethod }) => {
    console.log("--- BẮT ĐẦU HÀM createPaymentLink ---");
    console.log("DEBUG createPaymentLink: ZALOPAY_APP_ID (từ env):", ZALOPAY_APP_ID);
    console.log("DEBUG createPaymentLink: ZALOPAY_KEY1 (từ env):", ZALOPAY_KEY1);
    console.log("DEBUG createPaymentLink: ZALOPAY_CALLBACK_URL (từ env):", ZALOPAY_CALLBACK_URL);
    console.log("DEBUG createPaymentLink: paymentMethod (nếu có):", paymentMethod);

    if (!ZALOPAY_APP_ID || !ZALOPAY_KEY1 || !ZALOPAY_CALLBACK_URL) {
        console.error("LỖI CẤU HÌNH ZALOPAY: Thiếu các biến môi trường ZALOPAY_APP_ID, ZALOPAY_KEY1, hoặc ZALOPAY_CALLBACK_URL.");
        throw new Error("Thiếu cấu hình ZaloPay trong .env");
    }
    console.log("DEBUG createPaymentLink: Cấu hình ZaloPay đã được kiểm tra.");

    const transId = Math.floor(Math.random() * 1000000);
    console.log("DEBUG createPaymentLink: transId ngẫu nhiên:", transId);

    const app_trans_id_value = `${new Date().toISOString().slice(2, 10).replace(/-/g, "")}_${transId}`; // VD: 250717_123456
    console.log("DEBUG createPaymentLink: app_trans_id_value:", app_trans_id_value);

    const app_time_value = Date.now();
    console.log("DEBUG createPaymentLink: app_time_value (timestamp):", app_time_value);

    const itemData = [
        { itemid: "product_001", itemname: "Sản phẩm test", itemquantity: 1, itemprice: Math.round(amount) }
    ];
    console.log("DEBUG createPaymentLink: itemData:", itemData);

    const embedData = {
        redirecturl: `${ZALOPAY_REDIRECT_URL}?orderCode=${orderId}`,
        orderCode: orderId // dùng cái này để lấy ra trong callback
    };
    console.log("DEBUG createPaymentLink: embedData:", embedData);

    const orderPayload = {
        app_id: Number(ZALOPAY_APP_ID),
        app_trans_id: app_trans_id_value,
        app_user: "ZaloPayDemo",
        amount: Math.round(amount),
        app_time: app_time_value,
        description: `Thanh toan don hang ${orderInfo?.replace(/[^a-zA-Z0-9-]/g, "") || "ZaloOrder"}`,
        item: JSON.stringify(itemData),
        embed_data: JSON.stringify(embedData),
        callback_url: ZALOPAY_CALLBACK_URL,
    };
    console.log("DEBUG createPaymentLink: orderPayload ban đầu:", orderPayload);

    // Thêm bank_code nếu paymentMethod được cung cấp
    if (paymentMethod) {
        orderPayload.bank_code = paymentMethod;
        console.log(`DEBUG createPaymentLink: Đã đặt bank_code: ${paymentMethod}`);
    } else {
        console.log("DEBUG createPaymentLink: Không đặt bank_code, ZaloPay sẽ hiển thị tất cả các phương thức.");
    }
    console.log("DEBUG createPaymentLink: orderPayload sau khi xử lý bank_code:", orderPayload);

    const dataForMac = `${orderPayload.app_id}|${orderPayload.app_trans_id}|${orderPayload.app_user}|${orderPayload.amount}|${orderPayload.app_time}|${orderPayload.embed_data}|${orderPayload.item}`;
    console.log("DEBUG createPaymentLink: Chuỗi DATA để tính MAC (tạo đơn):", dataForMac);
    console.log("DEBUG createPaymentLink: ZALOPAY_KEY1 dùng để tính MAC (tạo đơn):", ZALOPAY_KEY1);

    orderPayload.mac = crypto.createHmac("sha256", ZALOPAY_KEY1).update(dataForMac).digest("hex");
    console.log("DEBUG createPaymentLink: MAC đã tính (tạo đơn):", orderPayload.mac);

    console.log("📤 Sending to ZaloPay (FULL ORDER PAYLOAD):", JSON.stringify(orderPayload, null, 2));

    try {
        const response = await axios.post(ZALO_CREATE_ORDER_ENDPOINT, orderPayload, {
            headers: { "Content-Type": "application/json" }
        });
        console.log("DEBUG createPaymentLink: Đã nhận phản hồi từ ZaloPay.");
        console.log("✅ ZaloPay response (tạo đơn):", response.data);
        console.log("--- KẾT THÚC HÀM createPaymentLink ---");
        return response.data;
    } catch (err) {
        console.error("❌ ZaloPay error (tạo đơn):", err?.response?.data || err.message);
        console.log("--- KẾT THÚC HÀM createPaymentLink VỚI LỖI ---");
        throw err;
    }
};

// Hàm truy vấn trạng thái giao dịch ZaloPay
exports.queryTransaction = async (app_trans_id) => {
  console.log("--- BẮT ĐẦU HÀM queryTransaction ---");
  // --- Thêm các log DEBUG này để kiểm tra đầu vào và quá trình tạo request ---
  console.log("DEBUG queryTransaction: Đang truy vấn giao dịch:");
  console.log("DEBUG queryTransaction: ZALOPAY_APP_ID (từ env):", ZALOPAY_APP_ID);
  console.log("DEBUG queryTransaction: app_trans_id nhận vào:", app_trans_id);
  console.log("DEBUG queryTransaction: ZALOPAY_KEY2 (từ env):", ZALOPAY_KEY2);
  // --- Kết thúc thêm log DEBUG ---

  const dataMac = `${ZALOPAY_APP_ID}|${app_trans_id}|${ZALOPAY_KEY2}`;
  const mac = crypto.createHmac("sha256", ZALOPAY_KEY2).update(dataMac).digest("hex");

  // --- Thêm các log DEBUG này để kiểm tra chuỗi MAC ---
  console.log("DEBUG queryTransaction: Chuỗi dữ liệu tính MAC:", dataMac);
  console.log("DEBUG queryTransaction: MAC đã tính:", mac);
  // --- Kết thúc thêm log DEBUG ---

  const payload = {
    appid: ZALOPAY_APP_ID,
    app_trans_id,
    mac,
  };

  // --- Thêm các log DEBUG này để kiểm tra payload cuối cùng ---
  console.log("DEBUG queryTransaction: Payload gửi đi:", payload);
  // --- Kết thúc thêm log DEBUG ---

  const form = new URLSearchParams(payload);
  console.log("DEBUG queryTransaction: Payload dạng URLSearchParams:", form.toString());

  try {
    console.log("DEBUG queryTransaction: Đang gửi yêu cầu POST đến ZALO_QUERY_ENDPOINT:", ZALO_QUERY_ENDPOINT);
    const res = await axios.post(ZALO_QUERY_ENDPOINT, form.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    console.log("DEBUG queryTransaction: Đã nhận phản hồi từ ZaloPay.");
    console.log("✅ ZaloPay QUERY RESULT:", res.data);
    console.log("--- KẾT THÚC HÀM queryTransaction ---");
    return res.data;
  } catch (err) {
    console.error("❌ ZaloPay QUERY ERROR:", err?.response?.data || err.message);
    console.log("--- KẾT THÚC HÀM queryTransaction VỚI LỖI ---");
    throw err;
  }
};

// Hàm hoàn tiền ZaloPay
exports.refund = async ({ app_trans_id, zp_trans_id, amount, description = "Hoan tien" }) => {
  console.log("--- BẮT ĐẦU HÀM refund ---");
  console.log("DEBUG refund: Các tham số nhận vào: app_trans_id=", app_trans_id, ", zp_trans_id=", zp_trans_id, ", amount=", amount, ", description=", description);

  if (!app_trans_id || !zp_trans_id || !amount) {
    console.error("LỖI REFUND: Thiếu app_trans_id, zp_trans_id hoặc amount để hoàn tiền ZaloPay");
    throw new Error("Thiếu app_trans_id, zp_trans_id hoặc amount để hoàn tiền ZaloPay");
  }
  console.log("DEBUG refund: Các tham số đầu vào đã được kiểm tra.");

  // LƯU Ý: Đoạn code kiểm tra trạng thái giao dịch bằng queryTransaction đã bị BỎ QUA
  // Điều này có thể dẫn đến việc cố gắng hoàn tiền một giao dịch không hợp lệ.
  // Trong môi trường production, bạn nên luôn kiểm tra trạng thái giao dịch trước.
  // const result = await exports.queryTransaction(app_trans_id);
  // console.log("ZaloPay Transaction Status:", result);
  // if (result.return_code !== 1 || result.is_processing) {
  //   throw new Error("Giao dịch chưa hoàn tất hoặc không hợp lệ để hoàn tiền");
  // }
  console.log("DEBUG refund: Bỏ qua bước kiểm tra trạng thái giao dịch (queryTransaction).");

  // Lấy timestamp hiện tại (miliseconds)
  const timestamp = Date.now();
  console.log("DEBUG refund: timestamp hiện tại (miliseconds):", timestamp);

  // Tạo Refund ID duy nhất theo định dạng: yymmdd_appid_random
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const m_refund_id = `${datePart}_${ZALOPAY_APP_ID}_${Math.floor(Math.random() * 1000000)}`;
  console.log("DEBUG refund: m_refund_id (Refund ID duy nhất):", m_refund_id);

  // Làm tròn và ép kiểu string cho các tham số cần thiết theo yêu cầu của ZaloPay
  const amountInt = Math.round(Number(amount));
  // const amountStr = String(amountInt); // Chuyển đổi thành chuỗi cho MAC và payload form-urlencoded (Bỏ dòng này)
  // const timestampStr = String(timestamp); // Chuyển đổi thành chuỗi cho MAC và payload form-urlencoded (Bỏ dòng này)
  const ZALOPAY_APP_ID_NUM = Number(String(ZALOPAY_APP_ID).trim()); // Đảm bảo AppID là số và đã trim từ nguồn
  const ZALOPAY_KEY2_TRIMMED = ZALOPAY_KEY2.trim(); // Thêm .trim()

  console.log("DEBUG refund: amount (đã làm tròn):", amountInt); // Giữ nguyên số nguyên
  console.log("DEBUG refund: timestamp (dạng số nguyên):", timestamp);
  console.log("DEBUG refund: appid (dạng số nguyên, đã trim từ nguồn):", ZALOPAY_APP_ID_NUM);
  console.log("DEBUG refund: ZALOPAY_KEY2 (đã trim):", ZALOPAY_KEY2_TRIMMED);

  // Chuỗi dữ liệu để tính MAC theo tài liệu ZaloPay: appid|zptransid|amount|description|timestamp
  // Sử dụng các giá trị số nguyên trực tiếp trong template literal để JavaScript tự chuyển đổi thành chuỗi
  const dataMac = `${ZALOPAY_APP_ID_NUM}|${zp_trans_id}|${amountInt}|${description.trim()}|${timestamp}`; 
  console.log("========== ZALOPAY REFUND DEBUG ==========");
  console.log("🧾 app_id (số nguyên):", ZALOPAY_APP_ID_NUM);
  console.log("🧾 key2 (dùng để tính MAC):", ZALOPAY_KEY2_TRIMMED);
  console.log("🧾 m_refund_id:", m_refund_id);
  console.log("🧾 zp_trans_id:", zp_trans_id);
  console.log("🧾 amount (số nguyên, cho MAC):", amountInt);
  console.log("🧾 timestamp (số nguyên, cho MAC):", timestamp);
  console.log("🧾 description (clean, đã trim):", description.trim());
  console.log("🔐 MAC STRING (để tính MAC):", dataMac);
  console.log("===========================================");

  // Tính MAC
  const mac = crypto.createHmac("sha256", ZALOPAY_KEY2_TRIMMED).update(dataMac).digest("hex");
  console.log("🔐 MAC đã tính:", mac);

  // Tạo payload hoàn tiền (sử dụng các giá trị dạng số nguyên cho appid, amount, timestamp)
  const payload = {
    appid: ZALOPAY_APP_ID_NUM, // Gửi dưới dạng số nguyên
    m_refund_id,
    zp_trans_id,
    amount: amountInt, // Gửi dưới dạng số nguyên
    timestamp: timestamp, // Gửi dưới dạng số nguyên
    description: description.trim(), // Sử dụng chuỗi đã trim
    mac,
  };

  console.log("📦 FINAL REFUND PAYLOAD (dạng Object):", payload);
  const form = new URLSearchParams(payload);
  console.log("📦 FINAL REFUND PAYLOAD (dạng URLSearchParams):", form.toString());
  console.log("===========================================");

  try {
    console.log("DEBUG refund: Đang gửi yêu cầu POST đến ZALO_REFUND_ENDPOINT:", ZALO_REFUND_ENDPOINT);
    const res = await axios.post(ZALO_REFUND_ENDPOINT, form.toString(), { // Gửi dạng form-urlencoded
      headers: {
        "Content-Type": "application/x-www-form-urlencoded", // Content-Type đúng
      },
    });
    console.log("DEBUG refund: Đã nhận phản hồi từ ZaloPay.");
    console.log("✅ ZaloPay REFUND RESULT:", res.data);
    console.log("--- KẾT THÚC HÀM refund ---");
    return res.data;
  } catch (err) {
    console.error("❌ ZaloPay REFUND ERROR:", err?.response?.data || err.message);
    console.log("--- KẾT THÚC HÀM refund VỚI LỖI ---");
    throw err;
  }
};
