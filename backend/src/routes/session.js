import { Router } from "express";

import { config } from "../config.js";
import { attenteRestante, enregistrerEchec, oublierEchecs } from "../auth/limite.js";
import { verifierMotDePasse } from "../auth/motDePasse.js";
import { NOM_COOKIE } from "../auth/session.js";

const router = Router();

// Interrogée au chargement du front pour savoir s'il affiche les commandes
// d'édition. Toujours 200 : ne pas être connecté n'est pas une erreur.
router.get("/session", (req, res) => {
  res.json({ authentifie: Boolean(req.session.admin) });
});

router.post("/session", async (req, res) => {
  const { utilisateur, motDePasse } = req.body ?? {};

  if (typeof utilisateur !== "string" || typeof motDePasse !== "string") {
    res.status(400).json({ error: "Identifiant et mot de passe attendus" });
    return;
  }

  const attente = attenteRestante(req.ip);
  if (attente > 0) {
    res.set("Retry-After", String(attente));
    res.status(429).json({
      error: `Trop de tentatives. Réessayez dans ${Math.ceil(attente / 60)} minute(s).`,
    });
    return;
  }

  // La vérification est faite même quand l'identifiant est faux, et le résultat
  // écarté : sans cela, un mauvais identifiant répondrait beaucoup plus vite
  // qu'un mauvais mot de passe, ce qui révélerait le bon identifiant.
  const correspond = await verifierMotDePasse(motDePasse, config.adminPasswordHash);
  const valide = utilisateur === config.adminUser && correspond;

  if (!valide) {
    enregistrerEchec(req.ip);
    // Message unique : distinguer les deux cas renseignerait un attaquant.
    res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });
    return;
  }

  oublierEchecs(req.ip);

  // Nouvelle session plutôt que réutilisation de l'ancienne : si un cookie
  // avait été déposé avant la connexion, il ne doit pas devenir une session
  // authentifiée (fixation de session).
  req.session.regenerate((err) => {
    if (err) {
      console.error("Régénération de session impossible :", err);
      res.status(500).json({ error: "Erreur interne" });
      return;
    }

    req.session.admin = true;
    res.json({ authentifie: true });
  });
});

router.delete("/session", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Destruction de session impossible :", err);
      res.status(500).json({ error: "Erreur interne" });
      return;
    }

    // Le document est supprimé en base ; le cookie, lui, reste chez le client
    // tant qu'on ne l'efface pas.
    res.clearCookie(NOM_COOKIE);
    res.status(204).end();
  });
});

export default router;
