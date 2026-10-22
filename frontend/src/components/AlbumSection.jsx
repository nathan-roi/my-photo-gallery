import { useRevelationAuScroll } from "../hooks/useRevelationAuScroll.js";
import PhotoCard from "./PhotoCard.jsx";

export default function AlbumSection({ section }) {
  const [reference, visible] = useRevelationAuScroll();

  return (
    <section
      ref={reference}
      className={`album${visible ? " album--visible" : ""}`}
      id={section.ancre}
    >
      <h2 className="album-titre">{section.nom}</h2>

      {/* La justification est calculée par section : chaque album remplit ses
          lignes indépendamment des autres. */}
      <div className="gallery">
        {section.photos.map((photo) => (
          <PhotoCard key={photo._id} photo={photo} />
        ))}
      </div>
    </section>
  );
}
