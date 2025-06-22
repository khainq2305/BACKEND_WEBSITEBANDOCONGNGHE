const { createPaymentLink } = require("./src/services/client/vnpayService");

const url = createPaymentLink({
  orderId: "DHTEST999",
  amount: 100000,
  orderInfo: "DHTEST999"
});

console.log("✅ URL:", url);
