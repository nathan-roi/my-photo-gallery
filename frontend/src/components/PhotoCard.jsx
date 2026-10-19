import { urlFichier } from "../api/photos.js";

export default function PhotoCard({ photo }) {
  return (
    <figure
      className="photo-card"
      // Les dimensions enregistrées à l'upload servent dès maintenant : la
      // cellule prend le bon format avant même que l'image soit chargée, donc
      // la grille ne sursaute pas pendant le chargement.
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
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
