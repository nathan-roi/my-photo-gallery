import { useState } from "react";

import { supprimerPhoto, urlFichier } from "../api/photos.js";
import {
  classesFondu,
  useRevelationAuScroll,
} from "../hooks/useRevelationAuScroll.js";
import ModaleConfirmation from "./ModaleConfirmation.jsx";

export default function PhotoCard({ photo, onSupprimee, onOuvrir }) {
  const [demande, setDemande] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [carte, visible] = useRevelationAuScroll();

  async function supprimer() {
    setSuppression(true);
    setErreur(null);

    try {
      await supprimerPhoto(photo._id);
      // La photo disparaît du rendu au rafraîchissement du parent : inutile de
      // remettre les états locaux à zéro, le composant sera démonté.
      onSupprimee();
    } catch (err) {
      // La fenêtre reste ouverte sur le message : l'échec se lit à l'endroit
      // où l'action a été demandée.
      setErreur(err.message);
      setSuppression(false);
      console.error("Suppression impossible :", err);
    }
  }

  function annuler() {
    setDemande(false);
    setErreur(null);
  }

  return (
    <figure
      ref={carte}
      className={`photo-card ${classesFondu(visible)}`}
      // Les dimensions enregistrées à l'upload pilotent toute la mise en page
      // justifiée (voir styles/gallery.css). La cellule a donc le bon format
      // avant même que l'image soit chargée.
      style={{ "--ratio": photo.width / photo.height }}
    >
      {/* Un vrai <button> et non un gestionnaire sur l'image : la visionneuse
          devient ainsi accessible au clavier, et le bouton de suppression
          reste une cible distincte. */}
      <button
        type="button"
        className="photo-ouvrir"
        onClick={onOuvrir}
        aria-label={`Agrandir ${photo.titre}`}
      >
        <img
          src={urlFichier(photo)}
          alt={photo.titre}
          width={photo.width}
          height={photo.height}
          loading="lazy"
        />
      </button>

      <button
        type="button"
        className="photo-supprimer"
        onClick={() => setDemande(true)}
        aria-label={`Supprimer ${photo.titre}`}
      >
        {/* Le masque est sur ce <span> et non sur le bouton : porté par le
            bouton, il découperait aussi la pastille ronde et son fond sombre
            disparaîtrait. */}
        <span className="icone-corbeille" aria-hidden="true" />
      </button>

      {demande && (
        <ModaleConfirmation
          titre="Supprimer cette photo ?"
          message="Le fichier et ses informations seront effacés définitivement."
          occupe={suppression}
          erreur={erreur}
          onConfirmer={supprimer}
          onAnnuler={annuler}
        >
          <img
            className="confirmation-apercu"
            src={urlFichier(photo)}
            alt={photo.titre}
            width={photo.width}
            height={photo.height}
          />
        </ModaleConfirmation>
      )}
    </figure>
  );
}
