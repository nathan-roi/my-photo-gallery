import { useEffect, useState } from "react";

import { listerPhotos } from "../api/photos.js";
import PhotoCard from "./PhotoCard.jsx";
import "../styles/gallery.css";

export default function Gallery() {
  const [photos, setPhotos] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    // En mode strict, React joue l'effet deux fois en développement : ce drapeau
    // évite qu'une réponse arrivée après le démontage mette à jour l'état.
    let annule = false;

    listerPhotos()
      .then((resultat) => {
        if (annule) return;
        setPhotos(resultat);
        console.log(
          resultat.length === 0
            ? "Galerie vide : aucune photo dans l'API pour l'instant."
            : `${resultat.length} photo(s) récupérée(s) depuis l'API.`,
        );
      })
      .catch((err) => {
        if (annule) return;
        setErreur(err.message);
        console.error("Récupération des photos impossible :", err);
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });

    return () => {
      annule = true;
    };
  }, []);

  if (chargement) {
    return <p className="gallery-message">Chargement…</p>;
  }

  if (erreur) {
    return <p className="gallery-message gallery-message--erreur">{erreur}</p>;
  }

  if (photos.length === 0) {
    return <p className="gallery-message">Aucune photo pour l'instant.</p>;
  }

  return (
    <div className="gallery">
      {photos.map((photo) => (
        <PhotoCard key={photo._id} photo={photo} />
      ))}
    </div>
  );
}
