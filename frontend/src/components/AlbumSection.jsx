import {
  classesFondu,
  useRevelationAuScroll,
} from "../hooks/useRevelationAuScroll.js";
import PhotoCard from "./PhotoCard.jsx";

export default function AlbumSection({ section, onChangement, onOuvrir }) {
  // Le fondu est porté par le titre et par chaque photo, et non par la section :
  // sur un album plus haut que la fenêtre, une seule animation au passage de son
  // bord supérieur laisserait apparaître sans effet tout ce qui suit.
  const [titre, titreVisible] = useRevelationAuScroll();

  return (
    <section className="album" id={section.ancre}>
      <h2 ref={titre} className={`album-titre ${classesFondu(titreVisible)}`}>
        {section.nom}
      </h2>

      {/* La justification est calculée par section : chaque album remplit ses
          lignes indépendamment des autres. */}
      <div className="gallery">
        {section.photos.map((photo) => (
          <PhotoCard
            key={photo._id}
            photo={photo}
            onSupprimee={onChangement}
            onOuvrir={() => onOuvrir(photo)}
          />
        ))}
      </div>
    </section>
  );
}
