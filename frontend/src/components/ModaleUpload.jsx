import { useLenis } from "lenis/react";
import { useEffect, useRef } from "react";

import UploadForm from "./UploadForm.jsx";
import "../styles/modale.css";

/**
 * Enveloppe le formulaire dans un <dialog> natif, qui fournit gratuitement le
 * piège de focus, la fermeture par Échap et l'inertie de l'arrière-plan.
 */
export default function ModaleUpload({ ouverte, onFermer, albums, onTermine }) {
  const dialogue = useRef(null);
  const lenis = useLenis();

  useEffect(() => {
    const element = dialogue.current;
    if (!element) return;

    if (ouverte && !element.open) {
      element.showModal();
    } else if (!ouverte && element.open) {
      element.close();
    }
  }, [ouverte]);

  // Lenis détourne la molette sur toute la page : sans l'arrêter, l'arrière-plan
  // défilerait derrière la fenêtre. Le `data-lenis-prevent` plus bas ne protège
  // que le contenu de la modale, pas le reste de la page.
  useEffect(() => {
    if (!lenis) return;

    if (ouverte) {
      lenis.stop();
    } else {
      lenis.start();
    }

    return () => lenis.start();
  }, [lenis, ouverte]);

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
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <UploadForm albums={albums} onTermine={onTermine} />
      </div>
    </dialog>
  );
}
