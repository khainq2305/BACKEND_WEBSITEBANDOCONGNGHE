const crypto = require("crypto");
const axios = require("axios");

const ZALOPAY_APP_ID = 2554;
const ZALOPAY_KEY2 = "trMrHtvjo6myautxDUiAcYsVtaeQ8nhf";
const ZALO_QUERY_ENDPOINT = "https://sb-openapi.zalopay.vn/v2/query";

// Giao dịch cần kiểm tra (app_trans_id bên bạn)
const app_trans_id = "250717_891066";

(async () => {
  const macData = `${ZALOPAY_APP_ID}|${app_trans_id}|${ZALOPAY_KEY2}`;
  const mac = crypto.createHmac("sha256", ZALOPAY_KEY2).update(macData).digest("hex");

  const payload = new URLSearchParams({
    appid: ZALOPAY_APP_ID,
    app_trans_id,
    mac,
  });

  try {
    const res = await axios.post(ZALO_QUERY_ENDPOINT, payload.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    console.log("✅ ZaloPay QUERY RESPONSE:", res.data);
  } catch (err) {
    console.error("❌ ZaloPay QUERY ERROR:", err?.response?.data || err.message);
  }
})();
