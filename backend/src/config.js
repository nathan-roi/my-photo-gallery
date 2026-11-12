// Lecture et validation des variables d'environnement, une seule fois au
// démarrage : mieux vaut un échec immédiat et explicite qu'une erreur obscure
// à la première requête.

const missing = [];

function required(name) {
  const value = process.env[name];
  if (!value) {
    missing.push(name);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  mongoUrl: required("MONGO_URL"),
  minio: {
    endPoint: required("MINIO_ENDPOINT"),
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: required("MINIO_ACCESS_KEY"),
    secretKey: required("MINIO_SECRET_KEY"),
  },
  bucket: required("MINIO_BUCKET"),
  adminUser: required("ADMIN_USER"),
  // Une empreinte, jamais le mot de passe en clair : une variable
  // d'environnement se retrouve vite dans un `kubectl describe`, un vidage de
  // crash ou un journal. `npm run hash` produit la valeur à coller.
  adminPasswordHash: required("ADMIN_PASSWORD_HASH"),
  sessionSecret: required("SESSION_SECRET"),
  // Un cookie `secure` est ignoré sur une origine en HTTP : il faut donc
  // pouvoir le désactiver en compose et sur minikube.
  cookieSecure: process.env.COOKIE_SECURE === "true",
};

// Toutes les variables manquantes sont signalées d'un coup, pas une par une.
if (missing.length > 0) {
  throw new Error(
    `Variables d'environnement manquantes : ${missing.join(", ")}`,
  );
}
