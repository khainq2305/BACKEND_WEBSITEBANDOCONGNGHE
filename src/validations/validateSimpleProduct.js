// File: middlewares/validation/validateSimpleProduct.js (hoặc đường dẫn tương tự ở backend của bạn)
const { Product } = require('../models'); // hoặc đường dẫn tới model của bạn

// Hàm helper để validate một mảng các SKU
const validateProductSkus = (productData) => {
  const { skus } = productData;
  const allErrors = [];

  if (!Array.isArray(skus) || skus.length === 0) {
    allErrors.push({ field: 'skus', message: 'Sản phẩm phải có ít nhất một thông tin SKU.' });
    return allErrors;
  }

  skus.forEach((sku, index) => {
    const skuPrefix = `skus[${index}]`;
    const skuIdentifierForMessage = `SKU ${index + 1}${sku.skuCode ? ' (' + sku.skuCode + ')' : ''}`;

    // Mã SKU (Bắt buộc)
    if (!sku.skuCode || String(sku.skuCode).trim() === '') {
      allErrors.push({ field: `${skuPrefix}.skuCode`, message: `Mã của ${skuIdentifierForMessage} không được để trống.` });
    }

    // Giá gốc (Bắt buộc)
    if (sku.originalPrice == null || String(sku.originalPrice).trim() === '') { // Sửa: dùng == null để bắt cả undefined và null
      allErrors.push({ field: `${skuPrefix}.originalPrice`, message: `Giá gốc của ${skuIdentifierForMessage} không được để trống.` });
    } else if (isNaN(Number(sku.originalPrice))) {
      allErrors.push({ field: `${skuPrefix}.originalPrice`, message: `Giá gốc của ${skuIdentifierForMessage} phải là số.` });
    } else if (Number(sku.originalPrice) <= 0) {
      allErrors.push({ field: `${skuPrefix}.originalPrice`, message: `Giá gốc của ${skuIdentifierForMessage} phải lớn hơn 0.` });
    }

    // Giá bán (price) - Không bắt buộc, nếu nhập thì validate
    if (sku.price !== undefined && sku.price !== null && String(sku.price).trim() !== '') {
      if (isNaN(Number(sku.price))) {
        allErrors.push({ field: `${skuPrefix}.price`, message: `Giá bán của ${skuIdentifierForMessage} phải là số.` });
      } else if (Number(sku.price) < 0) {
         allErrors.push({ field: `${skuPrefix}.price`, message: `Giá bán của ${skuIdentifierForMessage} không được là số âm.` });
      } else if (
        sku.originalPrice != null && !isNaN(Number(sku.originalPrice)) && Number(sku.originalPrice) > 0 &&
        Number(sku.price) > Number(sku.originalPrice)
      ) {
        allErrors.push({ field: `${skuPrefix}.price`, message: `Giá bán của ${skuIdentifierForMessage} không được lớn hơn giá gốc.` });
      }
    }

    // Tồn kho (stock) - BẮT BUỘC NHẬP
    if (sku.stock == null || String(sku.stock).trim() === '') { // Sửa: dùng == null để bắt cả undefined và null
      allErrors.push({ field: `${skuPrefix}.stock`, message: `Tồn kho của ${skuIdentifierForMessage} không được để trống.` });
    } else if (isNaN(Number(sku.stock))) {
      allErrors.push({ field: `${skuPrefix}.stock`, message: `Tồn kho của ${skuIdentifierForMessage} phải là số.` });
    } else if (Number(sku.stock) < 0) {
      allErrors.push({ field: `${skuPrefix}.stock`, message: `Tồn kho của ${skuIdentifierForMessage} không được nhỏ hơn 0.` });
    }

    // Kích thước (height, width, length, weight) - Bắt buộc
    const dimensions = {
      height: 'Chiều cao',
      width: 'Chiều rộng',
      length: 'Chiều dài',
      weight: 'Khối lượng'
    };
    for (const dimKey in dimensions) {
      if (sku[dimKey] == null || String(sku[dimKey]).trim() === '') { // Sửa: dùng == null
        allErrors.push({ field: `${skuPrefix}.${dimKey}`, message: `${dimensions[dimKey]} (${skuIdentifierForMessage}) không được để trống.` });
      } else if (isNaN(Number(sku[dimKey])) || Number(sku[dimKey]) < 0) {
        allErrors.push({ field: `${skuPrefix}.${dimKey}`, message: `${dimensions[dimKey]} (${skuIdentifierForMessage}) phải là số không âm.` });
      }
    }

    // Validate mediaUrls cho SKU
    if (Array.isArray(sku.mediaUrls)) {
      sku.mediaUrls.forEach((media) => {
        const mediaUrl = typeof media === 'object' ? media.url : media;
        const mediaSize = typeof media === 'object' ? media.size : null;

        if (mediaUrl && typeof mediaUrl === 'string' && mediaUrl.trim() !== '') {
          const ext = mediaUrl.split('.').pop().toLowerCase();
          const fileName = mediaUrl.substring(mediaUrl.lastIndexOf('/') + 1);

          if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            if (mediaSize && mediaSize > 5 * 1024 * 1024) {
              allErrors.push({ field: `${skuPrefix}.mediaUrls`, message: `Ảnh '${fileName}' cho ${skuIdentifierForMessage} không được vượt quá 5MB.` });
            }
          } else if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
            if (mediaSize && mediaSize > 10 * 1024 * 1024) {
              allErrors.push({ field: `${skuPrefix}.mediaUrls`, message: `Video '${fileName}' cho ${skuIdentifierForMessage} không được vượt quá 10MB.` });
            }
          } else {
            allErrors.push({ field: `${skuPrefix}.mediaUrls`, message: `File media '${fileName}' không hợp lệ cho ${skuIdentifierForMessage}.` });
          }
        }
      });
    }
  });
  return allErrors;
};

// Middleware validate chính
const validateSimpleProduct = async (req, res, next) => {
  let product;
  try {
    product = JSON.parse(req.body.product);
  } catch (err) {
    return res.status(400).json({
      errors: [{ field: 'product', message: 'Dữ liệu sản phẩm JSON không hợp lệ!' }]
    });
  }

  const {
    name,
    thumbnail,
    hasVariants,
    categoryId,
    brandId,
    orderIndex
  } = product;

  const errors = [];

  if (!name || name.trim() === '') {
  errors.push({ field: 'name', message: 'Tên sản phẩm không được để trống.' });
} else {
  const existingProduct = await Product.findOne({ where: { name: name.trim() } });
  if (existingProduct) {
    errors.push({ field: 'name', message: 'Tên sản phẩm đã tồn tại.' });
  }
}

  if (categoryId == null || String(categoryId).trim() === '' || isNaN(Number(categoryId))) { // Sửa: check cả null/undefined
    errors.push({ field: 'categoryId', message: 'Danh mục sản phẩm không hợp lệ hoặc không được để trống.' });
  }
  if (brandId == null || String(brandId).trim() === '' || isNaN(Number(brandId))) { // Sửa: check cả null/undefined
    errors.push({ field: 'brandId', message: 'Thương hiệu không hợp lệ hoặc không được để trống.' });
  }

 const mainThumbnailFile = req.files?.find(f => f.fieldname === 'thumbnail');

if (!hasVariants && !mainThumbnailFile && (!thumbnail || thumbnail.trim() === '')) {
  errors.push({ field: 'thumbnail', message: 'Ảnh đại diện sản phẩm không được để trống.' });
}


  const skuValidationErrors = validateProductSkus(product);
  errors.push(...skuValidationErrors);

  if (orderIndex === undefined || String(orderIndex).trim() === '') {
    errors.push({ field: 'orderIndex', message: 'Thứ tự hiển thị không được để trống.' });
  } else if (isNaN(Number(orderIndex))) {
    errors.push({ field: 'orderIndex', message: 'Thứ tự hiển thị phải là số.' });
  } else if (Number(orderIndex) < 0) {
    errors.push({ field: 'orderIndex', message: 'Thứ tự hiển thị phải là số không âm.' });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  req.product = product;
  next();
};

module.exports = { validateSimpleProduct };