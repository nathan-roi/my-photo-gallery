// Génère la valeur à coller dans ADMIN_PASSWORD_HASH.
// Usage : npm run hash -- "mon mot de passe"
import { hacherMotDePasse } from "../src/auth/motDePasse.js";

const motDePasse = process.argv[2];

if (!motDePasse) {
  console.error('Usage : npm run hash -- "le mot de passe"');
  process.exit(1);
}

if (motDePasse.length < 10) {
  console.error("Mot de passe trop court : 10 caractères au minimum.");
  process.exit(1);
}

console.log(await hacherMotDePasse(motDePasse));
