import useDialogue from "../hooks/useDialogue.js";
import UploadForm from "./UploadForm.jsx";
import "../styles/modale.css";

/**
 * Enveloppe le formulaire dans un <dialog> natif, qui fournit gratuitement le
 * piège de focus, la fermeture par Échap et l'inertie de l'arrière-plan.
 */
export default function ModaleUpload({ ouverte, onFermer, albums, onTermine }) {
  const dialogue = useDialogue(ouverte);

  return (
    <dialog
      ref={dialogue}
      className="modale"
      aria-labelledby="modale-titre"
      // L'événement close couvre aussi Échap et la fermeture native, que notre
      // bouton ne verrait pas passer.
      onClose={onFermer}
      // Un clic sur le fond a pour cible le <dialog> lui-même, le contenu étant
      // dans un enfant.
      onClick={(evenement) => {
        if (evenement.target === dialogue.current) onFermer();
      }}
    >
      <div className="modale-contenu" data-lenis-prevent>
        <div className="modale-entete">
          <h2 id="modale-titre">Ajouter des photos</h2>
          <button
            type="button"
            className="modale-fermer"
            onClick={onFermer}
            aria-label="Fermer"
          >
            <span className="icone-croix" aria-hidden="true" />
          </button>
        </div>

        <UploadForm albums={albums} onTermine={onTermine} />
      </div>
    </dialog>
  );
}
