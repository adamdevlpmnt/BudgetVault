# 🏦 BudgetVault

Application web moderne de gestion de budget familial et personnel.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Fonctionnalités

- 💰 **Gestion du solde** — Suivi en temps réel du solde du compte
- 📊 **Graphiques** — Camembert par catégorie, historique mensuel
- 📱 **Mobile-first** — Optimisé smartphone, installable en PWA
- 🔄 **Récurrents** — Revenus et dépenses automatiques
- 🏷️ **Catégories** — Personnalisables avec couleurs et icônes
- 📸 **Tickets** — Upload de photos de tickets de caisse
- 🔔 **Notifications** — Rappel quotidien à 20h
- 📅 **Cycles** — Début de cycle configurable (ex: du 15 au 14)
- 🔒 **Sécurisé** — Auth JWT, bcrypt, rate limiting
- 🐳 **Docker** — Déploiement en une commande

## 🚀 Démarrage rapide

### Avec Docker (recommandé)

```bash
# Cloner le projet
git clone <url> && cd Vault

# Copier la configuration
cp .env.example .env

# Lancer
docker compose up -d

# Accéder à http://localhost:3001
```

### Sans Docker (développement)

```bash
# Backend
cd server && npm install && npm run dev

# Frontend (autre terminal)
cd client && npm install && npm run dev

# Accéder à http://localhost:5173
```

## 🔐 Compte par défaut

| Champ | Valeur |
|-------|--------|
| Username | `admin` |
| Password | `adminadmin` |

> ⚠️ Changez le mot de passe après la première connexion dans Réglages > Sécurité

## 📋 Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | React 18 + Vite 5 |
| Backend | Express.js (Node.js) |
| Database | SQLite (better-sqlite3) |
| Charts | Chart.js 4 |
| Auth | JWT + bcrypt |
| Push | web-push + Service Workers |
| Images | Multer + Sharp |
| Container | Docker multi-stage |

## 📁 Structure

```
Vault/
├── client/          # Frontend React
├── server/          # Backend Express
├── data/            # Base SQLite + uploads (volume Docker)
├── docker-compose.yml
├── Dockerfile
└── CLAUDE.md        # Documentation détaillée
```

## 🔧 Configuration

Éditez le fichier `.env` :

```env
JWT_SECRET=votre-secret-unique
PORT=3001
```

### Notifications push

```bash
cd server && npx web-push generate-vapid-keys
```

Copiez les clés dans `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).

## 💾 Backup

```bash
cp data/budget.db data/backup-$(date +%Y%m%d).db
```

## 📖 Documentation

Voir [CLAUDE.md](CLAUDE.md) pour la documentation complète du projet.
