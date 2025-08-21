const express = require('express');
const router = express.Router();
const { upload } = require('../../config/cloudinary'); 
const path = require('path');
router.post('/image', upload.single('file'), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ message: 'No file' });
    const payload = {
      url: f.path,
      public_id: f.filename,
      resource_type: f.resource_type,
      location: f.path, 
    };
    return res.json(payload);
  } catch (e) {
    console.error('Upload error:', e);
    return res.status(500).json({ message: 'Upload failed' });
  }
});

router.post('/images', upload.array('files', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'No files' });

    const result = files.map(f => ({
      url: f.path,
      public_id: f.filename,
      resource_type: f.resource_type,
      location: f.path,
    }));
    return res.json(result);
  } catch (e) {
    console.error('Upload multiple error:', e);
    return res.status(500).json({ message: 'Upload failed' });
  }
});

module.exports = router;
