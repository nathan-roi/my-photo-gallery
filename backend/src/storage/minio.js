import { Client } from "minio";

import { config } from "../config.js";

export const minio = new Client(config.minio);

export const bucket = config.bucket;

export async function ensureBucket() {
  if (await minio.bucketExists(bucket)) {
    return;
  }

  try {
    await minio.makeBucket(bucket);
    console.log(`Bucket MinIO "${bucket}" créé`);
  } catch (err) {
    // Avec plusieurs replicas, deux instances de l'API peuvent créer le bucket
    // en même temps au démarrage : la perdante reçoit cette erreur, qui n'en
    // est pas une. La propager ferait échouer un pod sur deux au déploiement.
    if (
      err.code !== "BucketAlreadyOwnedByYou" &&
      err.code !== "BucketAlreadyExists"
    ) {
      throw err;
    }
    console.log(`Bucket MinIO "${bucket}" déjà créé par une autre instance`);
  }
}
