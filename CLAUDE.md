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
| Front | React 19 + Vite 8 en SPA (JavaScript, pas TS), buildé puis servi par nginx (Dockerfile multi-étapes) | Deployment + Service |
| API | Node.js + Express (ES modules) | Deployment (2+ replicas, sans état) + Service |
| Base | MongoDB + Mongoose (métadonnées) | StatefulSet + volumeClaimTemplates + Service headless |
| Stockage | MinIO (fichiers images) | StatefulSet + volumeClaimTemplates + Service |

Autres objets K8s prévus : Namespace, ConfigMap (config de l'API), Secret (identifiants Mongo/MinIO, non versionné : seul `secrets.example.yaml` est commité), Ingress (`/` → front, `/api` → API). Kustomize via `kubectl apply -k k8s/`. Tests sur minikube avec l'addon ingress-nginx.

En plus de ces 4 conteneurs, le `docker-compose.yml` a un 5e service `proxy` (nginx) qui tient le rôle de l'Ingress en local : `/` → front, `/api` → API, donc une seule origine pour le navigateur. Il n'a pas d'équivalent dans `k8s/`, où l'Ingress le remplace.

Le compose a aussi un service `mongo-express` (interface web pour MongoDB, sur le port 8081), derrière le profil `outils` : `docker compose up` ne le démarre pas, il faut le nommer explicitement (`docker compose up -d mongo-express`). C'est un outil de développement, sans équivalent dans `k8s/` lui non plus.

### Choix de conception
- Les photos sont dans MinIO, pas dans un volume monté sur l'API : l'API reste sans état et peut avoir plusieurs replicas (un PVC ReadWriteOnce ne peut pas être partagé entre nœuds).
- Le navigateur récupère les images via un **proxy dans l'API** (`GET /api/photos/:id/file` lit dans MinIO et renvoie le fichier). Pas d'URL présignées pour l'instant, pour ne pas exposer MinIO via l'Ingress.
- L'API crée le bucket MinIO au démarrage s'il n'existe pas.
- Évolution possible : worker de génération de miniatures avec `sharp`.
- **Une seule origine dans les trois environnements** (dev via le proxy Vite, compose via le service `proxy`, K8s via l'Ingress) : le front appelle toujours l'API en relatif (`fetch("/api/photos")`), il n'y a donc jamais d'URL de base à configurer ni de CORS à activer.
- **Front en SPA, pas en SSR.** Le conteneur du front ne contient que des fichiers statiques servis par nginx : sans état, sans variable d'environnement, sans runtime Node. Un premier essai avec React Router en mode framework (SSR) a été abandonné : le SSR coûtait un conteneur Node et un double chemin de données (loader côté serveur + fetch navigateur) pour un bénéfice nul ici (SEO, premier affichage).
- **Pas de React Router pour l'instant** : la galerie est une page unique. À ajouter en mode *data* le jour où il faudra des URL partageables par photo.
- **Authentification** : lecture publique, écriture (ajout et suppression) réservée à un compte administrateur unique. Pas de rôles, pas de collection d'utilisateurs, pas de champ `owner` sur les photos — il n'y a qu'un seul auteur. Session en cookie, stockée en base (`connect-mongo`) et non en mémoire : l'API a plusieurs replicas, un pod ne doit pas ignorer la session ouverte sur un autre. Pas de JWT : il faudrait le ranger côté navigateur (vol par XSS depuis `localStorage`) et il resterait valable jusqu'à expiration, donc irrévocable sans liste de révocation — c'est-à-dire sans refaire un stockage de sessions.
- `/api/health` ne teste volontairement ni Mongo ni MinIO : c'est une sonde de *liveness*, elle doit répondre même si les dépendances sont indisponibles, sinon K8s tuerait le pod de l'API à chaque hoquet de la base. C'est `/api/ready` qui vérifie les dépendances.

## Backend
Dépendances : express, multer (upload), sharp (dimensions des images), minio (SDK), mongoose ; nodemon en dev.
Scripts : `npm start` (node src/index.js), `npm run dev` (nodemon).

Routes :
- `GET /api/photos` — liste triée par `position`
- `POST /api/photos` — upload (multer), lecture des dimensions (sharp), envoi dans MinIO, création du document
- `DELETE /api/photos/:id`
- `GET /api/photos/:id/file` — proxy du fichier depuis MinIO
- `PATCH /api/photos/order` — (plus tard) nouvel ordre, pas encore écrit
- `GET /api/health` — liveness : répond toujours, ne teste pas les dépendances
- `GET /api/ready` — readiness : vérifie Mongo et le bucket MinIO, 503 sinon
- `GET /api/session` — `{ authentifie }`, interrogée au chargement du front
- `POST /api/session` — connexion, pose le cookie
- `DELETE /api/session` — déconnexion

`POST /api/photos`, `DELETE /api/photos/:id` et le futur `PATCH /api/photos/order` passent par le middleware `exigerAdmin` (401 sinon). `GET /api/photos` et `GET /api/photos/:id/file` restent publics : la galerie se visite sans compte.

`GET /api/photos` accepte `?album=` pour filtrer. L'upload accepte les champs `file` (obligatoire), `titre` et `album` ; sans titre, le nom du fichier est utilisé. Erreurs : 415 si le fichier n'est pas une image, 413 au-delà de 25 Mo (même limite que `client_max_body_size` dans le proxy), 404 sur un identifiant inconnu ou mal formé.

Schéma `Photo` : titre, **album**, objectKey (clé dans MinIO), mimeType, width, height, position, `createdAt`/`updatedAt` (via `timestamps`).

Le champ de regroupement s'appelle `album` et non `collection` : Mongoose réserve ce nom, qui masquerait l'objet Collection de MongoDB sur les documents (il émet un avertissement « may break some functionality »).

`mimeType` est stocké pour que `GET /api/photos/:id/file` renvoie le bon `Content-Type` sans interroger MinIO en plus.

### Authentification
Dépendances : `express-session` + `connect-mongo`. Aucun objet Kubernetes supplémentaire, le magasin de sessions est la base Mongo existante (collection `sessions`), et `connect-mongo` réutilise le client Mongoose déjà connecté (`clientPromise`) plutôt que d'ouvrir un second pool.

Les identifiants ne sont pas en base mais dans trois variables d'environnement, donc dans le Secret : `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`. On stocke une **empreinte scrypt**, jamais le mot de passe : une variable d'environnement se retrouve vite dans un `kubectl describe`, un vidage de crash ou un journal. `cd backend && npm run hash -- "mot de passe"` produit la valeur.

- **L'empreinte utilise `:` comme séparateur, et non `$` comme le veut l'usage PHC.** Une empreinte en `scrypt$16384$…` placée dans un `.env` est mutilée par `docker compose`, qui y lit `$16384` comme une variable à interpoler. Vérifié : quatre avertissements « variable is not set » et une empreinte tronquée.
- Hachage et vérification avec `node:crypto` (`scrypt`, `timingSafeEqual`) : aucune dépendance native à compiler dans l'image Alpine. Une vérification coûte ~32 ms, ce qui freine déjà une attaque par force brute.
- `POST /api/session` vérifie le mot de passe **même quand l'identifiant est faux**, et jette le résultat : sinon un mauvais identifiant répondrait bien plus vite qu'un mauvais mot de passe, ce qui révélerait le bon identifiant. Message d'erreur unique pour la même raison.
- `req.session.regenerate()` à la connexion : un cookie déposé avant la connexion ne doit pas devenir une session authentifiée (fixation de session).
- Limite de tentatives en mémoire (10 échecs par IP, fenêtre glissante de 15 min, `src/auth/limite.js`). En mémoire, donc propre à chaque replica : avec deux pods un attaquant dispose du double d'essais. Compromis assumé, le but étant de casser l'automatisation.
- Cookie `httpOnly`, `sameSite: "lax"` — **c'est ce qui tient lieu de protection CSRF**, le navigateur n'envoyant pas le cookie sur une requête venue d'un autre site. Pas de jeton CSRF, c'est un choix.
- `COOKIE_SECURE` est faux en compose et sur minikube : un cookie `secure` est ignoré sur une origine en HTTP, et la session ne tiendrait jamais. À passer à `true` derrière du TLS.
- `app.set("trust proxy", 1)` dans `index.js` : l'API est toujours derrière un intermédiaire (proxy nginx, Ingress). Sans cette ligne `req.ip` vaudrait l'adresse du proxy pour tout le monde — la limite de tentatives serait globale — et un cookie `secure` ne serait jamais posé.

## Frontend
Échafaudé avec `npm create vite@latest frontend -- --template react` (create-vite 9, template `react` en JavaScript — le `--` est obligatoire pour que npm transmette l'option). Pas de Tailwind, du CSS simple.
Scripts : `npm run dev` (port 5173), `npm run build` (sort dans `dist/`), `npm run preview`, `npm run lint` (oxlint).
`vite.config.js` : proxy `/api` vers `http://localhost:3001` en dev. `nginx.conf` : fallback vers `index.html` (indispensable pour le routage SPA) et cache long sur `/assets/`. Drag & drop futur : dnd-kit.
Dépendance : lenis (défilement lissé).
Composants écrits : Gallery (présentationnel), AlbumNav, AlbumSection, PhotoCard, UploadForm, ChampAlbum, ModaleUpload, ModaleConfirmation, ModaleConnexion, Lightbox et SessionProvider.
Hooks : `usePhotos` (récupération, regroupement en sections, liste à plat, liste des albums, `rafraichir`) appelé par `App` ; `useRevelationAuScroll` (fondu à l'entrée) ; `useDialogue` (ouverture d'un `<dialog>` et mise en pause de Lenis, partagé par les quatre fenêtres) ; `useSession` (contexte d'état de connexion).

**Connexion** : `SessionProvider` enveloppe l'application dans `main.jsx` et interroge `GET /api/session` au chargement. Un contexte plutôt qu'une prop de plus, qui devrait traverser `Gallery` et `AlbumSection` — qui n'en ont aucun usage — pour atteindre `PhotoCard`.
- bouton « Connexion » / « Déconnexion » dans l'en-tête, visible de tous. Rien n'est affiché tant que l'API n'a pas répondu, sinon l'en-tête clignoterait au chargement ;
- déconnecté, ni le bouton « Ajouter des photos » ni les corbeilles ne sont rendus. **Ce n'est qu'un confort : la vraie barrière est `exigerAdmin` côté API** — masquer un bouton n'empêche personne d'envoyer un `DELETE` à la main ;
- les erreurs du client API portent leur `statut` HTTP. Sur un 401, `signalerExpiration()` repasse l'interface en visiteur : une session expirée en cours de visite ne laisse pas des commandes qui échoueraient toutes.

La galerie est découpée en **une section par album**, avec une barre de navigation collée en haut. Les photos sans album vont dans une section « Autres », placée en dernier ; les autres albums sont triés par nom avec un `Intl.Collator("fr")`. Chaque section a son ancre (`#album-<nom-sans-accent>`) et sa propre grille justifiée. Attention : un album nommé littéralement « Autres » fusionnerait avec la section des photos sans album.

**Défilement lissé par Lenis**, monté en `<ReactLenis root>` dans `App.jsx` :
- `anchors: true` est **obligatoire** : Lenis bloque les liens d'ancre par défaut, et sans cette option la barre d'albums ne ferait rien ;
- `syncTouch: true` pour l'inertie au doigt, qui n'est pas activée par défaut ;
- `smoothWheel` et `respectReducedMotion` sont déjà à `true` par défaut, rien à ajouter pour la molette ni pour l'accessibilité ;
- le wrapper React lance seul sa boucle d'animation (`autoRaf` vaut `true` dans ses props), contrairement à ce que suggère l'exemple du README — dont le `update` ne se rappelle jamais ;
- **pas de `scroll-behavior: smooth`** : Lenis repositionne le défilement à chaque image, le lissage natif par-dessus ferait saccader ;
- pas besoin de `anchors: { offset }` : `scrollTo` lit le `scroll-margin-top` calculé de l'élément visé, c'est donc `gallery.css` qui règle le décalage sous la barre. Si un jour tu utilises `offset`, attention au signe : le code fait `target += offset`, donc une valeur positive descend plus bas, contrairement à ce que laisse croire la comparaison du README avec `scroll-padding-top`.

**Formulaire d'upload**, dans une fenêtre `<dialog>` ouverte par un bouton à droite du titre :
- l'élément `<dialog>` natif avec `showModal()` apporte le piège de focus, Échap et l'inertie de l'arrière-plan ; l'événement `close` est branché sur la fermeture, sinon un Échap désynchroniserait l'état React et le bouton ne rouvrirait plus rien ;
- **Lenis et la modale** : `lenis.stop()` à l'ouverture, sinon l'arrière-plan défile derrière la fenêtre, et `data-lenis-prevent` sur le contenu pour que la molette y défile. Effet de bord à connaître : `stop()` passe `html` en `overflow: clip`, d'où le `scrollbar-gutter: stable` dans `index.css` qui évite le décalage du contenu à l'ouverture ;
- `ChampAlbum` est une liste déroulante **éditable** (motif ARIA combobox, écrite à la main : HTML n'a pas de `select` éditable). Elle propose les albums existants, filtre à la saisie sans tenir compte de la casse ni des accents, et crée un album si rien ne correspond. La sélection se fait au `pointerdown` et non au `click`, que la fermeture au clic extérieur devancerait ; Entrée fait un `preventDefault` quand la liste est ouverte, sinon le formulaire serait envoyé ;
- un nom saisi qui correspond à un album existant à la casse ou aux accents près **reprend l'orthographe existante**, sans quoi « paysages » créerait une seconde section à côté de « Paysages » ;
- validation côté client aux mêmes limites que l'API : images seulement, 25 Mo. Les aperçus sont des URL d'objets, libérées au retrait et au démontage.

**Suppression d'une photo** : bouton rond en haut à droite de la vignette, révélé au survol et sur `:focus-within` (sans quoi il serait inatteignable au clavier). Le titre n'est volontairement pas affiché au survol ; il reste dans l'`alt` de l'image pour les lecteurs d'écran. La confirmation se fait dans une `ModaleConfirmation` au premier plan, avec un aperçu de la photo :
- « Annuler » est **avant** « Supprimer » dans le DOM : le `<dialog>` donne le focus au premier élément focalisable, une frappe d'Entrée réflexe ne doit pas effacer une photo ;
- pendant la requête, `onCancel` fait un `preventDefault` pour qu'Échap ne ferme pas la fenêtre : l'action est déjà partie, et l'éventuelle erreur doit pouvoir s'afficher là où elle a été demandée ;
- en cas d'échec la fenêtre reste ouverte avec le message de l'API et la photo reste en place ; en cas de succès `rafraichir` redescend depuis `App`, donc la section disparaît d'elle-même si c'était sa dernière photo.

**Visionneuse plein écran** : un clic sur une photo ouvre `Lightbox`, troisième `<dialog>` de l'application (même `useDialogue`, même portail vers `document.body`).
- elle fait défiler **toute la galerie dans l'ordre d'affichage**, albums compris, et non le seul album cliqué : `usePhotos` expose pour cela une liste à plat à côté des sections. Le défilement boucle, il n'y a donc pas de bout de liste ;
- `App` retient la photo ouverte **par son identifiant** et recalcule le rang : un rafraîchissement de la liste (upload, suppression) décalerait un rang mémorisé ;
- dans la vignette, l'image est enveloppée dans un `<button>` et non munie d'un `onClick` : la visionneuse devient accessible au clavier et le bouton de suppression reste une cible distincte ;
- flèches ← et → en plus des deux boutons, Échap par le `<dialog>`, et un clic hors de l'image ou d'un bouton ferme (`target.closest("img, button")`) ;
- les voisines immédiates sont préchargées (`new Image()`) : les photos étant servies en pleine résolution, chaque flèche laisserait sinon un blanc. C'est un palliatif, pas une réponse au problème des miniatures.

**L'envoi est séquentiel, et ce n'est pas optionnel** : l'API calcule `position` avec un `max + 1`, donc des envois parallèles lisent le même maximum. Vérifié — trois requêtes simultanées donnent les positions [8, 9, 9]. Ne pas « optimiser » en `Promise.all` sans corriger d'abord l'API (compteur atomique ou position calculée à l'insertion). Chaque photo envoyée est retirée du formulaire au fur et à mesure, donc un échec en cours de route ne laisse que les fichiers restants, réessayables sans doublon ; la fenêtre ne se ferme que si tout est passé. `envoyerPhoto` retombe sur le code de statut quand le corps n'est pas du JSON : un 413 vient du proxy nginx et renvoie du HTML.

**Fondu à l'entrée dans la fenêtre** : le hook `useRevelationAuScroll` suit la visibilité d'un élément avec un `IntersectionObserver` et renvoie les classes `fondu` / `fondu--visible`. Il est posé sur **chaque photo et chaque titre d'album**, pas sur la section : portée par la section, l'animation ne jouait qu'au passage de son bord supérieur, donc tout ce qui dépassait du premier écran apparaissait sans effet. L'observateur est **unique pour toute la page** (module partagé, `Map` élément → setter) et non un par vignette : la galerie peut compter des centaines de photos. Le fondu rejoue à chaque passage, l'observation ne s'arrêtant jamais. Seuil à 0 et non un pourcentage de l'élément : un élément plus haut que la fenêtre ne pourrait jamais en afficher 15 % et ne serait jamais révélé. Le `rootMargin: "0px 0px -12% 0px"` rétrécit la zone de détection par le bas, donc il **retarde** la révélation de 12 % de la hauteur de fenêtre (c'est une valeur positive qui l'anticiperait) ; il ne s'applique qu'en bas pour ne pas décaler le masquage par le haut. La transparence laisse voir le fond de page, d'où l'apparition « depuis le blanc » en thème clair — et depuis le noir en thème sombre.

La grille justifiée est obtenue en CSS seul, sans calcul en JavaScript : sur chaque cellule, `flex-basis` et `flex-grow` sont tous deux proportionnels au ratio de la photo, donc flexbox garde la largeur finale proportionnelle au ratio, et `aspect-ratio` en déduit une hauteur identique pour toutes les photos d'une même ligne. Le ratio arrive en variable CSS inline (`--ratio`) depuis les dimensions lues à l'upload. `--espace` et `--hauteur-base`, en haut de `.gallery`, sont les deux seuls réglages ; sur petit écran, seule `--hauteur-base` change. Un remplisseur `.gallery::after` au `flex-grow` énorme absorbe l'espace libre de la dernière ligne, qui garderait sinon une hauteur bien supérieure aux autres.

## Arborescence
```
my-photo-gallery/
├── README.md
├── CLAUDE.md
├── docker-compose.yml
├── .env.example            # identifiants et ports du compose (copier en .env)
├── .gitignore
├── proxy/
│   └── nginx.conf          # / -> front, /api -> API (rôle de l'Ingress en local)
├── frontend/
│   ├── Dockerfile, nginx.conf, .dockerignore, package.json, vite.config.js, index.html
│   └── src/ (main.jsx, App.jsx, api/photos.js, components/, hooks/, styles/)
├── backend/
│   ├── Dockerfile, .dockerignore, package.json, .env.example
│   ├── scripts/hacher-mot-de-passe.js   # npm run hash
│   └── src/ (index.js, config.js, db/mongo.js, storage/minio.js, models/Photo.js,
│            auth/{session,motDePasse,limite}.js, routes/{photos,health,session}.js)
└── k8s/
    ├── kustomization.yaml, namespace.yaml, secrets.example.yaml, configmap.yaml, ingress.yaml
    ├── mongodb/ (statefulset.yaml, service.yaml)
    ├── minio/ (statefulset.yaml, service.yaml)
    ├── backend/ (deployment.yaml, service.yaml)
    └── frontend/ (deployment.yaml, service.yaml)
```

## Ordre de travail
1. ~~Backend et frontend en local (`npm run dev`), avec seulement MongoDB et MinIO dans Docker.~~ (plomberie en place, code applicatif à écrire)
2. ~~Dockerfiles + `docker-compose.yml`.~~ Fait.
3. ~~Manifestes `k8s/` en dernier (traduction du compose), test sur minikube.~~ Fait, déployé et vérifié sur minikube.

## Variables d'environnement
Deux fichiers, non versionnés, dont seuls les `.example` sont commités :
- `.env` à la racine — lu automatiquement par `docker compose` pour les `${VAR}` du compose ;
- `backend/.env` — lu par `npm run dev` via `node --env-file-if-exists=.env` (pas de dépendance `dotenv`).

Ils décrivent les mêmes identifiants vus de deux endroits : dans le compose l'API joint `mongodb` et `minio:9000` par leur nom de service, en dev local elle les joint sur `localhost` via les ports publiés. Toute modification dans l'un doit être répercutée dans l'autre.

Ports publiés sur l'hôte : proxy **8080** (seul point d'entrée de l'app), Mongo **27017**, MinIO **9000** et console **9001**. Le front et l'API ne publient aucun port : ils passent par le proxy.

`ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` et `COOKIE_SECURE` s'ajoutent aux deux fichiers. Changer `SESSION_SECRET` invalide toutes les sessions ouvertes.

Piège : MongoDB ne crée son utilisateur root qu'au premier démarrage, quand le volume est vide. Changer `MONGO_USER`/`MONGO_PASSWORD` ensuite exige un `docker compose down -v`. MinIO, lui, relit ses identifiants à chaque démarrage.

## État actuel
Conteneurisation et backend fonctionnels, vérifiés de bout en bout : upload d'une image, lecture des dimensions, stockage dans MinIO, liste triée par position, filtre par album, proxy du fichier (octet pour octet identique à l'original), suppression du document et de l'objet.

Reste à faire :
- **Frontend** — rien de bloquant : formulaire d'upload, suppression et visionneuse sont faits. Pas de champ titre : l'API retient le nom du fichier, ce qui suffit pour un envoi groupé.
- **Performance du défilement** — deux réglages identifiés mais pas encore appliqués, faute d'avoir pu juger à l'écran : le `backdrop-filter: blur(8px)` de `.album-nav` est le premier suspect de saccades (sur un élément collé, le flou est recalculé à chaque image, et Lenis repositionne à chaque image), et `lerp` laissé à 0,1 donne une sensation de flottement qu'un passage à 0,15–0,2 atténuerait.
- **Miniatures** — les images sont servies en pleine résolution, 4 à 7 fois plus grandes que leur taille d'affichage. Sans conséquence sur des images de test légères, mais ce sera la cause dominante de saccades avec de vraies photos : c'est l'argument pour avancer le worker `sharp`.
- **Backend** — `PATCH /api/photos/order` (réordonnancement), prévu plus tard.
- **`k8s/`** — écrit et déployé. Reste à documenter le déploiement dans le `README.md` (c'est une exigence du TP).

## Kubernetes

12 objets dans `galerie-photo`, assemblés par Kustomize (`kubectl apply -k k8s/`). Déployé et vérifié sur minikube v1.39 / Kubernetes v1.37.

### Comment les images arrivent dans minikube
Question tranchée : **construction sur le démon Docker de l'hôte, puis `minikube image load`**, avec `imagePullPolicy: Never` dans les deux Deployments.

La voie « construire directement dans le démon de minikube » (`eval $(minikube docker-env)`) est inutilisable : minikube v1.39 tourne avec le **runtime containerd**, et sa couche de compatibilité avec l'API Docker ne sait pas démarrer BuildKit — `docker compose build` échoue sur `failed to inspect pulled image moby/buildkit:buildx-stable-1: 404 page not found`. Ne pas y revenir sans repasser le cluster en `--container-runtime=docker`, ce qui l'obligerait à utiliser `cri-dockerd`, un adaptateur que les vrais clusters n'emploient plus.

Le chargement coûte 11 s pour l'API (216 Mo) et 5 s pour le front (69 Mo). Après chaque reconstruction il faut recharger **puis** relancer les pods (`kubectl rollout restart deployment/backend`) : le tag ne changeant pas, Kubernetes ne voit aucune raison de recréer quoi que ce soit.

```
docker compose build
docker tag my-photo-gallery-backend:latest  galerie-backend:1.0
docker tag my-photo-gallery-frontend:latest galerie-frontend:1.0
minikube image load galerie-backend:1.0
minikube image load galerie-frontend:1.0
```

### L'image de MinIO vient d'un miroir sur ghcr.io
**MinIO ne distribue plus son image communautaire en accès anonyme.** Docker Hub *et* quay.io répondent `insufficient_scope: authorization failed`, sur le tag comme sur le digest (vérifié les 2026-11-12 et 2026-11-15, `minio/minio:latest` compris), alors que `mongo:8` et `nginx:alpine` répondent 200 par le même chemin au même moment — ce n'est donc pas un problème de réseau.

Conséquence : le déploiement ne pouvait pas fonctionner sur une machine neuve, puisque l'image ne venait que du cache Docker local, d'un `docker pull` antérieur à la restriction. Et c'est l'exigence centrale du TP qui en dépendait.

Corrigé en republiant cette image en cache sur **`ghcr.io/nathan-roi/minio:RELEASE.2025-09-07T16-13-09Z`**, en public. C'est l'image officielle telle quelle, sans modification. Le manifeste pointe dessus et **n'a donc pas d'`imagePullPolicy: Never`**, contrairement aux deux images du projet.

Écartées en chemin : compiler MinIO depuis ses sources (faisable — le dépôt GitHub est public et le tag existe — mais c'est un gros projet Go, plusieurs minutes de compilation et un risque de débogage du système de construction d'autrui), et remplacer MinIO par SeaweedFS ou Zenko CloudServer (images disponibles, API S3, mais c'est un changement d'infrastructure à retester entièrement).

`mongo:8` et `busybox:1.37` se téléchargent normalement, il n'y a rien à faire pour eux.

### Ordre de démarrage : initContainer, pas CrashLoopBackOff
L'API sort en erreur si MongoDB ou MinIO sont injoignables au démarrage (choix volontaire, cf. `index.js`). Un `initContainer` busybox attend donc l'ouverture du port 27017 puis `/minio/health/live` avant de lancer le conteneur de l'API.

busybox et non l'image `mongo` : 4 Mo au lieu de 800 Mo, et un simple test d'ouverture de port suffit puisque MongoDB n'écoute sur 27017 qu'**après** avoir créé son utilisateur root.

Vérifié dans les pires conditions : pendant les 6 minutes où MinIO était en `ImagePullBackOff`, les deux pods de l'API sont restés en `Init:0/1` avec **0 redémarrage**, puis ont démarré en 6 s. Sans l'initContainer, c'eût été six minutes de `CrashLoopBackOff` — ce qui converge, mais ressemble à une panne.

### `MONGO_URL` est composée dans le Deployment
Le Secret ne contient que `MONGO_USER` et `MONGO_PASSWORD` ; l'URL est assemblée dans le manifeste, pour que le mot de passe n'existe qu'à un seul endroit.

**Piège : l'expansion `$(VAR)` ne voit que les variables déclarées plus haut dans le même bloc `env`, jamais celles venues d'un `envFrom`.** D'où les trois redéclarations apparemment redondantes de `MONGO_USER`, `MONGO_PASSWORD` et `MONGO_DB` dans `k8s/backend/deployment.yaml`. Attention aussi : un mot de passe contenant `@ : / ? #` devrait être encodé en pourcent.

### Ce que l'Ingress doit reprendre du proxy nginx
Les trois annotations de `k8s/ingress.yaml` traduisent la configuration du service `proxy` du compose. La première n'est pas optionnelle :
- `proxy-body-size: 25m` — ingress-nginx limite les corps à **1 Mo** par défaut, l'upload d'une photo serait refusé en 413. Vérifié : un corps de 2 Mo passe (401 de l'API, pas 413 de l'Ingress), un corps de 30 Mo est bien refusé en 413.
- `proxy-buffering: "off"` et `proxy-read-timeout: "300"` — pour `GET /api/photos/:id/file`, qui renvoie l'image en entier.

Et **pas de `rewrite-target`** : l'API attend `/api/photos`, préfixe compris. ingress-nginx choisit la règle au préfixe le plus long, donc `/api` l'emporte sur `/` sans qu'il y ait d'ordre à respecter dans le fichier.

### `preStop` : le rolling update n'est pas sans coupure sans lui
Le retrait d'un pod de la liste des Endpoints et l'envoi du SIGTERM partent **en parallèle** : ingress-nginx peut router une requête vers un pod qui vient de fermer son écoute. Mesuré — **1 échec (connexion refusée) sur 521 requêtes** pendant un rolling update, malgré `maxUnavailable: 0` et l'arrêt propre du serveur.

Un `lifecycle.preStop.sleep` de 5 s sur les deux Deployments décale le SIGTERM le temps que le retrait se propage. Après correction : **1916 requêtes sur deux rolling updates complets, 0 échec.** Ce délai est compté dans `terminationGracePeriodSeconds`, qui doit donc rester plus grand (30 s ici).

`lifecycle.preStop.sleep` plutôt qu'un `exec: ["sleep", "5"]` : pas de dépendance à la présence d'un shell dans l'image.

### `drop: ["ALL"]` casse l'image nginx officielle
Le front bouclait en `CrashLoopBackOff` sur :

```
[emerg] chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)
```

Le processus maître de nginx tourne bien en root, mais root **sans `CAP_CHOWN`** ne peut pas changer le propriétaire de ses répertoires de cache, et sans `CAP_NET_BIND_SERVICE` il ne peut pas écouter sur un port inférieur à 1024. D'où la liste blanche explicite dans `k8s/frontend/deployment.yaml` : `drop: ["ALL"]` puis `add: ["CHOWN", "SETGID", "SETUID", "NET_BIND_SERVICE"]`.

L'API, elle, supporte `drop: ["ALL"]` **et** `readOnlyRootFilesystem: true` — uniquement parce que multer est en `memoryStorage` et qu'elle n'écrit jamais sur disque.

### Détails qui ont leur raison
- **Le Secret réel n'est pas versionné**, mais `kustomization.yaml` référence bien `secret.yaml`. Conséquence voulue : sans `cp k8s/secrets.example.yaml k8s/secret.yaml`, `kubectl apply -k k8s/` échoue d'emblée — préférable à un déploiement avec des identifiants d'exemple.
- **Service headless pour MongoDB** (`clusterIP: None`), ClusterIP ordinaire pour MinIO : le StatefulSet de Mongo suit le motif standard, MinIO n'a qu'une instance et personne n'a besoin de joindre un pod nommément. Il faudrait le passer en headless pour un MinIO distribué.
- **MinIO épinglé à sa version réelle** (`RELEASE.2025-09-07T16-13-09Z`, le label `release` de l'image) et non `latest` : avec le tag `latest`, Kubernetes repasse en `imagePullPolicy: Always`. Le tag du miroir reprend celui de l'image officielle, pour que le manifeste dise ce qui tourne.
- **`labels:` avec `includeSelectors: false`** dans `kustomization.yaml` : un label ajouté aux selectors des Deployments les rendrait impossibles à modifier ensuite, les selectors étant immuables.
- **Les PVC survivent à `kubectl delete -k k8s/`** : le `volumeClaimTemplates` d'un StatefulSet ne supprime pas ses PVC. Vérifié — un document témoin écrit dans Mongo, le pod `mongodb-0` supprimé, le document toujours là après recréation. Pour repartir de zéro : `kubectl delete pvc -n galerie-photo --all`.
- **Trois sondes sur l'API**, et c'est pour elles que `/api/health` et `/api/ready` sont distincts : `startupProbe` sur `health` (60 s de marge), `livenessProbe` sur `health` (ne teste pas Mongo, sinon un hoquet de la base redémarrerait tous les pods), `readinessProbe` sur `ready` (retire le pod du Service sans le tuer).
- **La console MinIO (9001) est dans le Service mais pas dans l'Ingress** : `kubectl port-forward svc/minio 9001:9001` pour le diagnostic.
- Le VPN Cisco (`cscotun0`) supprime les routes des ponts Docker, **y compris celle de minikube** (192.168.49.0/24) : `kubectl` expire alors sans message utile. À couper avant de travailler sur le cluster.

### Accès depuis le navigateur
```
echo "$(minikube ip) galerie.local" | sudo tee -a /etc/hosts
```
Puis `http://galerie.local`. Filet de secours si l'Ingress fait des siennes : `kubectl -n galerie-photo port-forward svc/frontend 8080:80`.

`COOKIE_SECURE` reste à `false` : l'Ingress de minikube sert en HTTP, et un cookie `secure` y serait tout simplement ignoré par le navigateur — la session ne tiendrait jamais.

### Pièges rencontrés, à ne pas réintroduire
- Le Dockerfile du backend utilise `CMD ["node", "src/index.js"]` et non `npm start` : avec npm, c'est npm qui est PID 1 et qui reçoit le SIGTERM, et l'arrêt propre ne se déclenche pas.
- `server.close()` ignore les connexions keep-alive inactives, dont celles des sondes de santé. Sans `server.closeIdleConnections()`, l'arrêt traînait 30 s jusqu'au SIGKILL au lieu de 1 s.
- Pas de `process.exit()` après un `console.log` : la sortie forcée tronque les écritures stdout encore en attente.
- `ensureBucket()` avale `BucketAlreadyOwnedByYou` : avec plusieurs replicas, les pods créent le bucket en même temps au démarrage. Vérifié avec 3 instances lancées simultanément, bucket absent.

## Conventions
- Échanger en français.
- Ne jamais versionner de vrais secrets ni `node_modules`.
