import { useId, useState } from "react";
import { createPortal } from "react-dom";

import useDialogue from "../hooks/useDialogue.js";
import { useSession } from "../hooks/useSession.js";
import "../styles/connexion.css";
import "../styles/modale.css";

/**
 * Formulaire de connexion de l'administrateur. Montée seulement à l'ouverture,
 * comme les autres fenêtres : chaque ouverture repart d'un formulaire vierge.
 */
export default function ModaleConnexion({ onFermer }) {
  const dialogue = useDialogue(true);
  const { connecter } = useSession();
  const idUtilisateur = useId();
  const idMotDePasse = useId();

  const [utilisateur, setUtilisateur] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  async function soumettre(evenement) {
    evenement.preventDefault();
    setEnvoi(true);
    setErreur(null);

    try {
      await connecter({ utilisateur, motDePasse });
      onFermer();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return createPortal(
    <dialog
      ref={dialogue}
      className="modale modale--connexion"
      aria-labelledby="connexion-titre"
      onClose={onFermer}
      onClick={(evenement) => {
        if (evenement.target === dialogue.current) onFermer();
      }}
    >
      <div className="modale-contenu" data-lenis-prevent>
        <div className="modale-entete">
          <h2 id="connexion-titre">Connexion</h2>
          <button
            type="button"
            className="modale-fermer"
            onClick={onFermer}
            aria-label="Fermer"
          >
            <span className="icone-croix" aria-hidden="true" />
          </button>
        </div>

        <form className="connexion" onSubmit={soumettre}>
          <label className="connexion-champ" htmlFor={idUtilisateur}>
            Identifiant
          </label>
          <input
            id={idUtilisateur}
            name="username"
            autoComplete="username"
            value={utilisateur}
            onChange={(e) => setUtilisateur(e.target.value)}
            required
            // Le formulaire n'est monté qu'à l'ouverture : le focus initial du
            // <dialog> tombe donc bien ici.
            autoFocus
          />

          <label className="connexion-champ" htmlFor={idMotDePasse}>
            Mot de passe
          </label>
          <input
            id={idMotDePasse}
            type="password"
            name="password"
            autoComplete="current-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
          />

          {erreur && (
            <p className="connexion-erreur" role="alert">
              {erreur}
            </p>
          )}

          <button type="submit" className="bouton" disabled={envoi}>
            {envoi ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </dialog>,
    document.body,
  );
}
