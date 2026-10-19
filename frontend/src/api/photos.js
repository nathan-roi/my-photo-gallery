// Toutes les URL sont relatives : en dev le proxy Vite les renvoie vers l'API,
// en production c'est nginx puis l'Ingress. Il n'y a donc jamais d'URL de base
// à configurer côté front.
const BASE = "/api/photos";

export async function listerPhotos({ album } = {}) {
  const parametres = album ? `?album=${encodeURIComponent(album)}` : "";
  const reponse = await fetch(`${BASE}${parametres}`);

  if (!reponse.ok) {
    throw new Error(`Liste des photos indisponible (HTTP ${reponse.status})`);
  }

  return reponse.json();
}

// L'API sert le fichier elle-même depuis MinIO, qui n'est donc jamais exposé.
export function urlFichier(photo) {
  return `${BASE}/${photo._id}/file`;
}
