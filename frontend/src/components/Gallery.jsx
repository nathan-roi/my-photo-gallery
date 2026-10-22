import { useEffect, useState } from "react";

import { listerPhotos } from "../api/photos.js";
import AlbumNav from "./AlbumNav.jsx";
import AlbumSection from "./AlbumSection.jsx";
import "../styles/gallery.css";

const SANS_ALBUM = "Autres";

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

export default function Gallery() {
  const [sections, setSections] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    // En mode strict, React joue l'effet deux fois en développement : ce drapeau
    // évite qu'une réponse arrivée après le démontage mette à jour l'état.
    let annule = false;

    listerPhotos()
      .then((photos) => {
        if (annule) return;
        const groupees = grouperParAlbum(photos);
        setSections(groupees);
        console.log(
          photos.length === 0
            ? "Galerie vide : aucune photo dans l'API pour l'instant."
            : `${photos.length} photo(s) en ${groupees.length} section(s) : ${groupees.map((s) => `${s.nom} (${s.photos.length})`).join(", ")}.`,
        );
      })
      .catch((err) => {
        if (annule) return;
        setErreur(err.message);
        console.error("Récupération des photos impossible :", err);
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });

    return () => {
      annule = true;
    };
  }, []);

  if (chargement) {
    return <p className="gallery-message">Chargement…</p>;
  }

  if (erreur) {
    return <p className="gallery-message gallery-message--erreur">{erreur}</p>;
  }

  if (sections.length === 0) {
    return <p className="gallery-message">Aucune photo pour l'instant.</p>;
  }

  return (
    <>
      {/* La navigation n'a d'intérêt qu'à partir de deux sections. */}
      {sections.length > 1 && <AlbumNav sections={sections} />}

      {sections.map((section) => (
        <AlbumSection key={section.ancre} section={section} />
      ))}
    </>
  );
}
