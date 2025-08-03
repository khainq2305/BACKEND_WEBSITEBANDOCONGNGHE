function generateOrderCancellationHtml({ 
  orderCode, 
  cancelReason,
  userName,
  orderDetailUrl,
  companyName = "Thiên Khởi",
  companyLogoUrl = "https://yourdomain.com/logo.png",
  companyAddress = "123 Đường ABC, Quận XYZ, TP. Hà Nội",
  companyPhone = "090-123-4567",
  companySupportEmail = "support@yourdomain.com"
}) {
  return `
    <mjml>
      <mj-head>
        <mj-title>Đơn hàng ${orderCode} đã bị hủy</mj-title>
      </mj-head>
      <mj-body background-color="#f9f9f9">
        
        <!-- Header - Logo và Tiêu đề -->
        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-image width="150px" src="${companyLogoUrl}" />
            <mj-divider border-color="#333333" border-width="1px" />
            <mj-text font-size="20px" font-weight="bold" align="center" color="#333333">
              Đơn hàng ${orderCode} đã bị hủy
            </mj-text>
          </mj-column>
        </mj-section>
        
        <mj-spacer height="20px" />

        <!-- Thông tin hủy đơn -->
        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-text font-size="16px" padding-bottom="10px">
              Xin chào ${userName},
            </mj-text>
            <mj-text font-size="16px" padding-bottom="10px">
              Chúng tôi xin thông báo rằng đơn hàng của bạn với mã <strong>${orderCode}</strong> đã bị hủy.
            </mj-text>
            <mj-text font-size="16px" font-weight="bold" color="#d9534f" padding-bottom="10px">
              Lý do hủy: ${cancelReason}
            </mj-text>
            <mj-text font-size="16px">
              Nếu bạn có bất kỳ thắc mắc nào, vui lòng liên hệ bộ phận hỗ trợ của chúng tôi.
            </mj-text>
            
            <mj-button background-color="#F45E43" color="#ffffff" font-weight="bold" href="${orderDetailUrl}" width="200px" padding-top="20px">
              Xem chi tiết đơn hàng
            </mj-button>
          </mj-column>
        </mj-section>
        
        <mj-spacer height="20px" />

        <!-- Footer -->
        <mj-section padding="20px">
          <mj-column>
            <mj-text font-size="12px" color="#888888" align="center">
              Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi:<br />
              <strong>Địa chỉ:</strong> ${companyAddress} <br />
              <strong>Điện thoại:</strong> ${companyPhone}<br />
              <strong>Email hỗ trợ:</strong> <a href="mailto:${companySupportEmail}" style="color: #007bff;">${companySupportEmail}</a>
            </mj-text>
            <mj-text font-size="12px" color="#888888" align="center">
              &copy; ${new Date().getFullYear()} ${companyName}. Tất cả các quyền được bảo lưu.
            </mj-text>
          </mj-column>
        </mj-section>

      </mj-body>
    </mjml>
  `;
}

module.exports = { generateOrderCancellationHtml };