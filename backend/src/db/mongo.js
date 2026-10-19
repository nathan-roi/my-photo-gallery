import mongoose from "mongoose";

import { config } from "../config.js";

export async function connectMongo() {
  await mongoose.connect(config.mongoUrl);

  // Une fois la connexion établie, Mongoose retente tout seul en cas de
  // coupure. Sans ce gestionnaire, l'erreur remonterait en exception non
  // capturée et tuerait le processus à chaque hoquet de la base.
  mongoose.connection.on("error", (err) => {
    console.error("Erreur MongoDB :", err.message);
  });

  console.log("MongoDB connecté");
}

export function disconnectMongo() {
  return mongoose.disconnect();
}
