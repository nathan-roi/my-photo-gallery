import { ReactLenis } from "lenis/react";
import { useState } from "react";
import "lenis/dist/lenis.css";

import Gallery from "./components/Gallery.jsx";
import ModaleUpload from "./components/ModaleUpload.jsx";
import { usePhotos } from "./hooks/usePhotos.js";
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
  const { sections, albums, chargement, erreur, rafraichir } = usePhotos();
  const [modaleOuverte, setModaleOuverte] = useState(false);

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

  return (
    <>
      {/* root : Lenis prend le défilement de la page entière. Le composant
          lance seul sa boucle d'animation (autoRaf vaut true dans le wrapper
          React) et détruit l'instance au démontage. */}
      <ReactLenis root options={OPTIONS_LENIS} />

      <main className="app">
        <header className="app-entete">
          <h1 className="app-titre">Ma galerie photo</h1>

          <button
            type="button"
            className="bouton-ajouter"
            onClick={() => setModaleOuverte(true)}
          >
            Ajouter des photos
          </button>
        </header>

        <Gallery
          sections={sections}
          chargement={chargement}
          erreur={erreur}
          onChangement={rafraichir}
        />
      </main>

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
