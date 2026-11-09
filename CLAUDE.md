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
- **Authentification (décidée, pas encore écrite)** : lecture publique, écriture (ajout et suppression) réservée au propriétaire du site. Session stockée en base (`connect-mongo`) et non en mémoire, l'API ayant plusieurs replicas : un pod ne doit pas ignorer la session ouverte sur un autre. Pas de champ `owner` sur les photos — il n'y a qu'un seul auteur, donc rien à migrer le jour où l'authentification arrive. Tant qu'elle n'existe pas, `POST` et `DELETE /api/photos` sont ouverts et le bouton de suppression est visible par tout visiteur : **ne pas exposer l'application publiquement dans cet état**.
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

`GET /api/photos` accepte `?album=` pour filtrer. L'upload accepte les champs `file` (obligatoire), `titre` et `album` ; sans titre, le nom du fichier est utilisé. Erreurs : 415 si le fichier n'est pas une image, 413 au-delà de 25 Mo (même limite que `client_max_body_size` dans le proxy), 404 sur un identifiant inconnu ou mal formé.

Schéma `Photo` : titre, **album**, objectKey (clé dans MinIO), mimeType, width, height, position, `createdAt`/`updatedAt` (via `timestamps`).

Le champ de regroupement s'appelle `album` et non `collection` : Mongoose réserve ce nom, qui masquerait l'objet Collection de MongoDB sur les documents (il émet un avertissement « may break some functionality »).

`mimeType` est stocké pour que `GET /api/photos/:id/file` renvoie le bon `Content-Type` sans interroger MinIO en plus.

## Frontend
Échafaudé avec `npm create vite@latest frontend -- --template react` (create-vite 9, template `react` en JavaScript — le `--` est obligatoire pour que npm transmette l'option). Pas de Tailwind, du CSS simple.
Scripts : `npm run dev` (port 5173), `npm run build` (sort dans `dist/`), `npm run preview`, `npm run lint` (oxlint).
`vite.config.js` : proxy `/api` vers `http://localhost:3001` en dev. `nginx.conf` : fallback vers `index.html` (indispensable pour le routage SPA) et cache long sur `/assets/`. Drag & drop futur : dnd-kit.
Dépendance : lenis (défilement lissé).
Composants écrits : Gallery (présentationnel), AlbumNav, AlbumSection, PhotoCard, UploadForm, ChampAlbum, ModaleUpload et ModaleConfirmation. Reste Lightbox.
Hooks : `usePhotos` (récupération, regroupement en sections, liste des albums, `rafraichir`) appelé par `App` ; `useRevelationAuScroll` (fondu à l'entrée) ; `useDialogue` (ouverture d'un `<dialog>` et mise en pause de Lenis, partagé par les deux modales).

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
│   └── src/ (index.js, config.js, db/mongo.js, storage/minio.js, models/Photo.js, routes/photos.js, routes/health.js)
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
3. Manifestes `k8s/` en dernier (traduction du compose), test sur minikube.

## Variables d'environnement
Deux fichiers, non versionnés, dont seuls les `.example` sont commités :
- `.env` à la racine — lu automatiquement par `docker compose` pour les `${VAR}` du compose ;
- `backend/.env` — lu par `npm run dev` via `node --env-file-if-exists=.env` (pas de dépendance `dotenv`).

Ils décrivent les mêmes identifiants vus de deux endroits : dans le compose l'API joint `mongodb` et `minio:9000` par leur nom de service, en dev local elle les joint sur `localhost` via les ports publiés. Toute modification dans l'un doit être répercutée dans l'autre.

Ports publiés sur l'hôte : proxy **8080** (seul point d'entrée de l'app), Mongo **27017**, MinIO **9000** et console **9001**. Le front et l'API ne publient aucun port : ils passent par le proxy.

Piège : MongoDB ne crée son utilisateur root qu'au premier démarrage, quand le volume est vide. Changer `MONGO_USER`/`MONGO_PASSWORD` ensuite exige un `docker compose down -v`. MinIO, lui, relit ses identifiants à chaque démarrage.

## État actuel
Conteneurisation et backend fonctionnels, vérifiés de bout en bout : upload d'une image, lecture des dimensions, stockage dans MinIO, liste triée par position, filtre par album, proxy du fichier (octet pour octet identique à l'original), suppression du document et de l'objet.

Reste à faire :
- **Frontend** — `Lightbox`. Le formulaire d'upload et la suppression sont faits. Pas de champ titre : l'API retient le nom du fichier, ce qui suffit pour un envoi groupé.
- **Performance du défilement** — deux réglages identifiés mais pas encore appliqués, faute d'avoir pu juger à l'écran : le `backdrop-filter: blur(8px)` de `.album-nav` est le premier suspect de saccades (sur un élément collé, le flou est recalculé à chaque image, et Lenis repositionne à chaque image), et `lerp` laissé à 0,1 donne une sensation de flottement qu'un passage à 0,15–0,2 atténuerait.
- **Miniatures** — les images sont servies en pleine résolution, 4 à 7 fois plus grandes que leur taille d'affichage. Sans conséquence sur des images de test légères, mais ce sera la cause dominante de saccades avec de vraies photos : c'est l'argument pour avancer le worker `sharp`.
- **Backend** — `PATCH /api/photos/order` (réordonnancement), prévu plus tard.
- **Authentification** — à écrire après les manifestes (voir les choix de conception).
- **`k8s/`** — dossier vide, c'est la partie évaluée. À décider avant de commencer : comment les images arrivent dans minikube (construire dans son démon via `eval $(minikube docker-env)` et `imagePullPolicy: Never`, ou passer par un registre).

### Pièges rencontrés, à ne pas réintroduire
- Le Dockerfile du backend utilise `CMD ["node", "src/index.js"]` et non `npm start` : avec npm, c'est npm qui est PID 1 et qui reçoit le SIGTERM, et l'arrêt propre ne se déclenche pas.
- `server.close()` ignore les connexions keep-alive inactives, dont celles des sondes de santé. Sans `server.closeIdleConnections()`, l'arrêt traînait 30 s jusqu'au SIGKILL au lieu de 1 s.
- Pas de `process.exit()` après un `console.log` : la sortie forcée tronque les écritures stdout encore en attente.
- `ensureBucket()` avale `BucketAlreadyOwnedByYou` : avec plusieurs replicas, les pods créent le bucket en même temps au démarrage. Vérifié avec 3 instances lancées simultanément, bucket absent.

## Conventions
- Échanger en français.
- Ne jamais versionner de vrais secrets ni `node_modules`.
