// mapping từ id sang label
const returnSituations = [
  {
    id: 'seller_pays',
    label: 'Shop chịu phí vận chuyển (hàng lỗi, sai sản phẩm, khác mô tả...)',
    reasons: [
      { id: 'WRONG_SIZE_COLOR', label: 'Nhận sai kích cỡ, màu sắc, hoặc sai sản phẩm' },
      { id: 'NOT_AS_DESCRIBED', label: 'Sản phẩm khác với mô tả của shop' },
      { id: 'DEFECTIVE', label: 'Sản phẩm bị lỗi, hư hỏng, không hoạt động' }
    ]
  },
  {
    id: 'customer_pays',
    label: 'Khách hàng chịu phí vận chuyển (đổi ý, không muốn mua nữa...)',
    reasons: [
      { id: 'CHANGE_MIND', label: 'Không còn nhu cầu mua nữa' },
      { id: 'ORDER_BY_MISTAKE', label: 'Đặt nhầm sản phẩm' },
      { id: 'FOUND_BETTER_PRICE', label: 'Tìm được sản phẩm giá tốt hơn' }
    ]
  }
];

// helper lấy label
function getReasonLabel(reasonId, situation) {
  const situationObj = returnSituations.find(s => s.id === situation);
  if (!situationObj) return reasonId;
  const reasonObj = situationObj.reasons.find(r => r.id === reasonId);
  return reasonObj ? reasonObj.label : reasonId;
}

function generateReturnRequestHtml({
  orderCode,
  reason,
  detailedReason,
  situation,
  refundAmount,
  returnFee,
  returnCode,
  orderItems,
  evidenceImages = [],
  evidenceVideos = [],
  companyName = "CYBERZONE",
  companyLogoUrl = "https://res.cloudinary.com/dzrp2hsvh/image/upload/v1753761547/uploads/ohs6h11zyavrv2haky9f.png",
  companySupportEmail = "support@yourdomain.com",
  requestDetailUrl = `https://www.cyberzone.com.vn/admin/return-requests/${returnCode}`
}) {
  const reasonLabel = getReasonLabel(reason, situation);

  const orderItemsHtml = orderItems.map(item => `
    <tr>
      <td style="padding: 10px; border-top: 1px solid #eee;">${item.productName}</td>
      <td style="padding: 10px; border-top: 1px solid #eee; text-align:center;">${item.quantity}</td>
      <td style="padding: 10px; border-top: 1px solid #eee; text-align:right;">${Number(item.price).toLocaleString('vi-VN')} đ</td>
    </tr>
  `).join('');

  const imagesHtml = evidenceImages.map(url => `
    <img src="${url}" style="max-width:120px; margin:5px; border:1px solid #ccc;" />
  `).join('');

  const videosHtml = evidenceVideos.map(url => `
    <a href="${url}" target="_blank" style="display:block; margin:5px; color:#007bff;">Xem video</a>
  `).join('');

  return `
    <div style="background-color:#f9f9f9; padding:20px; font-family:Arial,sans-serif; color:#333;">
      <div style="background:#fff; max-width:600px; margin:auto; border-radius:8px; overflow:hidden; border:1px solid #ddd;">
        
        <div style="text-align:center; padding:20px;">
          <img src="${companyLogoUrl}" alt="${companyName}" style="max-width:150px;"/>
          <h2 style="margin-top:10px; color:#333;">YÊU CẦU TRẢ HÀNG MỚI</h2>
        </div>

        <div style="padding:20px; font-size:14px; line-height:1.6;">
          <p><strong>Đơn hàng:</strong> ${orderCode}</p>
          <p><strong>Mã yêu cầu:</strong> ${returnCode}</p>
          <p><strong>Lý do:</strong> ${reasonLabel}</p>
          <p><strong>Chi tiết:</strong> ${detailedReason || "Không có"}</p>
          <p><strong>Tình huống phí:</strong> ${situation === "seller_pays" ? "Người bán chịu phí" : "Khách hàng chịu phí"}</p>
          <p><strong>Phí trả hàng:</strong> ${Number(returnFee).toLocaleString('vi-VN')} đ</p>
          <p><strong>Số tiền hoàn dự kiến:</strong> ${Number(refundAmount).toLocaleString('vi-VN')} đ</p>
        </div>

        <div style="padding:20px; font-size:14px;">
          <h3 style="margin-bottom:10px;">Danh sách sản phẩm khách trả:</h3>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <tr style="background:#f2f2f2;">
              <th style="padding:10px; text-align:left;">Sản phẩm</th>
              <th style="padding:10px; text-align:center;">SL</th>
              <th style="padding:10px; text-align:right;">Đơn giá</th>
            </tr>
            ${orderItemsHtml}
          </table>
        </div>

        ${(imagesHtml || videosHtml) ? `
        <div style="padding:20px; font-size:14px;">
          <h3 style="margin-bottom:10px;">Bằng chứng khách cung cấp:</h3>
          <div>${imagesHtml}</div>
          <div>${videosHtml}</div>
        </div>` : ''}

        <div style="text-align:center; padding:20px;">
          <a href="${requestDetailUrl}" 
             style="display:inline-block; padding:12px 20px; background:#F45E43; color:#fff; 
                    text-decoration:none; border-radius:4px; font-weight:bold;">
            Xử lý yêu cầu ngay
          </a>
        </div>

        <div style="padding:20px; font-size:12px; color:#888; text-align:center; border-top:1px solid #eee;">
          Email hệ thống của ${companyName}. Vui lòng không trả lời trực tiếp email này.
        </div>

      </div>
    </div>
  `;
}

module.exports = { generateReturnRequestHtml };
