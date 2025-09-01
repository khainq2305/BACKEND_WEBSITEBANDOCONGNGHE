// testLatency.js
const express = require("express");
const router = express.Router();
const { sequelize } = require("./src/models");

router.get("/__ping", (req, res) => {
  res.json({ ok: true, t: Date.now() });
});

router.get("/__db_ping", async (req, res) => {
  const t0 = Date.now();
  try {
    await sequelize.query("SELECT 1");
    res.json({ ok: true, db_latency_ms: Date.now() - t0 });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message, db_latency_ms: Date.now() - t0 });
  }
});

module.exports = router;
