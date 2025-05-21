const Brand = require('../../models/brandModel');
const { Op } = require('sequelize');

// Lấy tất cả brand
const getAllBrands = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    let paranoid = true;

    if (search) {
      whereClause.name = { [Op.like]: `%${search}%` };
    }

    if (status === 'published') {
      whereClause.isActive = true;
    } else if (status === 'draft') {
      whereClause.isActive = false;
    } else if (status === 'trash') {
      paranoid = false;
    }

    const { rows: brands, count } = await Brand.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['id', 'DESC']],
      paranoid
    });

    return res.json({
      success: true,
      data: brands,
      total: count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server', error });
  }
};

// Tạo mới brand
const createBrand = async (req, res) => {
  try {
    const { name, description, isActive = true } = req.body;
    const logo = req.file?.path || req.body.logo || null;

    const brand = await Brand.create({ name, description, logo, isActive });

    return res.status(201).json({
      success: true,
      message: 'Tạo brand thành công',
      brand
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Lỗi server', error });
  }
};

// Lấy brand theo ID
const getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findByPk(req.params.id);
    if (!brand) {
      return res.status(404).json({ message: 'Không tìm thấy brand' });
    }
    return res.json(brand);
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error });
  }
};

// Cập nhật brand
const updateBrand = async (req, res) => {
  try {
    const brand = await Brand.findByPk(req.params.id);
    if (!brand) {
      return res.status(404).json({ message: 'Không tìm thấy brand' });
    }

    const { name, description, logo, isActive } = req.body;

    await brand.update({
      name,
      description,
      logo,
      isActive
    });

    return res.json({ message: 'Cập nhật brand thành công', brand });
  } catch (error) {
    console.error('❌ Lỗi cập nhật brand:', error);
    return res.status(500).json({ message: 'Lỗi server', error });
  }
};

// Xoá mềm brand
const deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findByPk(req.params.id);
    if (!brand) {
      return res.status(404).json({ message: 'Không tìm thấy brand' });
    }

    await brand.destroy();
    return res.json({ message: 'Đã xoá brand (soft delete)' });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error });
  }
};

// Khôi phục brand đã xoá
const restoreBrand = async (req, res) => {
  try {
    const brand = await Brand.findByPk(req.params.id, { paranoid: false });
    if (!brand) {
      return res.status(404).json({ message: 'Không tìm thấy brand đã xoá' });
    }

    await brand.restore();
    return res.json({ message: 'Khôi phục brand thành công' });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error });
  }
};

// Xoá vĩnh viễn
const forceDeleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findByPk(req.params.id, { paranoid: false });
    if (!brand) {
      return res.status(404).json({ message: 'Không tìm thấy brand đã xoá' });
    }

    await brand.destroy({ force: true });
    return res.json({ message: 'Đã xoá brand vĩnh viễn' });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error });
  }
};

module.exports = {
  getAllBrands,
  createBrand,
  getBrandById,
  updateBrand,
  deleteBrand,
  restoreBrand,
  forceDeleteBrand
};
