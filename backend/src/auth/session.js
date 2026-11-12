import MongoStore from "connect-mongo";
import session from "express-session";
import mongoose from "mongoose";

import { config } from "../config.js";

export const NOM_COOKIE = "galerie.sid";

// Sept jours, prolongés à chaque visite (`rolling`). Une session oubliée sur
// une machine partagée finit donc par expirer d'elle-même.
const DUREE_SECONDES = 7 * 24 * 3600;

export function middlewareSession() {
  return session({
    name: NOM_COOKIE,
    secret: config.sessionSecret,
    resave: false,
    // Sans cette option, chaque visiteur anonyme créerait un document de
    // session en base : la galerie se consulte sans compte.
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
      // La connexion Mongoose est déjà ouverte : on réutilise son client au
      // lieu d'ouvrir un second pool vers la même base. `asPromise` attend la
      // connexion, l'ordre de démarrage n'a donc pas d'importance.
      clientPromise: mongoose.connection.asPromise().then((c) => c.getClient()),
      collectionName: "sessions",
      ttl: DUREE_SECONDES,
      // Sans ce seuil, `rolling` réécrirait le document à chaque requête.
      touchAfter: 24 * 3600,
    }),
    cookie: {
      httpOnly: true,
      // Le navigateur n'envoie alors pas le cookie sur une requête déclenchée
      // par un autre site : c'est ce qui tient lieu de protection CSRF ici.
      sameSite: "lax",
      // Faux en HTTP (compose, minikube) : un cookie `secure` y serait ignoré,
      // et la connexion ne tiendrait jamais.
      secure: config.cookieSecure,
      maxAge: DUREE_SECONDES * 1000,
    },
  });
}

/**
 * Verrou des routes d'écriture. C'est la seule vraie barrière : masquer les
 * boutons côté interface n'empêche personne d'appeler l'API à la main.
 */
export function exigerAdmin(req, res, next) {
  if (req.session?.admin) {
    next();
    return;
  }

  res.status(401).json({ error: "Connexion requise" });
}
