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
};

// Toutes les variables manquantes sont signalées d'un coup, pas une par une.
if (missing.length > 0) {
  throw new Error(
    `Variables d'environnement manquantes : ${missing.join(", ")}`,
  );
}
