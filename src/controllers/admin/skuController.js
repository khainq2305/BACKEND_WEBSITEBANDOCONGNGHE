// controllers/sku.controller.js

const SkuService = require('../../services/admin/sku.service');
const { Op } = require('sequelize');
class SkuController {
  static async getAllSkus(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { search, categoryId, status } = req.query;

    const { rows, count } = await SkuService.getAllSkus({
      limit,
      offset,
      search,
      categoryId,
      status
    });

    res.json({
      data: rows,
      pagination: {
        totalItems: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
      },
      message: 'Lấy danh sách SKU thành công',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}


  static async getSkuById(req, res) {
    try {
      const sku = await SkuService.getSkuById(req.params.id);
      res.json({ data: sku });
    } catch (err) {
      
      res.status(404).json({ error: err.message });
    }
  }

  static async createSku(req, res) {
    try {
      const sku = await SkuService.createSku(req.body);
      res.status(201).json({ data: sku });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  static async updateSku(req, res) {
    try {
      const sku = await SkuService.updateSku(req.params.id, req.body);
      res.json({ data: sku });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  }

  static async importStock(req, res) {
    try {
      console.log(req.params.id)
      console.log('body:', req.body);
      const sku = await SkuService.adjustStock(req.params.id, 'import', req.body);
      res.json({ data: sku });
    } catch (err) {
      console.log('loi roi')
      res.status(400).json({ error: err.message });
    }
  }

  static async exportStock(req, res) {
    try {
      const sku = await SkuService.adjustStock(req.params.id, 'export', req.body);
      res.json({ data: sku });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  static async getLogs(req, res) {
    try {
      const { id } = req.params;
      const { type } = req.query;
      console.log('type la', type)
      const logs = await SkuService.getLogsBySkuId(id, type);
      res.json({ data: logs });
    } catch (err) {
      console.error(err); // In lỗi ra console
      res.status(500).json({ error: 'Server error loi roi' });
    }
  }
  
}

module.exports = SkuController;
