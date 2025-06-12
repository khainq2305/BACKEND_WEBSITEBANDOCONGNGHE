const { Product } = require('../models');
const { Op } = require('sequelize');
 const slugify = require('slugify');
const MAX_PRICE_VALUE = 2000000000;
const MAX_STOCK_VALUE = 10000;
const MAX_DIMENSION_VALUE = 200;
const MIN_DIMENSION_VALUE = 10;
const MAX_WEIGHT_VALUE = 50000;
const MIN_WEIGHT_VALUE = 1;
const MIN_CHARGE_WEIGHT = 200;
const MAX_ORDER_INDEX_VALUE = 99999;
const MAX_SKU_CODE_LENGTH = 50;
const MAX_PRODUCT_NAME_LENGTH = 255;

const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm'];
const MAX_VIDEO_SIZE_BYTES = 10 * 1024 * 1024;

function calculateVolumetricWeight(length, width, height) {
  return Math.ceil((length * width * height) / 6); 
}

function calculateChargeableWeight(realWeight, length, width, height) {
  const volWeight = calculateVolumetricWeight(length, width, height);
  return Math.max(realWeight, volWeight, MIN_CHARGE_WEIGHT);
}

const validateProductSkus = (productData) => {
  const { skus } = productData;
  const allErrors = [];

  if (!Array.isArray(skus) || skus.length === 0) {
    allErrors.push({
      field: 'skus',
      message: 'Sản phẩm phải có ít nhất một thông tin SKU.'
    });
    return allErrors;
  }

 
  const dimensionNames = {
    width: 'Chiều rộng',
    length: 'Chiều dài',
    height: 'Chiều cao',
    weight: 'Khối lượng'
  };

  skus.forEach((sku, index) => {
    const skuPrefix = `skus[${index}]`;
    const skuIdentifier = `SKU ${index + 1}${sku.skuCode ? ` (${sku.skuCode})` : ''}`;

   
    if (!sku.skuCode || String(sku.skuCode).trim() === '') {
      allErrors.push({
        field: `${skuPrefix}.skuCode`,
        message: `Mã của ${skuIdentifier} không được để trống.`
      });
    } else if (sku.skuCode.length > MAX_SKU_CODE_LENGTH) {
      allErrors.push({
        field: `${skuPrefix}.skuCode`,
        message: `Mã của ${skuIdentifier} quá dài (tối đa ${MAX_SKU_CODE_LENGTH} ký tự).`
      });
    }
  const oriPrice = Number(sku.originalPrice);
    if (sku.originalPrice == null || sku.originalPrice === '') {
      allErrors.push({
        field: `${skuPrefix}.originalPrice`,
        message: `Giá gốc của ${skuIdentifier} không được để trống.`
      });
    } else if (isNaN(oriPrice)) {
      allErrors.push({
        field: `${skuPrefix}.originalPrice`,
        message: `Giá gốc của ${skuIdentifier} phải là một số.`
      });
    } else if (oriPrice <= 0) {
      allErrors.push({
        field: `${skuPrefix}.originalPrice`,
        message: `Giá gốc của ${skuIdentifier} phải lớn hơn 0.`
      });
    } else if (oriPrice > MAX_PRICE_VALUE) {
      allErrors.push({
        field: `${skuPrefix}.originalPrice`,
        message: `Giá gốc của ${skuIdentifier} quá lớn (tối đa ${MAX_PRICE_VALUE.toLocaleString('vi-VN')} đ).`
      });
    }

    // --- Validate Giá bán (KHÔNG BẮT BUỘC) ---
    const price = Number(sku.price);
    const hasSalePrice = sku.price != null && sku.price !== '';

    // Chỉ validate NẾU người dùng có nhập giá bán
    if (hasSalePrice) {
      if (isNaN(price)) {
          allErrors.push({
              field: `${skuPrefix}.price`,
              message: `Giá bán của ${skuIdentifier} phải là một số.`
          });
      } else if (price <= 0) {
          allErrors.push({
              field: `${skuPrefix}.price`,
              message: `Giá bán của ${skuIdentifier} phải lớn hơn 0.`
          });
      } else if (price > MAX_PRICE_VALUE) {
          allErrors.push({
              field: `${skuPrefix}.price`,
              message: `Giá bán của ${skuIdentifier} quá lớn (tối đa ${MAX_PRICE_VALUE.toLocaleString('vi-VN')} đ).`
          });
      }

      // So sánh với giá gốc (chỉ khi giá gốc là một số hợp lệ)
      if (!isNaN(oriPrice) && oriPrice > 0 && price >= oriPrice) { // <--- SỬA LẠI THÀNH >=
        allErrors.push({
          field: `${skuPrefix}.price`,
          message: `Giá bán của ${skuIdentifier} phải nhỏ hơn giá gốc.` // Sửa lại câu thông báo cho rõ ràng
        });
      }
    }

    if (sku.stock == null || sku.stock === '') {
      allErrors.push({
        field: `${skuPrefix}.stock`,
        message: `Tồn kho của ${skuIdentifier} không được để trống.`
      });
    } else if (isNaN(Number(sku.stock))) {
      allErrors.push({
        field: `${skuPrefix}.stock`,
        message: `Tồn kho của ${skuIdentifier} phải là số.`
      });
    } else if (Number(sku.stock) < 0) {
      allErrors.push({
        field: `${skuPrefix}.stock`,
        message: `Tồn kho của ${skuIdentifier} không được nhỏ hơn 0.`
      });
    } else if (Number(sku.stock) > MAX_STOCK_VALUE) {
      allErrors.push({
        field: `${skuPrefix}.stock`,
        message: `Tồn kho của ${skuIdentifier} quá lớn (tối đa ${MAX_STOCK_VALUE}).`
      });
    }

    
    ['width', 'length', 'height', 'weight'].forEach((key) => {
      const val = Number(sku[key]);
      const name = dimensionNames[key];
      const min = key === 'weight' ? MIN_WEIGHT_VALUE : MIN_DIMENSION_VALUE;
      const max = key === 'weight' ? MAX_WEIGHT_VALUE : MAX_DIMENSION_VALUE;

      if (sku[key] == null || sku[key] === '') {
        allErrors.push({
          field: `${skuPrefix}.${key}`,
          message: `${name} của ${skuIdentifier} không được để trống.`
        });
      } else if (isNaN(val)) {
        allErrors.push({
          field: `${skuPrefix}.${key}`,
          message: `${name} của ${skuIdentifier} phải là số.`
        });
      } else if (val < min || val > max) {
        allErrors.push({
          field: `${skuPrefix}.${key}`,
          message: `${name} của ${skuIdentifier} phải từ ${min} đến ${max} ${key === 'weight' ? 'g' : 'cm'}.`
        });
      }
    });


    const l = Number(sku.length);
    const w = Number(sku.width);
    const h = Number(sku.height);
    const wt = Number(sku.weight);
    if (
      !isNaN(l) &&
      !isNaN(w) &&
      !isNaN(h) &&
      !isNaN(wt)
    ) {
      sku.volumetricWeight = calculateVolumetricWeight(
        l, w, h
      );
      sku.chargeWeight = calculateChargeableWeight(
        wt, l, w, h
      );
    }

    
    if (Array.isArray(sku.mediaUrls)) {
      sku.mediaUrls.forEach((media) => {
        const url = typeof media === 'object' ? media.url : media;
        const size = typeof media === 'object' ? media.size : null;
        const ext = url?.split('?')[0].split('.').pop().toLowerCase();

        if (url) {
          const fileName = url.split('/').pop();
          if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
            if (size && size > MAX_IMAGE_SIZE_BYTES) {
              allErrors.push({
                field: `${skuPrefix}.mediaUrls`,
                message: `Ảnh '${fileName}' vượt quá 5MB.`
              });
            }
          } else if (ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
            if (size && size > MAX_VIDEO_SIZE_BYTES) {
              allErrors.push({
                field: `${skuPrefix}.mediaUrls`,
                message: `Video '${fileName}' vượt quá 10MB.`
              });
            }
          } else {
            allErrors.push({
              field: `${skuPrefix}.mediaUrls`,
              message: `File '${fileName}' có định dạng không hợp lệ.`
            });
          }
        }
      });
    }
  });

  return allErrors;
};

const validateSimpleProduct = async (req, res, next) => {
  let product;
  try {
    product = JSON.parse(req.body.product);
  } catch (err) {
    return res.status(400).json({
      errors: [{ field: 'product', message: 'Dữ liệu sản phẩm không hợp lệ!' }]
    });
  }

  const errors = [];
  const { name, thumbnail, hasVariants, categoryId, brandId, orderIndex } = product;
  const productSlug = req.params.slug || null;


  
 

if (!name || name.trim() === '') {
  errors.push({ field: 'name', message: 'Tên sản phẩm không được để trống.' });
} else if (name.length > MAX_PRODUCT_NAME_LENGTH) {
  errors.push({
    field: 'name',
    message: `Tên sản phẩm quá dài (tối đa ${MAX_PRODUCT_NAME_LENGTH} ký tự).`
  });
} else {
  // Tạo slug từ name
  const slug = slugify(name.trim(), { lower: true, strict: true });

  // Kiểm tra slug đã tồn tại chưa (trừ chính sản phẩm đang sửa nếu có productId)
let existing;

if (productSlug) {
  // Nếu đang sửa, lấy id thực tế từ slug
  const currentProduct = await Product.findOne({ where: { slug: productSlug } });

  if (currentProduct) {
    existing = await Product.findOne({
      where: {
        slug,
        id: { [Op.ne]: currentProduct.id } 
      }
    });
  }
} else {
  existing = await Product.findOne({ where: { slug } });
}

if (existing) {
  errors.push({ field: 'name', message: 'Tên sản phẩm đã tồn tại.' });
}

}

  
  if (categoryId == null || categoryId === '') {
    errors.push({ field: 'categoryId', message: 'Danh mục không được để trống.' });
  } else if (isNaN(Number(categoryId))) {
    errors.push({ field: 'categoryId', message: 'Danh mục không hợp lệ.' });
  }


  if (brandId == null || brandId === '') {
    errors.push({ field: 'brandId', message: 'Thương hiệu không được để trống.' });
  } else if (isNaN(Number(brandId))) {
    errors.push({ field: 'brandId', message: 'Thương hiệu không hợp lệ.' });
  }

 
  const thumbFile = req.files?.find((f) => f.fieldname === 'thumbnail');
  if (thumbFile) {
    const ext = thumbFile.originalname.split('.').pop().toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      errors.push({
        field: 'thumbnail',
        message: 'Ảnh đại diện có định dạng không hợp lệ.'
      });
    } else if (thumbFile.size > MAX_IMAGE_SIZE_BYTES) {
      errors.push({
        field: 'thumbnail',
        message: 'Ảnh đại diện vượt quá 5MB.'
      });
    }
  } else if (!thumbnail || thumbnail === '') {
    errors.push({
      field: 'thumbnail',
      message: 'Ảnh đại diện không được để trống.'
    });
  }


  const skuErrors = validateProductSkus(product);
  errors.push(...skuErrors);

  
  if (orderIndex == null || orderIndex === '') {
    errors.push({
      field: 'orderIndex',
      message: 'Thứ tự hiển thị không được để trống.'
    });
  } else if (
    isNaN(Number(orderIndex)) ||
    Number(orderIndex) < 0 ||
    Number(orderIndex) > MAX_ORDER_INDEX_VALUE
  ) {
    errors.push({
      field: 'orderIndex',
      message: `Thứ tự hiển thị phải từ 0 đến ${MAX_ORDER_INDEX_VALUE}.`
    });
  }

  
  const uniqueErrors = errors.filter(
    (e, i, self) => i === self.findIndex((x) => x.field === e.field && x.message === e.message)
  );
  if (uniqueErrors.length > 0) {
    return res.status(400).json({ errors: uniqueErrors });
  }

  req.product = product;
  next();
};

module.exports = { validateSimpleProduct };
