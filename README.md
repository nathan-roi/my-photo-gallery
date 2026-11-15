# Galerie photo

Projet de TP Kubernetes — Université Savoie Mont Blanc (INFO910).

**Auteur :** Nathan Roi

## Ce que fait l'application

Une galerie photo en ligne :

- affichage en grille justifiée : lignes de 3 photos, même hauteur par ligne, largeur
  proportionnelle au ratio de chaque image (les dimensions sont lues et stockées à l'upload) ;
- regroupement en albums, avec une barre de navigation et une section par album ;
- visionneuse plein écran, qui parcourt toute la galerie aux flèches du clavier ;
- upload et suppression de photos, **réservés à un compte administrateur** ;
- (prévu) réordonnancement par glisser-déposer.

**La consultation est publique, l'écriture non.** Il y a un seul compte administrateur, pas
d'inscription et pas de rôles : la galerie n'a qu'un auteur. Déconnecté, ni le bouton
« Ajouter des photos » ni les corbeilles ne sont affichés — mais la vraie barrière est côté
API, où `POST /api/photos` et `DELETE /api/photos/:id` répondent 401 sans session valide.

La session est un cookie `httpOnly` + `SameSite=Lax`, **stockée dans MongoDB** et non en
mémoire : l'API ayant plusieurs replicas, un pod ne doit pas ignorer la session ouverte sur
un autre. Le mot de passe n'est jamais stocké, seulement une empreinte scrypt
(`ADMIN_PASSWORD_HASH`), placée dans le Secret Kubernetes.

### Créer le compte administrateur

```bash
cd backend
npm run hash -- "mon mot de passe"
```

La commande affiche une empreinte de la forme `scrypt:16384:8:1:...`, à coller dans
`ADMIN_PASSWORD_HASH` (dans `.env` et `backend/.env` pour le développement, dans
`k8s/secret.yaml` pour Kubernetes). Le mot de passe lui-même n'est écrit nulle part.

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
| `GET` | `/api/photos` | Liste des photos, triée par `position` (filtrable : `?album=`) |
| `POST` | `/api/photos` | Upload d'une photo — **administrateur** |
| `DELETE` | `/api/photos/:id` | Suppression — **administrateur** |
| `GET` | `/api/photos/:id/file` | Récupération du fichier depuis MinIO |
| `PATCH` | `/api/photos/order` | *(prévu)* nouvel ordre — **administrateur** |
| `GET` | `/api/session` | État de connexion |
| `POST` | `/api/session` | Connexion (pose le cookie) |
| `DELETE` | `/api/session` | Déconnexion |
| `GET` | `/api/health` | Sonde de *liveness* : répond toujours, ne teste pas les dépendances |
| `GET` | `/api/ready` | Sonde de *readiness* : vérifie MongoDB et MinIO, 503 sinon |

Les deux sondes sont volontairement distinctes. Si `/api/health` testait MongoDB, le moindre
hoquet de la base ferait **redémarrer** tous les pods de l'API au lieu de les retirer
temporairement du service — ce qui n'arrangerait rien. C'est `/api/ready` qui joue ce rôle.

## Prérequis

- Docker et Docker Compose
- Node.js 24+ (pour le développement en local)
- `kubectl` et `minikube` (pour le déploiement Kubernetes)

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
- MinIO écoute sur `localhost:9000`, sa console web est sur <http://localhost:9001>
  (identifiants : `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` du `.env`)

  Tous les ports sont réglables dans le `.env`, utile si un autre service occupe déjà
  l'un d'eux sur la machine.

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

### Inspecter la base de données

Un service `mongo-express` fournit une interface web pour parcourir MongoDB. C'est un
outil de développement, placé derrière un profil Compose : `docker compose up` ne le
démarre pas. Pour le lancer :

```bash
docker compose up -d mongo-express
```

Puis <http://localhost:8081> — pas d'authentification, l'interface n'étant publiée que
sur la machine locale.

Sans interface, `mongosh` est déjà présent dans l'image MongoDB :

```bash
docker compose exec mongodb mongosh \
  "mongodb://photo:changeme@localhost:27017/photogallery?authSource=admin"
```

Le `?authSource=admin` est indispensable : l'utilisateur est créé dans la base `admin`,
pas dans `photogallery`.

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
- Console MinIO : <http://localhost:9001>

Le front et l'API ne publient aucun port sur l'hôte : ils ne sont joignables qu'à travers le
proxy (et entre eux, par le réseau interne du compose).

## Déploiement sur Kubernetes

Les manifestes sont dans `k8s/`, assemblés par **Kustomize** (intégré à `kubectl`, rien à
installer en plus). Ce qui suit est la procédure complète, telle qu'elle a été vérifiée sur
minikube v1.39 / Kubernetes v1.37.

### Les objets déployés

| Objet | Nom | Rôle |
|---|---|---|
| Namespace | `galerie-photo` | Isole l'application ; une seule commande pour tout retirer |
| ConfigMap | `galerie-config` | Configuration non secrète de l'API |
| Secret | `galerie-secrets` | Identifiants Mongo et MinIO, compte administrateur |
| StatefulSet + Service headless | `mongodb` | Base de données, PVC de 2 Gi |
| StatefulSet + Service | `minio` | Stockage des fichiers, PVC de 5 Gi |
| Deployment (2 replicas) + Service | `backend` | API, sans état |
| Deployment (2 replicas) + Service | `frontend` | Fichiers statiques servis par nginx |
| Ingress | `galerie` | Point d'entrée unique : `/api` → API, `/` → front |

**StatefulSet et non Deployment** pour MongoDB et MinIO : un Deployment ne sait pas donner à
chaque pod son propre volume. Le `volumeClaimTemplates` d'un StatefulSet crée un PVC par pod,
conservé quand le pod est détruit et rattaché à celui qui le remplace — c'est ce qui fait
survivre les données.

**L'Ingress remplace le conteneur `proxy`** du compose, avec les mêmes réglages traduits en
annotations. La première n'est pas optionnelle : ingress-nginx limite les corps de requête à
**1 Mo** par défaut, et tout upload de photo serait refusé en 413.

### 1. Démarrer le cluster

```bash
minikube start --driver=docker --cpus=2 --memory=4096
minikube addons enable ingress
```

> **Si un VPN est actif, coupe-le.** Le client Cisco Secure Client supprime les routes des
> ponts Docker, y compris celle de minikube (`192.168.49.0/24`). `kubectl` expire alors au
> bout de 30 secondes sans message utile, et les conteneurs semblent pourtant en bonne santé.

### 2. Créer le Secret

Seul le modèle est versionné ; le Secret réel ne l'est jamais :

```bash
cp k8s/secrets.example.yaml k8s/secret.yaml
# puis remplacer chaque valeur « a_remplacer »
```

`ADMIN_PASSWORD_HASH` se génère avec `cd backend && npm run hash -- "mon mot de passe"`, et
`SESSION_SECRET` avec :

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Sans cette copie, `kubectl apply -k k8s/` échoue d'emblée — c'est voulu : mieux vaut un échec
immédiat qu'un déploiement avec les identifiants d'exemple.

### 3. Construire les images et les charger dans minikube

minikube a **son propre démon d'images**, séparé de celui de la machine : une image
construite en local lui est invisible, il tenterait de la télécharger depuis Docker Hub et
échouerait en `ErrImagePull`. Il faut donc la lui transférer.

```bash
docker compose build

docker tag my-photo-gallery-backend:latest  galerie-backend:1.0
docker tag my-photo-gallery-frontend:latest galerie-frontend:1.0
minikube image load galerie-backend:1.0
minikube image load galerie-frontend:1.0
```

C'est pourquoi les deux Deployments portent `imagePullPolicy: Never`. Les trois autres
images (`mongo:8`, `busybox:1.37` et MinIO) se téléchargent normalement, il n'y a rien à
faire pour elles.

> **Pourquoi MinIO vient de `ghcr.io/nathan-roi/minio` et non de `minio/minio`**
>
> MinIO ne distribue plus son image communautaire en accès anonyme : Docker Hub et quay.io
> répondent tous deux `insufficient_scope: authorization failed`, sur le tag comme sur le
> digest, alors que `mongo:8` et `nginx:alpine` passent par le même chemin sans problème.
> Le manifeste pointe donc sur un miroir public : l'image officielle
> `RELEASE.2025-09-07T16-13-09Z`, republiée telle quelle et sans modification, pour que le
> déploiement fonctionne sur une machine neuve.

> **À ne pas tenter :** construire directement dans le démon de minikube via
> `eval $(minikube docker-env)`. minikube v1.39 utilise le runtime **containerd**, et sa
> couche de compatibilité avec l'API Docker ne sait pas démarrer BuildKit —
> `docker compose build` échoue sur
> `failed to inspect pulled image moby/buildkit:buildx-stable-1: 404 page not found`.

### 4. Déployer

```bash
kubectl apply -k k8s/
kubectl get pods -n galerie-photo -w        # Ctrl-C quand tout est 1/1
```

Le premier déploiement prend une à deux minutes, le temps que MongoDB initialise son volume.
Les pods de l'API restent pendant ce temps en `Init:0/1` : un `initContainer` attend que
MongoDB et MinIO répondent avant de lancer l'API, qui sort en erreur si ses dépendances sont
injoignables. Sans cette attente, les pods boucleraient en `CrashLoopBackOff` — Kubernetes
finirait par converger, mais sur un premier déploiement ça ressemble à une panne.

### 5. Accéder à l'application

L'Ingress route par nom d'hôte, il faut donc le rendre résolvable :

```bash
echo "$(minikube ip) galerie.local" | sudo tee -a /etc/hosts
```

Puis **<http://galerie.local>**.

Vérification en ligne de commande, sans toucher à `/etc/hosts` :

```bash
curl --resolve galerie.local:80:$(minikube ip) http://galerie.local/api/ready
# {"status":"ready","checks":{"mongo":true,"minio":true}}
```

Filet de secours si l'Ingress fait des siennes — attention, il le contourne, donc il ne teste
plus le routage :

```bash
kubectl port-forward -n galerie-photo svc/frontend 8080:80
```

Pour inspecter le stockage, la console MinIO n'est pas exposée par l'Ingress :

```bash
kubectl port-forward -n galerie-photo svc/minio 9001:9001   # http://localhost:9001
```

### 6. Vérifier le déploiement

Trois propriétés qui justifient les choix d'architecture, et qui se vérifient en une
commande chacune. Garde un onglet ouvert sur le site pendant chaque test.

**Les données survivent à la perte de la base et du stockage** — c'est le rôle des PVC :

```bash
kubectl delete pod -n galerie-photo mongodb-0 minio-0
```

Les pods sont recréés, et les photos sont toujours là après rechargement.

**La session survit à la perte d'un pod d'API** — c'est pourquoi elle est stockée en base et
non en mémoire. Connecte-toi, puis :

```bash
kubectl delete pod -n galerie-photo -l app=backend
```

Tu restes connecté : les deux pods ont été remplacés, mais la session est dans MongoDB.

**La mise à jour ne coupe pas le service.** Dans un terminal :

```bash
while true; do curl -s -o /dev/null -w "%{http_code} " http://galerie.local/api/photos; done
```

Dans un autre :

```bash
kubectl rollout restart deployment/backend -n galerie-photo
```

Seuls des `200` doivent défiler. Trois réglages y concourent : `maxUnavailable: 0`, l'arrêt
propre du serveur sur SIGTERM, et un `preStop` de 5 secondes. Ce dernier n'est pas une
précaution théorique : sans lui, le retrait du pod de la liste des Endpoints et l'envoi du
SIGTERM partant en parallèle, ingress-nginx route encore vers un pod qui vient de fermer son
écoute — mesuré à 1 échec sur 521 requêtes.

### Mettre à jour après une modification du code

Le tag de l'image ne changeant pas, Kubernetes n'a aucune raison de recréer les pods : il faut
le lui demander.

```bash
docker compose build
docker tag my-photo-gallery-backend:latest galerie-backend:1.0
minikube image load galerie-backend:1.0
kubectl rollout restart deployment/backend -n galerie-photo
```

### En cas de problème

Dans cet ordre — un souci d'image ou de volume n'apparaît **que** dans les événements, jamais
dans les journaux :

```bash
kubectl get pods -n galerie-photo
kubectl describe pod -n galerie-photo <pod>    # les événements sont en bas
kubectl logs -n galerie-photo <pod>
kubectl logs -f -n galerie-photo -l app=backend --prefix   # les deux replicas à la fois
```

| Symptôme | Cause probable |
|---|---|
| `ErrImagePull` / `ImagePullBackOff` | image du projet non chargée dans minikube (étape 3) |
| `Init:0/1` qui dure | MongoDB ou MinIO pas encore prêt — c'est normal une à deux minutes |
| `CreateContainerConfigError` | une clé manque dans `k8s/secret.yaml` |
| 413 à l'upload | l'annotation `proxy-body-size` de l'Ingress |
| Déconnexion immédiate après connexion | `COOKIE_SECURE` à `true` sur une origine en HTTP |
| `kubectl` qui expire sans message | VPN actif (voir étape 1) |

### Tout supprimer

```bash
kubectl delete -k k8s/
```

**Les PVC ne sont pas supprimés** : c'est le comportement d'un StatefulSet, et c'est
volontaire — un `delete` accidentel n'efface pas les photos. Pour repartir vraiment de zéro :

```bash
kubectl delete pvc -n galerie-photo --all
```

### Passer en production

Deux points à changer, et un à garder en tête :

- `COOKIE_SECURE` doit passer à `true` dans `k8s/configmap.yaml` dès qu'il y a du TLS. Il est
  à `false` ici parce qu'un cookie `secure` est **ignoré** sur une origine en HTTP, et que la
  session ne tiendrait alors jamais.
- Les images du projet doivent venir d'un registre plutôt que d'un `minikube image load` :
  décommenter le bloc `images:` de `k8s/kustomization.yaml` et retirer les
  `imagePullPolicy: Never` des deux Deployments. MinIO, lui, vient déjà d'un registre.
- La limite de tentatives de connexion est **en mémoire**, donc propre à chaque replica :
  avec deux pods, un attaquant dispose du double d'essais. Compromis assumé, le but étant de
  casser l'automatisation, pas de résister à une attaque distribuée.

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
└── k8s/                     # manifestes Kubernetes (kubectl apply -k k8s/)
    ├── kustomization.yaml   # assemble tout, fixe le namespace
    ├── namespace.yaml
    ├── configmap.yaml       # configuration non secrète de l'API
    ├── secrets.example.yaml # modèle du Secret (le vrai n'est pas versionné)
    ├── ingress.yaml         # /api -> API, / -> front
    ├── mongodb/             # StatefulSet + Service headless
    ├── minio/               # StatefulSet + Service
    ├── backend/             # Deployment (2 replicas) + Service
    └── frontend/            # Deployment (2 replicas) + Service
```
