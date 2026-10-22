// De simples ancres : Lenis, monté dans App.jsx avec `anchors: true`,
// intercepte le clic et anime le défilement. Le décalage sous la barre vient
// du scroll-margin-top des sections, que Lenis lit lui-même.
export default function AlbumNav({ sections }) {
  return (
    <nav className="album-nav" aria-label="Albums">
      <ul>
        {sections.map((section) => (
          <li key={section.ancre}>
            <a href={`#${section.ancre}`}>
              {section.nom}
              <span className="album-nav-compte">{section.photos.length}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
