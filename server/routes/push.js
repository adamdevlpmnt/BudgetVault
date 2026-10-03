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

    const subJson = JSON.stringify(subscription);
    const existing = db.prepare('SELECT id FROM push_subscriptions WHERE user_id = ? AND subscription = ?').get(req.userId, subJson);
    if (!existing) {
      db.prepare('INSERT INTO push_subscriptions (user_id, subscription) VALUES (?, ?)').run(req.userId, subJson);
    }

    res.json({ message: 'Abonné aux notifications' });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/test', async (req, res) => {
  try {
    if (!vapidPublic || !vapidPrivate) {
      return res.status(400).json({ error: 'Clés VAPID non configurées sur le serveur' });
    }

    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(req.userId);
    if (!subs || subs.length === 0) {
      return res.status(404).json({ error: 'Aucun abonnement trouvé. Veuillez activer les notifications.' });
    }

    const payload = JSON.stringify({
      title: '💰 BudgetVault — Test',
      body: 'Les notifications de rappel fonctionnent parfaitement !',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: 'test-reminder'
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(JSON.parse(sub.subscription), payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        }
      }
    }

    res.json({ message: `Notification de test envoyée avec succès (${sent} appareil(s))` });
  } catch (err) {
    console.error('Push test error:', err);
    res.status(500).json({ error: err.message || 'Erreur lors du test' });
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
