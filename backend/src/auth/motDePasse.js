import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);

// Paramètres de dérivation. Ils sont écrits dans l'empreinte plutôt que figés
// ici : en les durcissant un jour, les empreintes déjà générées resteront
// vérifiables au lieu d'échouer silencieusement.
//
// Les champs sont séparés par « : » et non par « $ » comme le veut l'usage :
// l'empreinte voyage dans un .env, et docker compose y lit « $16384 » comme
// une variable à remplacer, ce qui mutile silencieusement la valeur.
const PARAMETRES = { N: 16384, r: 8, p: 1 };
const LONGUEUR = 64;

/** Empreinte au format scrypt:N:r:p:sel:clé, tout en hexadécimal. */
export async function hacherMotDePasse(motDePasse) {
  const sel = randomBytes(16);
  const cle = await derive(motDePasse, sel, LONGUEUR, PARAMETRES);
  const { N, r, p } = PARAMETRES;

  return `scrypt:${N}:${r}:${p}:${sel.toString("hex")}:${cle.toString("hex")}`;
}

export async function verifierMotDePasse(motDePasse, empreinte) {
  const [algorithme, N, r, p, selHex, cleHex] = String(empreinte).split(":");
  if (algorithme !== "scrypt" || !selHex || !cleHex) return false;

  const attendue = Buffer.from(cleHex, "hex");
  const calculee = await derive(motDePasse, Buffer.from(selHex, "hex"), attendue.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });

  // timingSafeEqual exige deux tampons de même longueur et compare en temps
  // constant : une comparaison par === fuirait le nombre d'octets corrects.
  return calculee.length === attendue.length && timingSafeEqual(calculee, attendue);
}
