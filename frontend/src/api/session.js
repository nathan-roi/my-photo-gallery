// Même origine que l'API, donc le cookie de session part et revient tout seul :
// il n'y a ni jeton à ranger ni en-tête à poser. Le cookie est `HttpOnly`, ce
// code n'y a de toute façon pas accès.
const BASE = "/api/session";

async function messageDErreur(reponse, defaut) {
  const details = await reponse.json().catch(() => null);
  const erreur = new Error(details?.error ?? `${defaut} (HTTP ${reponse.status})`);
  erreur.statut = reponse.status;
  return erreur;
}

export async function lireSession() {
  const reponse = await fetch(BASE);

  if (!reponse.ok) {
    throw await messageDErreur(reponse, "État de connexion indisponible");
  }

  const { authentifie } = await reponse.json();
  return authentifie;
}

export async function ouvrirSession({ utilisateur, motDePasse }) {
  const reponse = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ utilisateur, motDePasse }),
  });

  if (!reponse.ok) {
    throw await messageDErreur(reponse, "Connexion refusée");
  }
}

export async function fermerSession() {
  const reponse = await fetch(BASE, { method: "DELETE" });

  if (!reponse.ok) {
    throw await messageDErreur(reponse, "Déconnexion impossible");
  }
}
