const axios = require("axios");

// 🚀 Ghi thẳng Client ID và API Key (production)
const payosClientId = "70bc1123-bfe9-4822-b27f-47859e397fc2";
const payosApiKey   = "94deffa5-fb03-48b8-86fe-2101d27d65b8";

// 🚀 Endpoint cố định (production)
const BASE_URL = "https://api-merchant.payos.vn/v1/payouts";

/**
 * Hàm tạo yêu cầu rút tiền về tài khoản ngân hàng
 * @param {Object} params
 * @param {string} params.referenceId   - Mã tham chiếu duy nhất
 * @param {number} params.amount        - Số tiền rút
 * @param {string} [params.note]        - Ghi chú (nếu có)
 * @param {string} params.bankCode      - Mã BIN ngân hàng
 * @param {string} params.accountNumber - Số tài khoản nhận
 * @param {string} params.accountName   - Tên chủ tài khoản
 */
exports.createWithdrawal = async ({
  referenceId,
  amount,
  note,
  bankCode,
  accountNumber,
  accountName,
}) => {
  try {
    console.log("⚡ PAYOS_CLIENT_ID =", `"${payosClientId}"`);
    console.log("⚡ PAYOS_API_KEY =", `"${payosApiKey}"`);
    console.log("⚡ BASE_URL =", BASE_URL);

    const payload = {
      referenceId,
      amount: Number(amount),
      description: note || `Rút tiền #${referenceId}`,
      toBin: bankCode,
      toAccountNumber: accountNumber,
      toAccountName: accountName,
      category: ["WITHDRAW"],
    };

    console.log("🚀 [PayOS Withdraw] Payload gửi đi:", payload);

    const res = await axios.post(BASE_URL, payload, {
      headers: {
        "x-client-id": payosClientId,
        "x-api-key": payosApiKey,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ [PayOS Withdraw] API Response:", res.data);
    return res.data;
  } catch (error) {
    console.error("❌ [PayOS Withdraw] Lỗi tạo payout:");
    console.error("Status:", error?.response?.status);
    console.error("Data:", error?.response?.data);
    console.error("Message:", error.message);
    throw error;
  }
};

// ================== TEST THỬ ==================
if (require.main === module) {
  (async () => {
    try {
      const result = await exports.createWithdrawal({
        referenceId: "WD123456",      // mã tham chiếu duy nhất
        amount: 50000,                // số tiền rút (VND)
        note: "Rút test",
        bankCode: "970415",           // ví dụ BIDV
        accountNumber: "1234567890",  // số tài khoản nhận
        accountName: "NGUYEN VAN A",  // tên chủ tài khoản
      });
      console.log("🎉 Rút tiền thành công:", result);
    } catch (err) {
      console.error("⚠️ Test thất bại:", err?.response?.data || err.message);
    }
  })();
}
