// utils/seoSlugify.js
// Custom SEO slugify function that matches frontend behavior exactly
// This is specifically for SEO URL analysis and post slug generation
// Use this when you need consistent behavior with frontend SEO scoring

const seoSlugify = (str) => {
  if (!str) return '';
  
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    // Handle Vietnamese characters exactly like frontend
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')  // Critical: đ -> d (not dj like default slugify)
    .replace(/[^a-z0-9\-]/g, '')  // Remove non-alphanumeric except dash
    .replace(/-+/g, '-')  // Replace multiple dashes with single dash
    .replace(/^-|-$/g, '');  // Remove leading/trailing dashes
};

module.exports = seoSlugify;
