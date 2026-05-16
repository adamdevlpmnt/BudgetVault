const express = require('express');
const webpush = require('web-push');
const { db } = require('../config/db');

const router = express.Router();

// Configure VAPID keys
const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@budgetvault.local';

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
}

router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: vapidPublic });
});

router.post('/subscribe', (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'Subscription requise' });

    // Remove existing subscriptions for this user to avoid duplicates
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(req.userId);
    db.prepare('INSERT INTO push_subscriptions (user_id, subscription) VALUES (?, ?)')
      .run(req.userId, JSON.stringify(subscription));

    res.json({ message: 'Abonné aux notifications' });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/unsubscribe', (req, res) => {
  try {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(req.userId);
    res.json({ message: 'Désabonné des notifications' });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
