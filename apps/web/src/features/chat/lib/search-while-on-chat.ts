/**
 * #3452 — la recherche d'URL que `Chat` doit lire. Hors de `/chat` (le routeur
 * a déjà basculé l'adresse vers l'écran suivant, `Chat` est encore monté), la
 * DERNIÈRE recherche vue sur `/chat` : l'adresse d'arrivée n'est pas la sienne.
 * Un `pathname` absent (doubles de test) vaut « on est sur /chat ».
 */
export function searchWhileOnChat<S>(location: { pathname?: string; search: S }, lastChatSearch: S): S {
  const { pathname } = location
  if (pathname === undefined || pathname === '/chat' || pathname.startsWith('/chat/')) return location.search
  return lastChatSearch
}
