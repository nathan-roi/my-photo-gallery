# Galerie photo

Projet de TP Kubernetes — Université Savoie Mont Blanc (INFO910).

**Binôme :** Nathan Roi, *(à compléter)*

## Ce que fait l'application

Une galerie photo en ligne :

- upload de photos depuis le site ;
- affichage en grille justifiée : lignes de 3 photos, même hauteur par ligne, largeur
  proportionnelle au ratio de chaque image (les dimensions sont lues et stockées à l'upload) ;
- suppression d'une photo ;
- (prévu) réordonnancement par glisser-déposer.

## Architecture

Quatre conteneurs applicatifs, plus un reverse proxy qui les met sur une seule origine :

| Conteneur | Techno | Rôle |
|---|---|---|
| `frontend` | React + Vite (SPA), buildé puis servi par nginx | Interface web |
| `backend` | Node.js + Express | API REST, sans état |
| `mongodb` | MongoDB + Mongoose | Métadonnées des photos (titre, dimensions, position) |
| `minio` | MinIO (compatible S3) | Fichiers images |
| `proxy` | nginx | Point d'entrée unique (`/` → front, `/api` → API) |

Le conteneur `proxy` n'existe que pour le `docker compose` : en Kubernetes, c'est l'Ingress
qui joue ce rôle. Grâce à lui, le navigateur voit toujours le front et l'API sur **la même
origine**, dans les trois environnements (dev, compose, Kubernetes). Le code du front appelle
donc l'API en relatif (`fetch("/api/photos")`) sans jamais se soucier de l'URL de base, et
aucune configuration CORS n'est nécessaire.

Le front est une application monopage : le conteneur ne contient que des fichiers statiques
servis par nginx, sans état ni variable d'environnement. Son `nginx.conf` renvoie `index.html`
pour toute URL inconnue, afin qu'un rechargement sur une route de l'application ne donne pas
un 404.

Les fichiers sont stockés dans MinIO et non dans un volume monté sur l'API : celle-ci reste
sans état et peut donc avoir plusieurs replicas. Le navigateur récupère les images via un proxy
de l'API (`GET /api/photos/:id/file`), ce qui évite d'exposer MinIO.

### Routes de l'API

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/photos` | Liste des photos, triée par `position` |
| `POST` | `/api/photos` | Upload d'une photo |
| `DELETE` | `/api/photos/:id` | Suppression |
| `GET` | `/api/photos/:id/file` | Récupération du fichier depuis MinIO |
| `PATCH` | `/api/photos/order` | *(prévu)* nouvel ordre |
| `GET` | `/api/health` | Sonde de santé (liveness / readiness) |

## Prérequis

- Docker et Docker Compose
- Node.js 24+ (pour le développement en local)

## Démarrage en mode développement

C'est le mode recommandé pour développer : seules les briques d'infrastructure
(MongoDB et MinIO) tournent dans Docker, le front et l'API tournent en local avec
rechargement à chaud.

### 1. Variables d'environnement

```bash
cp .env.example .env               # identifiants Mongo / MinIO utilisés par le compose
cp backend/.env.example backend/.env   # mêmes identifiants, vus depuis la machine hôte
```

Les fichiers `.env` ne sont pas versionnés ; les valeurs par défaut des `.env.example`
suffisent pour du développement local.

### 2. Lancer MongoDB et MinIO

```bash
docker compose up -d mongodb minio
```

- MongoDB écoute sur `localhost:27017`
- MinIO écoute sur `localhost:9100`, sa console web est sur <http://localhost:9101>
  (identifiants : `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` du `.env`)

  Les ports publiés sont 9100/9101 et non 9000/9001, souvent déjà occupés par un autre
  MinIO local. Tous les ports sont réglables dans le `.env`.

Le bucket est créé automatiquement par l'API à son démarrage.

### 3. Lancer l'API

```bash
cd backend
npm install
npm run dev        # nodemon, lit backend/.env, écoute sur http://localhost:3001
```

### 4. Lancer le front

```bash
cd frontend
npm install
npm run dev        # Vite, http://localhost:5173
```

Le serveur de dev Vite relaie `/api` vers `http://localhost:3001` (voir `server.proxy` dans
`frontend/vite.config.js`) : le code du navigateur utilise donc des URL relatives
(`fetch("/api/photos")`), exactement comme derrière le proxy nginx et l'Ingress. Aucune
configuration CORS n'est nécessaire, dans aucun environnement.

### Arrêter l'infrastructure

```bash
docker compose down          # arrête les conteneurs, conserve les données
docker compose down -v       # supprime aussi les volumes (photos et base effacées)
```

## Démarrage de la pile complète avec Docker Compose

Pour lancer toute la pile, sans rien installer en local :

```bash
cp .env.example .env
docker compose up --build
```

Tout passe par le reverse proxy, sur un seul port :

- Application : <http://localhost:8080>
- API : <http://localhost:8080/api/health>
- Console MinIO : <http://localhost:9101>

Le front et l'API ne publient aucun port sur l'hôte : ils ne sont joignables qu'à travers le
proxy (et entre eux, par le réseau interne du compose).

## Déploiement sur Kubernetes

*(à venir — manifestes dans `k8s/`)*

## Structure du dépôt

```
my-photo-gallery/
├── docker-compose.yml       # les conteneurs de l'application
├── .env.example             # identifiants et ports (copier en .env)
├── proxy/
│   └── nginx.conf           # routage / -> front, /api -> API
├── backend/                 # API Express
│   ├── Dockerfile
│   ├── .env.example
│   └── src/
├── frontend/                # application React + Vite (SPA)
│   ├── Dockerfile, nginx.conf
│   └── src/
└── k8s/                     # manifestes Kubernetes
```
