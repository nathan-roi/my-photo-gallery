import { useCallback, useEffect, useMemo, useState } from "react";

import { fermerSession, lireSession, ouvrirSession } from "../api/session.js";
import { ContexteSession } from "../hooks/useSession.js";

export default function SessionProvider({ children }) {
  const [connecte, setConnecte] = useState(false);
  // Tant que l'API n'a pas répondu, on ne sait pas : afficher « Connexion »
  // puis le remplacer par « Déconnexion » ferait clignoter l'en-tête.
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let monte = true;

    lireSession()
      .then((authentifie) => {
        if (monte) setConnecte(authentifie);
      })
      .catch((err) => {
        // Pas de session lisible : on reste en visiteur, ce qui est l'état sûr.
        console.error("État de connexion indisponible :", err);
      })
      .finally(() => {
        if (monte) setChargement(false);
      });

    return () => {
      monte = false;
    };
  }, []);

  const connecter = useCallback(async (identifiants) => {
    await ouvrirSession(identifiants);
    setConnecte(true);
  }, []);

  const deconnecter = useCallback(async () => {
    await fermerSession();
    setConnecte(false);
  }, []);

  // Appelé quand une écriture revient en 401 : la session a expiré pendant la
  // visite, l'interface doit repasser en visiteur au lieu de proposer des
  // commandes qui échoueront toutes.
  const signalerExpiration = useCallback(() => setConnecte(false), []);

  const valeur = useMemo(
    () => ({ connecte, chargement, connecter, deconnecter, signalerExpiration }),
    [connecte, chargement, connecter, deconnecter, signalerExpiration],
  );

  return <ContexteSession value={valeur}>{children}</ContexteSession>;
}
