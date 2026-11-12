import { ReactLenis } from "lenis/react";
import { useState } from "react";
import "lenis/dist/lenis.css";

import Gallery from "./components/Gallery.jsx";
import Lightbox from "./components/Lightbox.jsx";
import ModaleConnexion from "./components/ModaleConnexion.jsx";
import ModaleUpload from "./components/ModaleUpload.jsx";
import { usePhotos } from "./hooks/usePhotos.js";
import { useSession } from "./hooks/useSession.js";
import "./App.css";

// Options de Lenis. Les valeurs non listées restent celles par défaut, dont
// smoothWheel (molette lissée) et respectReducedMotion, qui coupe le lissage
// si l'utilisateur demande à limiter les animations.
const OPTIONS_LENIS = {
  // Lenis bloque les liens d'ancre par défaut. Sans cette option, la barre
  // d'albums ne ferait plus rien du tout.
  // Pas besoin d'y mettre un `offset` : scrollTo lit le scroll-margin-top
  // calculé de l'élément visé, qui est déjà posé sur les sections dans
  // gallery.css, juste à côté de la hauteur de la barre.
  anchors: true,

  // Inertie au doigt, non activée par défaut.
  syncTouch: true,
};

function App() {
  const { sections, photos, albums, chargement, erreur, rafraichir } =
    usePhotos();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [connexionOuverte, setConnexionOuverte] = useState(false);
  const { connecte, chargement: sessionInconnue, deconnecter } = useSession();

  // La photo ouverte est retenue par son identifiant et non par son rang : un
  // rafraîchissement de la liste décalerait les rangs sous la visionneuse.
  const [photoOuverte, setPhotoOuverte] = useState(null);
  const indexOuvert = photos.findIndex((p) => p._id === photoOuverte);

  // L'envoi lui-même est fait par le formulaire, qui porte les fichiers et
  // l'avancement. Ici on ne décide que de la suite.
  function envoiTermine({ reussies, echecs }) {
    if (reussies > 0) {
      rafraichir();
    }
    // La fenêtre reste ouverte s'il y a eu des échecs : les fichiers concernés
    // y sont toujours, avec leur message, prêts à être réessayés.
    if (echecs.length === 0) {
      setModaleOuverte(false);
    }
  }

  function seDeconnecter() {
    deconnecter().catch((err) => {
      console.error("Déconnexion impossible :", err);
    });
  }

  return (
    <>
      {/* root : Lenis prend le défilement de la page entière. Le composant
          lance seul sa boucle d'animation (autoRaf vaut true dans le wrapper
          React) et détruit l'instance au démontage. */}
      <ReactLenis root options={OPTIONS_LENIS} />

      <main className="app">
        <header className="app-entete">
          <h1 className="app-titre">Ma galerie photo</h1>

          <div className="app-actions">
            {/* Les commandes d'édition n'apparaissent que connecté. Ce n'est
                qu'un confort : l'API refuse l'écriture sans session. */}
            {connecte && (
              <button
                type="button"
                className="bouton-ajouter"
                onClick={() => setModaleOuverte(true)}
              >
                Ajouter des photos
              </button>
            )}

            {/* Tant que l'API n'a pas répondu, aucun des deux : les afficher
                puis les permuter ferait clignoter l'en-tête au chargement. */}
            {!sessionInconnue && (
              <button
                type="button"
                className="bouton-session"
                onClick={
                  connecte ? seDeconnecter : () => setConnexionOuverte(true)
                }
              >
                {connecte ? "Déconnexion" : "Connexion"}
              </button>
            )}
          </div>
        </header>

        <Gallery
          sections={sections}
          chargement={chargement}
          erreur={erreur}
          onChangement={rafraichir}
          onOuvrir={(photo) => setPhotoOuverte(photo._id)}
        />
      </main>

      {indexOuvert >= 0 && (
        <Lightbox
          photos={photos}
          indexInitial={indexOuvert}
          onFermer={() => setPhotoOuverte(null)}
        />
      )}

      {connexionOuverte && (
        <ModaleConnexion onFermer={() => setConnexionOuverte(false)} />
      )}

      <ModaleUpload
        ouverte={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        albums={albums}
        onTermine={envoiTermine}
      />
    </>
  );
}

export default App;
