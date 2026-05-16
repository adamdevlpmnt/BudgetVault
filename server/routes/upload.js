const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { UPLOADS_DIR } = require('../config/db');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) { cb(null, true); }
    else { cb(new Error('Type de fichier non supporté. Utilisez JPG, PNG, WebP ou GIF.')); }
  }
});

router.post('/receipt', uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucune image fournie' });

    const filename = `receipt_${req.userId}_${Date.now()}.webp`;
    const filepath = path.join(UPLOADS_DIR, filename);

    await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(filepath);

    res.json({ filename, path: `/uploads/${filename}` });
  } catch (err) {
    console.error('Upload receipt error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

router.post('/category-icon', uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucune image fournie' });

    const filename = `icon_${req.userId}_${Date.now()}.webp`;
    const filepath = path.join(UPLOADS_DIR, filename);

    await sharp(req.file.buffer)
      .resize(128, 128, { fit: 'cover' })
      .webp({ quality: 90 })
      .toFile(filepath);

    res.json({ filename, path: `/uploads/${filename}` });
  } catch (err) {
    console.error('Upload icon error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'upload' });
  }
});

module.exports = router;
