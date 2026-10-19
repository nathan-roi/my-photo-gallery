import { Router } from "express";
import mongoose from "mongoose";

import { bucket, minio } from "../storage/minio.js";

const router = Router();

// Liveness : le processus répond-il ? Ne teste surtout pas les dépendances —
// sinon un hoquet de MongoDB ferait redémarrer le pod au lieu de le retirer
// temporairement du service.
router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Readiness : l'API peut-elle réellement servir des requêtes ? Un échec ici
// sort le pod du Service sans le tuer, le temps que les dépendances reviennent.
router.get("/ready", async (req, res) => {
  const checks = { mongo: mongoose.connection.readyState === 1, minio: false };

  try {
    checks.minio = await minio.bucketExists(bucket);
  } catch {
    checks.minio = false;
  }

  const pret = Object.values(checks).every(Boolean);
  res.status(pret ? 200 : 503).json({ status: pret ? "ready" : "not ready", checks });
});

export default router;
