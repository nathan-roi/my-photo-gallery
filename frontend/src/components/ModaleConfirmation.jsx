import { useId } from "react";
import { createPortal } from "react-dom";

import useDialogue from "../hooks/useDialogue.js";
import "../styles/modale.css";

/**
 * Fenêtre de confirmation pour une action irréversible. Le parent la monte au
 * moment où il la veut, d'où le `true` passé au hook : elle est ouverte dès son
 * apparition dans l'arbre.
 *
 * Rendue dans `document.body` par un portail : le <dialog> est bien hissé dans
 * la couche supérieure à l'affichage, mais il reste descendant de son parent
 * dans le DOM, donc les sélecteurs de ce parent continuent de l'atteindre.
 * Depuis une vignette, `.photo-card img` écrasait ainsi l'aperçu, étant plus
 * spécifique que `.confirmation-apercu`.
 */
export default function ModaleConfirmation({
  titre,
  message,
  libelleConfirmer = "Supprimer",
  occupe = false,
  erreur = null,
  onConfirmer,
  onAnnuler,
  children,
}) {
  const dialogue = useDialogue(true);
  const idTitre = useId();

  function annuler() {
    // Pendant l'action en cours, il n'y a plus de retour en arrière possible :
    // la requête est partie.
    if (!occupe) onAnnuler();
  }

  return createPortal(
    <dialog
      ref={dialogue}
      className="modale modale--confirmation"
      aria-labelledby={idTitre}
      // `cancel` précède la fermeture par Échap et peut l'annuler : c'est le
      // seul moyen de garder la fenêtre à l'écran pendant la requête.
      onCancel={(evenement) => {
        if (occupe) evenement.preventDefault();
      }}
      onClose={annuler}
      // Un clic sur le fond a pour cible le <dialog> lui-même, le contenu étant
      // dans un enfant.
      onClick={(evenement) => {
        if (evenement.target === dialogue.current) annuler();
      }}
    >
      <div className="modale-contenu" data-lenis-prevent>
        <h2 id={idTitre} className="confirmation-titre">
          {titre}
        </h2>

        {children}

        <p className="confirmation-message">{message}</p>

        {erreur && (
          <p className="confirmation-erreur" role="alert">
            {erreur}
          </p>
        )}

        {/* Annuler vient en premier dans le DOM : le <dialog> donne le focus
            au premier élément focalisable, et une frappe d'Entrée réflexe ne
            doit pas déclencher la suppression. */}
        <div className="confirmation-actions">
          <button
            type="button"
            className="confirmation-annuler"
            onClick={onAnnuler}
            disabled={occupe}
          >
            Annuler
          </button>
          <button
            type="button"
            className="confirmation-supprimer"
            onClick={onConfirmer}
            disabled={occupe}
          >
            <span className="icone-corbeille" aria-hidden="true" />
            {occupe ? "Suppression…" : libelleConfirmer}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
