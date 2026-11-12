import { createContext, use } from "react";

export const ContexteSession = createContext(null);

/**
 * État de connexion partagé. Un contexte plutôt qu'une prop de plus : il faut
 * descendre jusqu'à PhotoCard, donc traverser Gallery et AlbumSection qui n'en
 * ont aucun usage.
 */
export function useSession() {
  const valeur = use(ContexteSession);

  if (!valeur) {
    throw new Error("useSession doit être utilisé dans un SessionProvider");
  }

  return valeur;
}
