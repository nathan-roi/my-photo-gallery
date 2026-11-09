import { useCallback, useEffect, useRef, useState } from "react";

import { listerPhotos } from "../api/photos.js";

export const SANS_ALBUM = "Autres";

// Identifiant d'ancre utilisable dans une URL : « Noir & Blanc » -> « album-noir-blanc ».
function versAncre(nom) {
  const sansAccent = nom.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `album-${sansAccent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

// Une section par album. Les photos sans album vont dans « Autres », placée en
// dernier ; les autres albums sont triés par nom.
function grouperParAlbum(photos) {
  const parNom = new Map();

  for (const photo of photos) {
    const nom = photo.album?.trim() || SANS_ALBUM;
    if (!parNom.has(nom)) {
      parNom.set(nom, []);
    }
    parNom.get(nom).push(photo);
  }

  const collateur = new Intl.Collator("fr", { sensitivity: "base" });

  return [...parNom.entries()]
    .sort(([a], [b]) => {
      if (a === SANS_ALBUM) return 1;
      if (b === SANS_ALBUM) return -1;
      return collateur.compare(a, b);
    })
    .map(([nom, photosDeLAlbum]) => ({
      nom,
      ancre: versAncre(nom),
      // L'API renvoie déjà la liste triée par position.
      photos: photosDeLAlbum,
    }));
}

/**
 * Récupère les photos et les regroupe en sections. Partagé entre la galerie et
 * le formulaire d'upload, qui a besoin de la liste des albums existants.
 */
export function usePhotos() {
  const [sections, setSections] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  // Le composant peut être démonté avant la réponse, et deux rafraîchissements
  // peuvent se chevaucher : on ignore alors les résultats devenus inutiles.
  const monte = useRef(true);

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const rafraichir = useCallback(() => {
    return listerPhotos()
      .then((photos) => {
        if (!monte.current) return;

        const groupees = grouperParAlbum(photos);
        setSections(groupees);
        setErreur(null);
        console.log(
          photos.length === 0
            ? "Galerie vide : aucune photo dans l'API pour l'instant."
            : `${photos.length} photo(s) en ${groupees.length} section(s) : ${groupees.map((s) => `${s.nom} (${s.photos.length})`).join(", ")}.`,
        );
      })
      .catch((err) => {
        if (!monte.current) return;
        setErreur(err.message);
        console.error("Récupération des photos impossible :", err);
      })
      .finally(() => {
        if (monte.current) setChargement(false);
      });
  }, []);

  useEffect(() => {
    rafraichir();
  }, [rafraichir]);

  // « Autres » n'est pas un album mais l'absence d'album : on ne le propose donc
  // pas dans le formulaire.
  const albums = sections
    .filter((section) => section.nom !== SANS_ALBUM)
    .map((section) => section.nom);

  // Liste à plat dans l'ordre d'affichage : c'est l'ordre dans lequel la
  // visionneuse fait défiler les photos, albums compris.
  const photos = sections.flatMap((section) => section.photos);

  return { sections, photos, albums, chargement, erreur, rafraichir };
}
