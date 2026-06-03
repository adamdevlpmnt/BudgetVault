# 🏦 BudgetVault

Application web moderne de gestion de budget familial et personnel — **fonctionne même sans Internet**.

![Version](https://img.shields.io/badge/version-2.0.1-blue)
![Docker](https://img.shields.io/badge/docker-ready-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)
![Offline](https://img.shields.io/badge/offline-first-orange)

---

## ✨ Fonctionnalités

- 💰 **Gestion du solde** — Suivi en temps réel, masquer/afficher, édition rapide
- 📊 **Graphiques** — Camembert par catégorie, historique mensuel en barres
- 📱 **Mobile-first** — Optimisé smartphone, installable en PWA
- 📡 **Offline-First** — Fonctionne sans connexion, synchronisation automatique au retour en ligne
- 🔄 **Récurrents** — Revenus et dépenses automatiques (salaire, loyer...)
- 🏷️ **Catégories** — 10 par défaut, personnalisables avec couleurs et icônes
- 📸 **Tickets de caisse** — Upload et compression automatique des photos
- 🔔 **Notifications push** — Rappel quotidien à 20h
- 📅 **Cycles budgétaires** — Début configurable (ex : du 15 au 14)
- 🔒 **Sécurisé** — Auth JWT, bcrypt, rate limiting anti brute-force
- 🐳 **Docker** — Déploiement en une commande

---

## 📡 Mode Offline-First (v2.0.1)

BudgetVault fonctionne désormais **sans connexion Internet**. Toutes les données sont stockées localement dans le navigateur (IndexedDB) et synchronisées automatiquement avec le serveur.

### Ce qui fonctionne hors ligne
- ✅ Consulter/ajouter/modifier/supprimer des dépenses
- ✅ Gérer les catégories et les récurrents
- ✅ Modifier le solde
- ✅ Consulter les statistiques et graphiques
- ✅ Naviguer entre toutes les pages

### Synchronisation
- 🔄 **Auto-sync** toutes les 30 secondes quand en ligne
- ⚡ **Sync instantanée** à la reconnexion
- 🔁 **Retry automatique** en cas d'échec (backoff exponentiel)
- 🛡️ **Résolution de conflits** — Priorité serveur (Last-Write-Wins)
- 📊 **Indicateur visuel** — Barre de statut et pastille colorée dans la navbar

---

## 🚀 Installation

### Méthode 1 — Docker (recommandée, la plus simple)

C'est la méthode la plus simple : **pas besoin de cloner le repo**. Il suffit de 2 fichiers.

#### Étape 1 : Créer un dossier

```bash
mkdir budgetvault && cd budgetvault
```

#### Étape 2 : Créer le fichier `docker-compose.yml`

Créez un fichier `docker-compose.yml` avec ce contenu :

```yaml
services:
  budgetvault:
    image: ghcr.io/adamdevlpmnt/budgetvault:latest
    container_name: budgetvault
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3001
      - JWT_SECRET=CHANGEZ-MOI-avec-une-phrase-secrete-longue
      - VAPID_PUBLIC_KEY=
      - VAPID_PRIVATE_KEY=
      - VAPID_EMAIL=mailto:admin@budgetvault.local
    healthcheck:
      test: ["CMD", "node", "-e", "const http=require('http');const r=http.get('http://localhost:3001/api/health',{timeout:4000},res=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

#### Étape 3 : Lancer

```bash
docker compose up -d
```

#### Étape 4 : Accéder

Ouvrez votre navigateur à **http://localhost:3001**

> 💡 Sur mobile (même réseau Wi-Fi), utilisez l'IP de votre machine : `http://192.168.x.x:3001`

---

### Méthode 2 — Docker avec build local

Si vous préférez construire l'image depuis le code source :

```bash
# Cloner le repo
git clone https://github.com/adamdevlpmnt/BudgetVault.git
cd Vault

# Build et lancer
docker compose -f docker-compose.build.yml up -d --build
```

---

### Méthode 3 — Développement local (sans Docker)

```bash
# Cloner le repo
git clone https://github.com/adamdevlpmnt/BudgetVault.git
cd Vault

# Backend
cd server && npm install && npm run dev

# Frontend (autre terminal)
cd client && npm install && npm run dev

# Accéder à http://localhost:5173
```

---

## 🔐 Compte par défaut

| Champ | Valeur |
|-------|--------|
| **Utilisateur** | `admin` |
| **Mot de passe** | `adminadmin` |

> ⚠️ **Changez le mot de passe** après la première connexion dans **Réglages → Sécurité**

---

## ⚙️ Configuration

### Variables d'environnement

| Variable | Description | Obligatoire | Défaut |
|----------|-------------|:-----------:|--------|
| `JWT_SECRET` | Clé secrète pour les tokens JWT | ✅ | `budgetvault-changez-moi` |
| `PORT` | Port du serveur | | `3001` |
| `VAPID_PUBLIC_KEY` | Clé publique notifications push | | _(vide)_ |
| `VAPID_PRIVATE_KEY` | Clé privée notifications push | | _(vide)_ |
| `VAPID_EMAIL` | Email pour notifications push | | `mailto:admin@budgetvault.local` |

### Activer les notifications push

Les notifications push nécessitent des clés VAPID. Pour les générer :

```bash
# Si Node.js est installé localement
npx web-push generate-vapid-keys

# Ou depuis le container Docker
docker exec budgetvault npx web-push generate-vapid-keys
```

Copiez les clés dans votre `docker-compose.yml` (variables `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`), puis redémarrez :

```bash
docker compose restart
```

### Changer le port

Pour utiliser un autre port (exemple: 8080) :

```yaml
    ports:
      - "8080:3001"
```

---

## 🔄 Mise à jour

```bash
# Tirer la dernière image
docker compose pull

# Relancer
docker compose up -d

# Vérifier les logs
docker compose logs -f
```

> 💡 Les migrations de base de données s'exécutent automatiquement au démarrage. Aucune intervention manuelle requise.

---

## 💾 Backup & Restauration

Toutes les données sont dans le dossier `./data/` :
- `data/budget.db` — Base de données SQLite
- `data/uploads/` — Images des tickets de caisse

### Backup

```bash
# Backup simple
cp data/budget.db data/budget.db.backup

# Backup avec date
cp data/budget.db "data/backup-$(date +%Y%m%d-%H%M).db"
```

### Restauration

```bash
docker compose down
cp data/budget.db.backup data/budget.db
docker compose up -d
```

---

## 🏗️ CI/CD — Publication automatique

Ce repo utilise **GitHub Actions** pour construire et publier automatiquement l'image Docker.

### Fonctionnement

À chaque **push sur `main`** :
1. GitHub Actions build l'image Docker (multi-arch : `amd64` + `arm64`)
2. L'image est publiée sur **GitHub Container Registry** (`ghcr.io`)
3. Le tag `latest` est automatiquement mis à jour

### Tags versionnés

Pour publier une version taguée :

```bash
git tag v2.0.1
git push origin v2.0.1
```

L'image sera disponible sous `ghcr.io/adamdevlpmnt/budgetvault:2.0.1`.

### Rendre l'image publique

Par défaut, les images GHCR sont privées. Pour la rendre publique :

1. Allez sur `github.com/adamdevlpmnt/BudgetVault`
2. Cliquez sur **Packages** (barre latérale droite)
3. Cliquez sur le package `vault`
4. **Package settings** → **Danger Zone** → **Change visibility** → **Public**

---

## 📋 Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | React 18 + Vite 5 |
| Backend | Express.js (Node.js 20) |
| Database | SQLite (better-sqlite3) |
| Offline | IndexedDB (idb v8) + Sync Engine |
| Charts | Chart.js 4 |
| Auth | JWT + bcrypt |
| Push | web-push + Service Workers |
| Images | Multer + Sharp |
| CI/CD | GitHub Actions |
| Registry | GitHub Container Registry |

## 📁 Structure du projet

```
Vault/
├── .github/workflows/     # CI/CD GitHub Actions
├── client/                # Frontend React
│   └── src/
│       ├── utils/
│       │   ├── api.js           # Client HTTP direct
│       │   ├── offlineApi.js    # Wrapper offline-first
│       │   ├── offlineDb.js     # Couche IndexedDB
│       │   └── syncEngine.js    # Moteur de synchronisation
│       ├── context/
│       │   ├── AuthContext.jsx   # Authentification
│       │   └── SyncContext.jsx   # État de sync global
│       └── components/
│           └── SyncStatusBar.jsx # Indicateur visuel
├── server/                # Backend Express
│   └── routes/
│       └── sync.js              # Endpoint synchronisation
├── data/                  # Base SQLite + uploads (volume Docker)
├── docker-compose.yml     # Installation (pull depuis GHCR)
├── docker-compose.build.yml # Build local
├── Dockerfile             # Build multi-stage
├── CLAUDE.md              # Documentation technique détaillée
└── README.md              # Ce fichier
```

---

## 📖 Documentation technique

Voir [CLAUDE.md](CLAUDE.md) pour la documentation technique complète :
- Architecture détaillée
- Architecture Offline-First & synchronisation
- Modèle de données SQL
- Endpoints API (y compris `/api/sync`)
- Design system
- Stratégie de sécurité
- Roadmap

---

## 📱 Installer sur smartphone

BudgetVault est une **PWA** (Progressive Web App). Pour l'ajouter à l'écran d'accueil :

### iPhone / iPad (Safari)
1. Ouvrez `http://votre-ip:3001` dans Safari
2. Appuyez sur le bouton **Partager** (carré avec flèche)
3. Sélectionnez **Sur l'écran d'accueil**

> 💡 En mode PWA sur iPhone, l'application fonctionne même sans connexion grâce au mode offline-first.

### Android (Chrome)
1. Ouvrez `http://votre-ip:3001` dans Chrome
2. Appuyez sur les **3 points** en haut à droite
3. Sélectionnez **Ajouter à l'écran d'accueil**

---

## 📝 Changelog

### v2.0.1 — Mode Offline-First
- 📡 **Offline-First** — L'application fonctionne entièrement sans connexion Internet
- 🗄️ **IndexedDB** — Stockage local des données dans le navigateur
- 🔄 **Synchronisation bidirectionnelle** — Pull/push automatique avec le serveur
- ⚡ **Auto-sync** — Toutes les 30s + immédiat à la reconnexion
- 🛡️ **Résolution de conflits** — Last-Write-Wins avec priorité serveur
- 📊 **Indicateur visuel** — Barre de statut et pastille de sync dans la navbar
- 🔒 **Soft-delete** — Les suppressions sont réversibles côté serveur
- ⚙️ **Transactions atomiques** — Insert + balance wrappés dans des transactions SQLite
- 🔧 **Service Worker réécrit** — Pré-cache, stale-while-revalidate, offline shell

### v1.0.0 — Version initiale
- 💰 Gestion du solde et des dépenses
- 🏷️ Catégories personnalisables
- 🔄 Revenus/dépenses récurrents
- 📊 Graphiques et statistiques
- 📸 Upload tickets de caisse
- 🔔 Notifications push
- 📅 Cycles budgétaires configurables
- 🐳 Docker ready

---

## 🛠️ Dépannage

### L'app ne démarre pas
```bash
docker compose logs -f
```

### Réinitialiser la base de données
```bash
docker compose down
rm data/budget.db
docker compose up -d
```

### Le port 3001 est déjà utilisé
Changez le port dans `docker-compose.yml` :
```yaml
    ports:
      - "8080:3001"  # Utiliser le port 8080
```

### Les données hors-ligne ne se synchronisent pas
1. Vérifiez la barre de statut en haut de l'écran
2. Appuyez sur le bouton **↻** pour forcer une synchronisation
3. Vérifiez les logs du serveur : `docker compose logs -f`
