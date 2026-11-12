// Limite les tentatives de connexion. Il n'y a qu'un seul compte, donc une
// seule porte à forcer : sans ce garde-fou, rien n'empêche d'essayer des
// milliers de mots de passe à la suite.
//
// Le compteur est en mémoire, donc propre à chaque replica de l'API : avec
// deux pods, un attaquant dispose en pratique du double d'essais. C'est un
// compromis assumé, le but étant de casser l'automatisation, pas de tenir un
// décompte exact. Le passer en base serait possible (Mongo est là), au prix
// d'une écriture par tentative.

const FENETRE_MS = 15 * 60 * 1000;
const MAX_ECHECS = 10;

const parCle = new Map();

function maintenant() {
  return Date.now();
}

function purger() {
  for (const [cle, suivi] of parCle) {
    if (suivi.expire <= maintenant()) parCle.delete(cle);
  }
}

/** Nombre de secondes à attendre, ou 0 si la tentative est permise. */
export function attenteRestante(cle) {
  const suivi = parCle.get(cle);
  if (!suivi || suivi.expire <= maintenant()) return 0;
  if (suivi.echecs < MAX_ECHECS) return 0;

  return Math.ceil((suivi.expire - maintenant()) / 1000);
}

export function enregistrerEchec(cle) {
  purger();

  const suivi = parCle.get(cle);
  if (!suivi || suivi.expire <= maintenant()) {
    parCle.set(cle, { echecs: 1, expire: maintenant() + FENETRE_MS });
    return;
  }

  suivi.echecs += 1;
  // La fenêtre repart à chaque échec : enchaîner les essais ne permet pas
  // d'attendre tranquillement l'expiration du compteur.
  suivi.expire = maintenant() + FENETRE_MS;
}

export function oublierEchecs(cle) {
  parCle.delete(cle);
}
