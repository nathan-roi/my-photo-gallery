import crypto from "node:crypto";
import path from "node:path";

import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import sharp from "sharp";

import { Photo } from "../models/Photo.js";
import { bucket, minio } from "../storage/minio.js";

// Même limite que client_max_body_size dans proxy/nginx.conf : inutile que
// l'API accepte ce que le proxy refuse déjà.
const TAILLE_MAX = 25 * 1024 * 1024;

const upload = multer({
  // En mémoire : le fichier part directement dans MinIO, l'API n'écrit jamais
  // sur disque et reste donc sans état.
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    // Le code permet au gestionnaire d'erreurs de répondre 415 plutôt que 500 :
    // un mauvais type de fichier est une erreur du client, pas du serveur.
    cb(
      Object.assign(new Error("Seules les images sont acceptées"), {
        code: "TYPE_NON_SUPPORTE",
      }),
    );
  },
});

const router = Router();

// Un identifiant mal formé est un 404, pas une erreur serveur : sans ce
// garde-fou, Mongoose lèverait une CastError.
function trouverParId(id) {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }
  return Photo.findById(id);
}

router.get("/photos", async (req, res) => {
  const filtre = req.query.album ? { album: req.query.album } : {};
  const photos = await Photo.find(filtre).sort({ position: 1 });
  res.json(photos);
});

router.post("/photos", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Champ `file` manquant" });
    return;
  }

  const { width, height } = await sharp(req.file.buffer).metadata();
  if (!width || !height) {
    res.status(400).json({ error: "Image illisible" });
    return;
  }

  const extension = path.extname(req.file.originalname).toLowerCase();
  const objectKey = `${crypto.randomUUID()}${extension}`;

  await minio.putObject(bucket, objectKey, req.file.buffer, req.file.size, {
    "Content-Type": req.file.mimetype,
  });

  // La photo arrive en fin de galerie.
  const derniere = await Photo.findOne().sort({ position: -1 }).select("position");
  const position = (derniere?.position ?? -1) + 1;

  try {
    const photo = await Photo.create({
      titre: req.body.titre?.trim() || req.file.originalname,
      album: req.body.album?.trim() || "",
      objectKey,
      mimeType: req.file.mimetype,
      width,
      height,
      position,
    });
    res.status(201).json(photo);
  } catch (err) {
    // Le fichier est déjà dans MinIO : sans ce rattrapage, un échec en base
    // laisserait un objet que plus rien ne référence.
    await minio.removeObject(bucket, objectKey).catch(() => {});
    throw err;
  }
});

router.get("/photos/:id/file", async (req, res) => {
  const photo = await trouverParId(req.params.id);
  if (!photo) {
    res.status(404).json({ error: "Photo inconnue" });
    return;
  }

  const flux = await minio.getObject(bucket, photo.objectKey);

  res.set("Content-Type", photo.mimeType);
  // Le fichier d'une photo ne change jamais : il n'existe pas de route de
  // remplacement, un nouvel upload crée un nouvel identifiant.
  res.set("Cache-Control", "public, max-age=31536000, immutable");

  flux.on("error", (err) => {
    console.error("Lecture MinIO impossible :", err.message);
    res.destroy();
  });
  flux.pipe(res);
});

router.delete("/photos/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "Photo inconnue" });
    return;
  }

  const photo = await Photo.findByIdAndDelete(req.params.id);
  if (!photo) {
    res.status(404).json({ error: "Photo inconnue" });
    return;
  }

  // Le document part avant le fichier : si cette suppression échoue, il reste
  // un objet orphelin dans MinIO plutôt qu'une photo fantôme dans la galerie.
  await minio.removeObject(bucket, photo.objectKey);

  res.status(204).end();
});

export default router;
