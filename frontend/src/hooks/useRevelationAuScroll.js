import { useEffect, useRef, useState } from "react";

/**
 * Suit la présence d'un élément dans la fenêtre, dans les deux sens : il se
 * révèle en entrant et redevient masqué en sortant, de sorte que l'animation
 * se rejoue quand on repasse dessus.
 * Renvoie la référence à poser sur l'élément et un booléen de visibilité.
 */
function animationsLimitees() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          // On suit l'état au lieu de cesser d'observer après la première
          // révélation : la section repasse à l'état masqué en quittant la
          // fenêtre, donc le fondu rejoue au passage suivant.
          setVisible(entree.isIntersecting);
        }
      },
      {
        // Seuil à 0 avec une marge basse négative plutôt qu'un pourcentage de
        // l'élément : une section plus haute que la fenêtre ne pourrait jamais
        // en afficher 15 %, et ne serait donc jamais révélée. La marge ne
        // s'applique qu'en bas, pour que la révélation se déclenche un peu
        // avant l'entrée réelle, sans retarder le masquage par le haut.
        threshold: 0,
        rootMargin: "0px 0px -12% 0px",
      },
    );

    observateur.observe(element);

    return () => observateur.disconnect();
  }, []);

  return [reference, visible];
}
