import AlbumNav from "./AlbumNav.jsx";
import AlbumSection from "./AlbumSection.jsx";
import "../styles/gallery.css";

export default function Gallery({ sections, chargement, erreur }) {
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
