// utils/slugify.js
const slugify = (str) => str
  .toString()
  .normalize('NFKD')
  .toLowerCase()
  .replace(/\s+/g, '-')        // khoảng trắng → dấu gạch ngang
  .replace(/[^\w-]+/g, '')     // bỏ ký tự không phải chữ/số/gạch ngang
  .replace(/--+/g, '-')        // gộp nhiều gạch ngang
  .replace(/^-+|-+$/g, '');    // bỏ gạch ngang đầu/cuối

module.exports = slugify;
