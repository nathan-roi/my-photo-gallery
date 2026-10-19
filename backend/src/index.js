import express from "express";
import healthRoutes from "./routes/health.js";

const port = Number(process.env.PORT ?? 3001);

const app = express();

app.use("/api", healthRoutes);

app.listen(port, () => {
  console.log(`API à l'écoute sur le port ${port}`);
});
