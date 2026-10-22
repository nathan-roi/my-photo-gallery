import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

import Gallery from "./components/Gallery.jsx";
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
  return (
    <>
      {/* root : Lenis prend le défilement de la page entière. Le composant
          lance seul sa boucle d'animation (autoRaf vaut true dans le wrapper
          React) et détruit l'instance au démontage. */}
      <ReactLenis root options={OPTIONS_LENIS} />

      <main className="app">
        <h1 className="app-titre">Ma galerie photo</h1>
        <Gallery />
      </main>
    </>
  );
}

export default App;
