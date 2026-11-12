// Toutes les URL sont relatives : en dev le proxy Vite les renvoie vers l'API,
// en production c'est nginx puis l'Ingress. Il n'y a donc jamais d'URL de base
// à configurer côté front.
const BASE = "/api/photos";

function erreurReponse(reponse, message) {
  const erreur = new Error(message);
  // Le statut sert à repérer un 401 : la session a expiré, l'interface doit
  // repasser en visiteur plutôt que d'afficher un échec inexplicable.
  erreur.statut = reponse.status;
  return erreur;
}

export async function listerPhotos({ album } = {}) {
  const parametres = album ? `?album=${encodeURIComponent(album)}` : "";
  const reponse = await fetch(`${BASE}${parametres}`);

  if (!reponse.ok) {
    throw erreurReponse(reponse, `Liste des photos indisponible (HTTP ${reponse.status})`);
  }

  return reponse.json();
}

// L'API sert le fichier elle-même depuis MinIO, qui n'est donc jamais exposé.
export function urlFichier(photo) {
  return `${BASE}/${photo._id}/file`;
}

export async function envoyerPhoto({ fichier, album, titre }) {
  const corps = new FormData();
  corps.append("file", fichier);
  // Sans titre, l'API retient le nom du fichier.
  if (titre) corps.append("titre", titre);
  if (album) corps.append("album", album);

  // Pas de Content-Type explicite : le navigateur doit le poser lui-même pour y
  // placer la frontière du multipart.
  const reponse = await fetch(BASE, { method: "POST", body: corps });

  if (!reponse.ok) {
    // L'API répond { error } ; le proxy nginx, lui, renvoie du HTML sur un 413,
    // d'où le repli sur le code de statut.
    const details = await reponse.json().catch(() => null);
    throw erreurReponse(reponse, details?.error ?? `Envoi refusé (HTTP ${reponse.status})`);
  }

  return reponse.json();
}

export async function supprimerPhoto(id) {
  const reponse = await fetch(`${BASE}/${id}`, { method: "DELETE" });

  // L'API renvoie 204 sans corps : il n'y a rien à analyser en cas de succès.
  if (!reponse.ok) {
    const details = await reponse.json().catch(() => null);
    throw erreurReponse(reponse, details?.error ?? `Suppression refusée (HTTP ${reponse.status})`);
  }
}