const express = require('express');
const { db } = require('../config/db');

const router = express.Router();

/**
 * GET /api/categories
 * List all categories for the current user
 */
router.get('/', (req, res) => {
  try {
    const categories = db.prepare(
      'SELECT * FROM categories WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC'
    ).all(req.userId);

    res.json(categories);
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/categories
 * Create a new category
 */
router.post('/', (req, res) => {
  try {
    const { name, color, icon, customIconPath } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nom de catégorie requis' });
    }

    // Get next sort order
    const maxOrder = db.prepare(
      'SELECT MAX(sort_order) as max FROM categories WHERE user_id = ?'
    ).get(req.userId);

    const result = db.prepare(
      "INSERT INTO categories (user_id, name, color, icon, custom_icon_path, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
    ).run(
      req.userId,
      name.trim(),
      color || '#6366f1',
      icon || 'tag',
      customIconPath || null,
      (maxOrder?.max || 0) + 1
    );

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json(category);
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/categories/:id
 * Update a category
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon, customIconPath, sortOrder } = req.body;

    const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    db.prepare(
      `UPDATE categories SET
        name = ?, color = ?, icon = ?, custom_icon_path = ?, sort_order = ?,
        updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(
      name !== undefined ? name.trim() : existing.name,
      color !== undefined ? color : existing.color,
      icon !== undefined ? icon : existing.icon,
      customIconPath !== undefined ? customIconPath : existing.custom_icon_path,
      sortOrder !== undefined ? sortOrder : existing.sort_order,
      id,
      req.userId
    );

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);

    res.json(category);
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/categories/:id
 * Delete a category (expenses keep their data but category_id becomes null)
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, req.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    // Check if category is used by expenses
    const usageCount = db.prepare(
      'SELECT COUNT(*) as count FROM expenses WHERE category_id = ? AND user_id = ? AND deleted_at IS NULL'
    ).get(id, req.userId);

    db.prepare(
      "UPDATE categories SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(id, req.userId);

    res.json({ message: 'Catégorie supprimée', expensesAffected: usageCount.count });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
