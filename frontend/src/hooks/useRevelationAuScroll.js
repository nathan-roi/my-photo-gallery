import { useEffect, useRef, useState } from "react";

function animationsLimitees() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const OPTIONS = {
  // Seuil à 0 plutôt qu'un pourcentage de l'élément : un élément plus haut que
  // la fenêtre ne pourrait jamais en afficher 15 %, et ne serait donc jamais
  // révélé. La marge négative rétrécit la zone de détection par le bas, ce qui
  // *retarde* la révélation : l'élément doit être entré de 12 % de la hauteur
  // de fenêtre avant que le fondu ne démarre, au lieu de se déclencher sur une
  // bande de quelques pixels encore au ras du bord. Elle ne s'applique qu'en
  // bas, pour ne pas décaler aussi le masquage par le haut.
  threshold: 0,
  rootMargin: "0px 0px -12% 0px",
};

// Un seul observateur pour toute la page, et non un par élément : la galerie
// peut compter des centaines de photos, et un IntersectionObserver par vignette
// multiplierait d'autant le travail du navigateur à chaque image.
let observateur = null;
const abonnes = new Map();

function obtenirObservateur() {
  observateur ??= new IntersectionObserver((entrees) => {
    for (const entree of entrees) {
      abonnes.get(entree.target)?.(entree.isIntersecting);
    }
  }, OPTIONS);

  return observateur;
}

/**
 * Suit la présence d'un élément dans la fenêtre, dans les deux sens : il se
 * révèle en entrant et redevient masqué en sortant, de sorte que l'animation
 * se rejoue quand on repasse dessus.
 * Renvoie la référence à poser sur l'élément et un booléen de visibilité.
 */
export function useRevelationAuScroll() {
  const reference = useRef(null);

  // Si l'utilisateur demande à limiter les animations, l'élément est visible
  // dès le premier rendu : la valeur est connue avant tout effet, autant
  // initialiser l'état avec plutôt que de déclencher un second rendu.
  const [visible, setVisible] = useState(animationsLimitees);

  useEffect(() => {
    const element = reference.current;
    if (!element) return;

    // Dans ce cas, rien à observer : tout est déjà affiché.
    if (animationsLimitees()) return;

    // On ne cesse jamais d'observer après la première révélation : l'élément
    // repasse à l'état masqué en quittant la fenêtre, donc le fondu rejoue au
    // passage suivant.
    const partage = obtenirObservateur();
    abonnes.set(element, setVisible);
    partage.observe(element);

    return () => {
      partage.unobserve(element);
      abonnes.delete(element);
    };
  }, []);

  return [reference, visible];
}

/** Classes à poser sur l'élément observé (voir `.fondu` dans gallery.css). */
export function classesFondu(visible) {
  return `fondu${visible ? " fondu--visible" : ""}`;
}
