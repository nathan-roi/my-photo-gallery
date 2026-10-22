import { useEffect, useId, useRef, useState } from "react";

const SANS_ALBUM = "Autres (sans album)";

// Insensible à la casse et aux accents, comme le tri des sections dans Gallery.
const collateur = new Intl.Collator("fr", { sensitivity: "base" });

function correspond(nom, saisie) {
  if (saisie === "") return true;
  // Comparaison accent et casse insensibles sur le début du nom, puis n'importe
  // où dedans : taper « bl » doit retrouver « Noir & Blanc ».
  const normaliser = (texte) =>
    texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return normaliser(nom).includes(normaliser(saisie));
}

/**
 * Liste déroulante éditable : on choisit un album existant dans la liste, ou on
 * saisit un nom pour en créer un, dans le même champ. HTML n'offrant pas de
 * `select` éditable, la liste est construite à la main selon le motif ARIA
 * combobox.
 *
 * `valeur` est le texte saisi, remonté tel quel ; c'est à l'appelant de décider
 * ce qu'il en fait (nom vide = aucun album).
 */
export default function ChampAlbum({ albums, valeur, onChangement }) {
  const [ouvert, setOuvert] = useState(false);
  const [indexActif, setIndexActif] = useState(-1);

  const identifiant = useId();
  const conteneur = useRef(null);
  const champ = useRef(null);

  // La liste proposée : l'absence d'album en premier, puis les albums existants
  // filtrés par la saisie.
  const entrees = [
    { cle: "", libelle: SANS_ALBUM },
    ...albums.map((nom) => ({ cle: nom, libelle: nom })),
  ].filter((entree) => correspond(entree.libelle, valeur));

  // Fermeture au clic en dehors : sans ça, la liste resterait ouverte en
  // permanence une fois déployée.
  useEffect(() => {
    if (!ouvert) return;

    function auClic(evenement) {
      if (!conteneur.current?.contains(evenement.target)) {
        setOuvert(false);
      }
    }

    document.addEventListener("pointerdown", auClic);
    return () => document.removeEventListener("pointerdown", auClic);
  }, [ouvert]);

  function choisir(entree) {
    onChangement(entree.cle);
    setOuvert(false);
    setIndexActif(-1);
    champ.current?.focus();
  }

  function deplacer(pas) {
    if (!ouvert) {
      setOuvert(true);
      setIndexActif(0);
      return;
    }
    if (entrees.length === 0) return;

    setIndexActif((precedent) => {
      const suivant = precedent + pas;
      if (suivant < 0) return entrees.length - 1;
      if (suivant >= entrees.length) return 0;
      return suivant;
    });
  }

  function auClavier(evenement) {
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      deplacer(1);
      return;
    }
    if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      deplacer(-1);
      return;
    }
    if (evenement.key === "Escape") {
      setOuvert(false);
      setIndexActif(-1);
      return;
    }
    if (evenement.key === "Enter" && ouvert) {
      // Sans ça, Entrée enverrait le formulaire au lieu de valider le choix.
      evenement.preventDefault();
      if (indexActif >= 0 && entrees[indexActif]) {
        choisir(entrees[indexActif]);
      } else {
        setOuvert(false);
      }
    }
  }

  const idOptionActive =
    indexActif >= 0 && entrees[indexActif]
      ? `${identifiant}-option-${indexActif}`
      : undefined;

  return (
    <div className="champ-album" ref={conteneur}>
      <input
        ref={champ}
        id="album"
        name="album"
        type="text"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={`${identifiant}-liste`}
        aria-autocomplete="list"
        aria-activedescendant={idOptionActive}
        autoComplete="off"
        value={valeur}
        placeholder={SANS_ALBUM}
        onChange={(evenement) => {
          onChangement(evenement.target.value);
          setOuvert(true);
          setIndexActif(-1);
        }}
        onFocus={() => setOuvert(true)}
        onKeyDown={auClavier}
      />

      <button
        type="button"
        className="champ-album-bascule"
        aria-label={ouvert ? "Fermer la liste des albums" : "Ouvrir la liste des albums"}
        tabIndex={-1}
        onClick={() => {
          setOuvert((precedent) => !precedent);
          champ.current?.focus();
        }}
      >
        <span aria-hidden="true">▾</span>
      </button>

      {ouvert && entrees.length > 0 && (
        <ul className="champ-album-liste" id={`${identifiant}-liste`} role="listbox">
          {entrees.map((entree, index) => (
            <li
              key={entree.cle || "__sans__"}
              id={`${identifiant}-option-${index}`}
              role="option"
              aria-selected={collateur.compare(entree.cle, valeur) === 0}
              className={index === indexActif ? "actif" : undefined}
              // pointerdown et non click : le clic arriverait après la fermeture
              // déclenchée par le gestionnaire de clic extérieur.
              onPointerDown={(evenement) => {
                evenement.preventDefault();
                choisir(entree);
              }}
              onPointerEnter={() => setIndexActif(index)}
            >
              {entree.libelle}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
