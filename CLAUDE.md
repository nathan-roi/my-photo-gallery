# Galerie photo — TP Kubernetes

## Contexte
TP universitaire (Université Savoie Mont Blanc) à rendre sous forme de dépôt git avant novembre 2026.
Exigences :
- application conteneurisée avec au moins deux conteneurs ;
- manifestes Kubernetes permettant de la déployer (cette partie doit être originale, c'est elle qui est évaluée) ;
- un README avec : noms du binôme, ce que fait l'application et comment l'utiliser, comment la déployer sur Kubernetes ;
- la branche principale contient les sources, les Dockerfiles, les manifestes et le README.

## L'application
Galerie photo en ligne (l'un des membres du binôme est photographe amateur).
- Upload de photos depuis le site.
- Affichage en grille justifiée : lignes de 3 photos, même hauteur par ligne, largeur proportionnelle au ratio de chaque image (largeur et hauteur stockées à l'upload).
- Plus tard (optionnel) : réordonner les photos par drag & drop (champ `position` prévu dès le départ en base).

## Architecture : 4 conteneurs
| Conteneur | Techno | Objet K8s |
|---|---|---|
| Front | React + Vite, buildé puis servi par Nginx (Dockerfile multi-étapes) | Deployment + Service |
| API | Node.js + Express (ES modules) | Deployment (2+ replicas, sans état) + Service |
| Base | MongoDB + Mongoose (métadonnées) | StatefulSet + volumeClaimTemplates + Service headless |
| Stockage | MinIO (fichiers images) | StatefulSet + volumeClaimTemplates + Service |

Autres objets K8s prévus : Namespace, ConfigMap (config de l'API), Secret (identifiants Mongo/MinIO, non versionné : seul `secrets.example.yaml` est commité), Ingress (`/` → front, `/api` → API). Kustomize via `kubectl apply -k k8s/`. Tests sur minikube avec l'addon ingress-nginx.

### Choix de conception
- Les photos sont dans MinIO, pas dans un volume monté sur l'API : l'API reste sans état et peut avoir plusieurs replicas (un PVC ReadWriteOnce ne peut pas être partagé entre nœuds).
- Le navigateur récupère les images via un **proxy dans l'API** (`GET /api/photos/:id/file` lit dans MinIO et renvoie le fichier). Pas d'URL présignées pour l'instant, pour ne pas exposer MinIO via l'Ingress.
- L'API crée le bucket MinIO au démarrage s'il n'existe pas.
- Évolution possible : worker de génération de miniatures avec `sharp`.

## Backend
Dépendances : express, multer (upload), sharp (dimensions des images), minio (SDK), mongoose ; nodemon en dev.
Scripts : `npm start` (node src/index.js), `npm run dev` (nodemon).

Routes :
- `GET /api/photos` — liste triée par `position`
- `POST /api/photos` — upload (multer), lecture des dimensions (sharp), envoi dans MinIO, création du document
- `DELETE /api/photos/:id`
- `GET /api/photos/:id/file` — proxy du fichier depuis MinIO
- `PATCH /api/photos/order` — (plus tard) nouvel ordre
- `GET /api/health` — pour les liveness/readiness probes

Schéma `Photo` : titre, objectKey (clé dans MinIO), width, height, position, date de création.

## Frontend
React + Vite. Proxy `/api` vers le backend dans `vite.config.js` en dev. `nginx.conf` avec fallback vers `index.html`. Drag & drop futur : dnd-kit.
Composants : Gallery (grille justifiée), PhotoCard, UploadForm, Lightbox.

## Arborescence
```
galerie-photo/
├── README.md
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── frontend/
│   ├── Dockerfile, nginx.conf, .dockerignore, package.json, vite.config.js, index.html
│   └── src/ (main.jsx, App.jsx, api/photos.js, components/, styles/gallery.css)
├── backend/
│   ├── Dockerfile, .dockerignore, package.json
│   └── src/ (index.js, config.js, db/mongo.js, storage/minio.js, models/Photo.js, routes/photos.js, routes/health.js)
└── k8s/
    ├── kustomization.yaml, namespace.yaml, secrets.example.yaml, configmap.yaml, ingress.yaml
    ├── mongodb/ (statefulset.yaml, service.yaml)
    ├── minio/ (statefulset.yaml, service.yaml)
    ├── backend/ (deployment.yaml, service.yaml)
    └── frontend/ (deployment.yaml, service.yaml)
```

## Ordre de travail
1. Backend et frontend en local (`npm run dev`), avec seulement MongoDB et MinIO dans Docker.
2. Dockerfiles + `docker-compose.yml` avec les 4 conteneurs.
3. Manifestes `k8s/` en dernier (traduction du compose), test sur minikube.

## État actuel
- Backend initialisé : `npm init`, `type: module`, dépendances installées, fichiers vides créés selon l'arborescence.
- Le dossier `k8s/` n'est pas encore créé (volontairement, voir ordre de travail).

## Conventions
- Échanger en français.
- Ne jamais versionner de vrais secrets ni `node_modules`.
