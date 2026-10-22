import { urlFichier } from "../api/photos.js";

export default function PhotoCard({ photo }) {
  return (
    <figure
      className="photo-card"
      // Le ratio, calculé depuis les dimensions enregistrées à l'upload, pilote
      // toute la mise en page justifiée (voir styles/gallery.css). La cellule a
      // donc le bon format avant même que l'image soit chargée.
      style={{ "--ratio": photo.width / photo.height }}
    >
      <img
        src={urlFichier(photo)}
        alt={photo.titre}
        width={photo.width}
        height={photo.height}
        loading="lazy"
      />
      <figcaption>{photo.titre}</figcaption>
    </figure>
  );
}
