import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { urlFichier } from "../api/photos.js";
import useDialogue from "../hooks/useDialogue.js";
import "../styles/lightbox.css";

// Chevron dessiné en SVG : aucune icône de flèche n'est fournie dans assets/,
// et un tracé vectoriel reste net à toutes les tailles. `currentColor` le fait
// suivre la couleur du bouton, comme les icônes en masque.
function Chevron({ vers }) {
  return (
    <svg
      className={`lightbox-chevron lightbox-chevron--${vers}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M15 4 L7 12 L15 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Visionneuse plein écran. Montée seulement quand une photo est ouverte, d'où
 * le `true` passé à useDialogue et l'index initial pris en état : chaque
 * ouverture repart de la photo cliquée.
 *
 * Rendue dans `document.body` par un portail, comme ModaleConfirmation : un
 * <dialog> est hissé dans la couche supérieure à l'affichage mais reste
 * descendant de son parent dans le DOM, donc les sélecteurs de la galerie
 * l'atteindraient.
 */
export default function Lightbox({ photos, indexInitial, onFermer }) {
  const dialogue = useDialogue(true);
  const [index, setIndex] = useState(indexInitial);

  const photo = photos[index];
  const seule = photos.length < 2;

  function aller(pas) {
    // Modulo avec un tour complet ajouté : le pas peut être négatif, et le
    // reste d'un négatif l'est aussi en JavaScript.
    setIndex((courant) => (courant + pas + photos.length) % photos.length);
  }

  // Les voisines sont chargées d'avance : les photos sont servies en pleine
  // résolution, sans quoi chaque flèche laisserait un blanc le temps du
  // téléchargement.
  useEffect(() => {
    if (photos.length < 2) return;

    for (const pas of [-1, 1]) {
      const voisine = photos[(index + pas + photos.length) % photos.length];
      const prechargement = new Image();
      prechargement.src = urlFichier(voisine);
    }
  }, [index, photos]);

  // La photo a pu disparaître entre-temps (suppression, rafraîchissement).
  if (!photo) return null;

  return createPortal(
    <dialog
      ref={dialogue}
      className="lightbox"
      aria-label={`Photo ${index + 1} sur ${photos.length}`}
      onClose={onFermer}
      onKeyDown={(evenement) => {
        if (seule) return;

        if (evenement.key === "ArrowRight") {
          evenement.preventDefault();
          aller(1);
        } else if (evenement.key === "ArrowLeft") {
          evenement.preventDefault();
          aller(-1);
        }
      }}
      // Tout clic qui ne tombe ni sur l'image ni sur un bouton ferme : la
      // marge autour de la photo joue le rôle du fond, que l'on ne peut pas
      // viser directement puisque la scène la recouvre.
      onClick={(evenement) => {
        if (!evenement.target.closest("img, button")) onFermer();
      }}
    >
      <div className="lightbox-scene">
        <img
          className="lightbox-image"
          src={urlFichier(photo)}
          alt={photo.titre}
          width={photo.width}
          height={photo.height}
        />
      </div>

      <button
        type="button"
        className="lightbox-fermer"
        onClick={onFermer}
        aria-label="Fermer"
      >
        <span className="icone-croix" aria-hidden="true" />
      </button>

      {!seule && (
        <>
          <button
            type="button"
            className="lightbox-navigation lightbox-navigation--precedent"
            onClick={() => aller(-1)}
            aria-label="Photo précédente"
          >
            <Chevron vers="precedent" />
          </button>

          <button
            type="button"
            className="lightbox-navigation lightbox-navigation--suivant"
            onClick={() => aller(1)}
            aria-label="Photo suivante"
          >
            <Chevron vers="suivant" />
          </button>
        </>
      )}

      <p className="lightbox-legende">
        <span className="lightbox-titre">{photo.titre}</span>
        {!seule && (
          <span className="lightbox-compteur">
            {index + 1} / {photos.length}
          </span>
        )}
      </p>
    </dialog>,
    document.body,
  );
}
