const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');
const { generateToken } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = generateToken(user.id, user.username);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        cycleStartDay: user.cycle_start_day,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/auth/change-password
 * Change the current user's password
 */
router.post('/change-password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);

    const isValid = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    const newHash = bcrypt.hashSync(newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newHash, req.userId);

    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, display_name, cycle_start_day, created_at FROM users WHERE id = ?'
    ).get(req.userId);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      cycleStartDay: user.cycle_start_day,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/auth/settings
 * Update user settings (display name, cycle start day)
 */
router.put('/settings', (req, res) => {
  try {
    const { displayName, cycleStartDay } = req.body;

    if (cycleStartDay !== undefined && (cycleStartDay < 1 || cycleStartDay > 28)) {
      return res.status(400).json({ error: 'Le jour de début du cycle doit être entre 1 et 28' });
    }

    const updates = [];
    const params = [];

    if (displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(displayName);
    }
    if (cycleStartDay !== undefined) {
      updates.push('cycle_start_day = ?');
      params.push(cycleStartDay);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db.prepare(
      'SELECT id, username, display_name, cycle_start_day FROM users WHERE id = ?'
    ).get(req.userId);

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      cycleStartDay: user.cycle_start_day,
    });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
