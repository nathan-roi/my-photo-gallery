import { useLenis } from "lenis/react";
import { useEffect, useRef } from "react";

/**
 * Pilote un <dialog> natif depuis un état React et neutralise Lenis pendant
 * l'ouverture. Rend la ref à poser sur l'élément <dialog>.
 *
 * Le <dialog> natif apporte gratuitement le piège de focus, la fermeture par
 * Échap et l'inertie de l'arrière-plan ; il faut en revanche ouvrir et fermer
 * soi-même, `open` en attribut ne déclenchant pas le mode modal.
 */
export default function useDialogue(ouverte) {
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
  // défilerait derrière la fenêtre. Le `data-lenis-prevent` posé sur le contenu
  // ne protège que la modale, pas le reste de la page.
  useEffect(() => {
    if (!lenis) return;

    if (ouverte) {
      lenis.stop();
    } else {
      lenis.start();
    }

    return () => lenis.start();
  }, [lenis, ouverte]);

  return dialogue;
}
