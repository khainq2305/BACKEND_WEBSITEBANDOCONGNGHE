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

exports.createPaymentLink = async ({ orderId, amount, orderInfo, paymentMethod }) => {
   

    if (!ZALOPAY_APP_ID || !ZALOPAY_KEY1 || !ZALOPAY_CALLBACK_URL) {
        console.error("LỖI CẤU HÌNH ZALOPAY: Thiếu các biến môi trường ZALOPAY_APP_ID, ZALOPAY_KEY1, hoặc ZALOPAY_CALLBACK_URL.");
        throw new Error("Thiếu cấu hình ZaloPay trong .env");
    }
  

    const transId = Math.floor(Math.random() * 1000000);
  

    const app_trans_id_value = `${new Date().toISOString().slice(2, 10).replace(/-/g, "")}_${transId}`; // VD: 250717_123456
   

    const app_time_value = Date.now();


    const itemData = [
        { itemid: "product_001", itemname: "Sản phẩm test", itemquantity: 1, itemprice: Math.round(amount) }
    ];
   

    const embedData = {
        redirecturl: `${ZALOPAY_REDIRECT_URL}?orderCode=${orderId}`,
        orderCode: orderId // dùng cái này để lấy ra trong callback
    };
    

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
   

    // Thêm bank_code nếu paymentMethod được cung cấp
    if (paymentMethod) {
        orderPayload.bank_code = paymentMethod;
       
    } else {
       
    }
    

    const dataForMac = `${orderPayload.app_id}|${orderPayload.app_trans_id}|${orderPayload.app_user}|${orderPayload.amount}|${orderPayload.app_time}|${orderPayload.embed_data}|${orderPayload.item}`;
   

    orderPayload.mac = crypto.createHmac("sha256", ZALOPAY_KEY1).update(dataForMac).digest("hex");
   

    try {
        const response = await axios.post(ZALO_CREATE_ORDER_ENDPOINT, orderPayload, {
            headers: { "Content-Type": "application/json" }
        });
        
        return response.data;
    } catch (err) {
        
        throw err;
    }
};

// Hàm truy vấn trạng thái giao dịch ZaloPay
exports.queryTransaction = async (app_trans_id) => {
 

  const dataMac = `${ZALOPAY_APP_ID}|${app_trans_id}|${ZALOPAY_KEY2}`;
  const mac = crypto.createHmac("sha256", ZALOPAY_KEY2).update(dataMac).digest("hex");



  const payload = {
    appid: ZALOPAY_APP_ID,
    app_trans_id,
    mac,
  };

  

  const form = new URLSearchParams(payload);


  try {
   
    const res = await axios.post(ZALO_QUERY_ENDPOINT, form.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  
    return res.data;
  } catch (err) {
   
    throw err;
  }
};

// Hàm hoàn tiền ZaloPay
exports.refund = async ({ app_trans_id, zp_trans_id, amount, description = "Hoan tien" }) => {


  if (!app_trans_id || !zp_trans_id || !amount) {
    console.error("LỖI REFUND: Thiếu app_trans_id, zp_trans_id hoặc amount để hoàn tiền ZaloPay");
    throw new Error("Thiếu app_trans_id, zp_trans_id hoặc amount để hoàn tiền ZaloPay");
  }

  

  // Lấy timestamp hiện tại (miliseconds)
  const timestamp = Date.now();
 
  // Tạo Refund ID duy nhất theo định dạng: yymmdd_appid_random
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const m_refund_id = `${datePart}_${ZALOPAY_APP_ID}_${Math.floor(Math.random() * 1000000)}`;

  // Làm tròn và ép kiểu string cho các tham số cần thiết theo yêu cầu của ZaloPay
  const amountInt = Math.round(Number(amount));
  // const amountStr = String(amountInt); // Chuyển đổi thành chuỗi cho MAC và payload form-urlencoded (Bỏ dòng này)
  // const timestampStr = String(timestamp); // Chuyển đổi thành chuỗi cho MAC và payload form-urlencoded (Bỏ dòng này)
  const ZALOPAY_APP_ID_NUM = Number(String(ZALOPAY_APP_ID).trim()); // Đảm bảo AppID là số và đã trim từ nguồn
  const ZALOPAY_KEY2_TRIMMED = ZALOPAY_KEY2.trim(); // Thêm .trim()


  const dataMac = `${ZALOPAY_APP_ID_NUM}|${zp_trans_id}|${amountInt}|${description.trim()}|${timestamp}`; 
 
  const mac = crypto.createHmac("sha256", ZALOPAY_KEY2_TRIMMED).update(dataMac).digest("hex");
 

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

  
  const form = new URLSearchParams(payload);

  try {
   
    const res = await axios.post(ZALO_REFUND_ENDPOINT, form.toString(), { // Gửi dạng form-urlencoded
      headers: {
        "Content-Type": "application/x-www-form-urlencoded", // Content-Type đúng
      },
    });
   
    return res.data;
  } catch (err) {
    
    throw err;
  }
};
