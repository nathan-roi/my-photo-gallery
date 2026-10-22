import { useEffect, useRef, useState } from "react";

import { envoyerPhoto } from "../api/photos.js";
import ChampAlbum from "./ChampAlbum.jsx";
import "../styles/upload.css";

// Mêmes limites que l'API : multer refuse au-delà de 25 Mo, et le proxy nginx
// encore avant lui. Autant le dire tout de suite plutôt que d'envoyer pour rien.
const TAILLE_MAX = 25 * 1024 * 1024;

function formaterTaille(octets) {
  const mo = octets / 1024 / 1024;
  return mo >= 1 ? `${mo.toFixed(1)} Mo` : `${Math.round(octets / 1024)} Ko`;
}

// Insensible à la casse et aux accents, comme le tri des sections dans Gallery.
const collateur = new Intl.Collator("fr", { sensitivity: "base" });

// Deux fichiers de même nom et même taille sont considérés comme le même, pour
// qu'un dépôt répété n'ajoute pas de doublons.
function cle(fichier) {
  return `${fichier.name}:${fichier.size}`;
}

export default function UploadForm({ albums, onTermine }) {
  const [fichiers, setFichiers] = useState([]);
  const [survol, setSurvol] = useState(false);
  const [refus, setRefus] = useState([]);

  // Texte saisi dans le champ album, vide pour « Autres ».
  const [album, setAlbum] = useState("");

  // Envoi en cours : { fait, total }, ou null au repos.
  const [progression, setProgression] = useState(null);
  const [echecs, setEchecs] = useState([]);

  const envoiEnCours = progression !== null;

  const champFichier = useRef(null);

  // Le nom finalement retenu. Si la saisie correspond à un album existant à la
  // casse ou aux accents près, on reprend son orthographe : sans ça, « paysages »
  // créerait une seconde section à côté de « Paysages ».
  const nomSaisi = album.trim();
  const albumExistant = albums.find((nom) => collateur.compare(nom, nomSaisi) === 0);
  const albumRetenu = albumExistant ?? nomSaisi;

  function texteAide() {
    if (nomSaisi === "") {
      return "Sans album, les photos iront dans la section « Autres ».";
    }
    if (albumExistant) {
      return `Album existant « ${albumExistant} » : les photos y seront ajoutées.`;
    }
    return `Nouvel album « ${nomSaisi} », il sera créé à l'envoi.`;
  }

  // Les dragenter/dragleave des éléments enfants remonteraient et feraient
  // clignoter la zone : on compte les entrées et sorties pour n'éteindre le
  // survol qu'en quittant réellement la zone.
  const profondeur = useRef(0);

  // Les aperçus sont des URL d'objets : il faut les libérer, sinon les images
  // restent en mémoire pour la durée de vie de l'onglet. Les retraits les
  // révoquent au cas par cas ; ce miroir ne sert qu'à tout libérer au démontage,
  // sans révoquer au passage des aperçus encore affichés.
  const fichiersCourants = useRef(fichiers);

  useEffect(() => {
    fichiersCourants.current = fichiers;
  }, [fichiers]);

  useEffect(() => {
    return () => {
      for (const entree of fichiersCourants.current) {
        URL.revokeObjectURL(entree.apercu);
      }
    };
  }, []);

  function ajouter(liste) {
    const candidats = [...liste];
    const rejetes = [];
    const acceptes = [];

    for (const fichier of candidats) {
      if (!fichier.type.startsWith("image/")) {
        rejetes.push(`${fichier.name} — ce n'est pas une image`);
        continue;
      }
      if (fichier.size > TAILLE_MAX) {
        rejetes.push(`${fichier.name} — ${formaterTaille(fichier.size)}, au-delà de 25 Mo`);
        continue;
      }
      acceptes.push(fichier);
    }

    setRefus(rejetes);

    setFichiers((precedents) => {
      const dejaLa = new Set(precedents.map((entree) => cle(entree.fichier)));
      const nouveaux = acceptes
        .filter((fichier) => !dejaLa.has(cle(fichier)))
        .map((fichier) => ({
          id: `${cle(fichier)}:${fichier.lastModified}`,
          fichier,
          apercu: URL.createObjectURL(fichier),
        }));

      return [...precedents, ...nouveaux];
    });
  }

  function retirer(id) {
    setFichiers((precedents) => {
      const sortant = precedents.find((entree) => entree.id === id);
      if (sortant) URL.revokeObjectURL(sortant.apercu);
      return precedents.filter((entree) => entree.id !== id);
    });
  }

  function viderTout() {
    for (const entree of fichiers) {
      URL.revokeObjectURL(entree.apercu);
    }
    setFichiers([]);
    setRefus([]);
  }

  function auDepot(evenement) {
    evenement.preventDefault();
    profondeur.current = 0;
    setSurvol(false);
    ajouter(evenement.dataTransfer.files);
  }

  const pretAEnvoyer = fichiers.length > 0 && !envoiEnCours;

  // Un envoi par photo, en série et non en parallèle : l'API calcule `position`
  // avec un max + 1, donc deux requêtes simultanées liraient le même maximum et
  // rangeraient les deux photos à la même position.
  async function soumettre(evenement) {
    evenement.preventDefault();
    if (!pretAEnvoyer) return;

    const aEnvoyer = [...fichiers];
    const echoues = [];
    let reussies = 0;

    setEchecs([]);
    setRefus([]);

    for (const [index, entree] of aEnvoyer.entries()) {
      setProgression({ fait: index, total: aEnvoyer.length });

      try {
        await envoyerPhoto({ fichier: entree.fichier, album: albumRetenu });
        reussies += 1;
        // Retrait au fur et à mesure : si un envoi échoue plus loin, seuls les
        // fichiers restés sur le carreau sont encore dans le formulaire, prêts
        // à être réessayés sans risquer de doublon.
        retirer(entree.id);
      } catch (err) {
        echoues.push({ nom: entree.fichier.name, message: err.message });
      }
    }

    setProgression(null);
    setEchecs(echoues);

    onTermine({ reussies, echecs: echoues });
  }

  return (
    <form className="upload" onSubmit={soumettre}>
      {/* Un label englobant : le clic et le focus clavier ouvrent le sélecteur
          de fichiers sans qu'on ait à les gérer. */}
      <label
        className={`depot${survol ? " depot--survol" : ""}${envoiEnCours ? " depot--inactif" : ""}`}
        onDragEnter={(evenement) => {
          evenement.preventDefault();
          profondeur.current += 1;
          setSurvol(true);
        }}
        onDragOver={(evenement) => evenement.preventDefault()}
        onDragLeave={() => {
          profondeur.current -= 1;
          if (profondeur.current <= 0) setSurvol(false);
        }}
        onDrop={auDepot}
      >
        <input
          ref={champFichier}
          type="file"
          accept="image/*"
          multiple
          disabled={envoiEnCours}
          onChange={(evenement) => {
            ajouter(evenement.target.files);
            // Permet de resélectionner le même fichier après l'avoir retiré.
            evenement.target.value = "";
          }}
        />
        <span className="depot-titre">Dépose tes photos ici</span>
        <span className="depot-aide">ou clique pour les choisir — 25 Mo par image au maximum</span>
      </label>

      {refus.length > 0 && (
        <ul className="upload-refus">
          {refus.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {echecs.length > 0 && (
        <ul className="upload-refus">
          {echecs.map((echec) => (
            <li key={echec.nom}>
              {echec.nom} — {echec.message}
            </li>
          ))}
        </ul>
      )}

      {fichiers.length > 0 && (
        <>
          <div className="upload-entete">
            <span>
              {fichiers.length} photo{fichiers.length > 1 ? "s" : ""} prête
              {fichiers.length > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              className="bouton-discret"
              onClick={viderTout}
              disabled={envoiEnCours}
            >
              Tout retirer
            </button>
          </div>

          <ul className="upload-apercus">
            {fichiers.map((entree) => (
              <li key={entree.id}>
                <img src={entree.apercu} alt="" />
                <button
                  type="button"
                  className="apercu-retirer"
                  onClick={() => retirer(entree.id)}
                  disabled={envoiEnCours}
                  aria-label={`Retirer ${entree.fichier.name}`}
                >
                  ×
                </button>
                <span className="apercu-nom">{entree.fichier.name}</span>
                <span className="apercu-taille">{formaterTaille(entree.fichier.size)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="upload-album">
        <label htmlFor="album">Album</label>

        <ChampAlbum albums={albums} valeur={album} onChangement={setAlbum} />

        <p className="upload-aide">{texteAide()}</p>
      </div>

      <div className="upload-actions">
        <button type="submit" className="bouton" disabled={!pretAEnvoyer}>
          {envoiEnCours ? "Envoi…" : "Envoyer"}
        </button>

        {/* aria-live : le lecteur d'écran annonce l'avancement sans qu'il faille
            déplacer le focus. */}
        <p className="upload-progression" aria-live="polite">
          {envoiEnCours
            ? `Envoi de la photo ${progression.fait + 1} sur ${progression.total}…`
            : ""}
        </p>
      </div>
    </form>
  );
}
