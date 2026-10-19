import mongoose from "mongoose";

const photoSchema = new mongoose.Schema(
  {
    titre: { type: String, required: true, trim: true },
    album: { type: String, trim: true, default: "", index: true },

    // Clé de l'objet dans MinIO, indépendante du titre et de l'album pour que
    // renommer une photo n'implique pas de déplacer le fichier.
    objectKey: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },

    // Lues à l'upload avec sharp : le front en a besoin pour calculer la grille
    // justifiée sans attendre le chargement des images.
    width: { type: Number, required: true },
    height: { type: Number, required: true },

    position: { type: Number, required: true, index: true },
  },
  { timestamps: true },
);

export const Photo = mongoose.model("Photo", photoSchema);
