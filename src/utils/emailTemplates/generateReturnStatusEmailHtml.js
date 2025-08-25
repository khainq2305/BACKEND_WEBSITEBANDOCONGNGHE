function generateReturnStatusEmailHtml({ 
  status,
  returnCode,
  orderCode,
  userName,
  message,
  refundAmount,
  companyName = "CYBERZONE",
  companyLogoUrl = "https://yourdomain.com/logo.png",
  supportEmail = "support@yourdomain.com",
  requestDetailUrl
}) {
  // Chọn màu chính theo trạng thái
  let color = "#333";
  if (status === "approved") color = "#28a745";
  if (status === "rejected") color = "#dc3545";
  if (status === "cancelled") color = "#6c757d";
  if (status === "refunded") color = "#007bff";

  return `
    <mjml>
      <mj-head>
        <mj-title>Cập nhật yêu cầu trả hàng ${returnCode}</mj-title>
      </mj-head>
      <mj-body background-color="#f9f9f9">
        
        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-image width="150px" src="${companyLogoUrl}" />
            <mj-divider border-color="#333333" border-width="1px" />
            <mj-text font-size="20px" font-weight="bold" align="center" color="${color}">
              Trạng thái yêu cầu: ${status.toUpperCase()}
            </mj-text>
          </mj-column>
        </mj-section>
        
        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-text font-size="16px">
              Xin chào ${userName},<br/>
              Yêu cầu trả hàng <strong>${returnCode}</strong> cho đơn hàng <strong>${orderCode}</strong> vừa được cập nhật:
            </mj-text>
            <mj-text font-size="14px" color="${color}">
              ${message}
            </mj-text>

            ${status === "refunded" ? `
              <mj-text font-size="14px" color="#28a745">
                Số tiền hoàn trả: <strong>${Number(refundAmount).toLocaleString("vi-VN")} đ</strong>
              </mj-text>
            ` : ""}
          </mj-column>
        </mj-section>
        
        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-button background-color="#F45E43" color="#ffffff" font-weight="bold" href="${requestDetailUrl}" width="220px">
              Xem chi tiết yêu cầu
            </mj-button>
          </mj-column>
        </mj-section>

        <mj-section padding="20px">
          <mj-column>
            <mj-text font-size="12px" color="#888888" align="center">
              Nếu bạn cần hỗ trợ, vui lòng liên hệ:<br/>
              Email: <a href="mailto:${supportEmail}" style="color:#007bff;">${supportEmail}</a>
            </mj-text>
          </mj-column>
        </mj-section>

      </mj-body>
    </mjml>
  `;
}

module.exports = { generateReturnStatusEmailHtml };
