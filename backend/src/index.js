import express from "express";

import { middlewareSession } from "./auth/session.js";
import { config } from "./config.js";
import { connectMongo, disconnectMongo } from "./db/mongo.js";
import { ensureBucket } from "./storage/minio.js";
import healthRoutes from "./routes/health.js";
import photoRoutes from "./routes/photos.js";
import sessionRoutes from "./routes/session.js";

const app = express();

// L'API est toujours derrière un intermédiaire (proxy nginx en compose,
// Ingress en Kubernetes). Sans cette ligne, `req.ip` serait l'adresse du
// proxy pour tout le monde et un cookie `secure` ne serait jamais posé.
app.set("trust proxy", 1);

app.use(express.json());
app.use(middlewareSession());
app.use("/api", healthRoutes);
app.use("/api", sessionRoutes);
app.use("/api", photoRoutes);

// Gestionnaire d'erreurs : Express 5 y envoie aussi les rejets des handlers
// async, il n'y a donc pas de try/catch à répéter dans chaque route.
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Fichier trop volumineux (25 Mo maximum)" });
    return;
  }
  if (err.code === "TYPE_NON_SUPPORTE") {
    res.status(415).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Erreur interne" });
});

// Les dépendances sont prêtes avant d'écouter : inutile d'accepter du trafic
// qu'on ne saurait pas servir. Si elles sont injoignables, on sort en erreur et
// l'orchestrateur relance le conteneur.
try {
  await connectMongo();
  await ensureBucket();
} catch (err) {
  console.error("Démarrage impossible :", err.message);
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`API à l'écoute sur le port ${config.port}`);
});

// Kubernetes envoie SIGTERM avant de supprimer un pod. Sans cet arrêt propre,
// les requêtes en cours seraient coupées à chaque rolling update.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`${signal} reçu, arrêt en cours`);
    // Pas de process.exit() : une fois le serveur fermé et Mongo déconnecté,
    // la boucle d'événements se vide et le processus sort de lui-même avec 0.
    // Forcer la sortie tronquerait les écritures stdout encore en attente.
    server.close(async () => {
      await disconnectMongo();
    });

    // server.close() attend la fin des connexions ouvertes mais ne touche pas
    // aux connexions keep-alive inactives — celles des sondes de santé, par
    // exemple. Sans cette ligne, l'arrêt traîne jusqu'au SIGKILL.
    server.closeIdleConnections();

    // Filet de sécurité : au-delà de ce délai, les requêtes encore en cours
    // sont coupées plutôt que de risquer un SIGKILL.
    setTimeout(() => server.closeAllConnections(), 10_000).unref();
  });
}
