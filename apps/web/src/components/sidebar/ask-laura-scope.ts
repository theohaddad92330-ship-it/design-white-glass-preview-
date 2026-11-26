/**
 * #3215 (recette prod 04/10) — « Demander à Laura » depuis la fiche d'un compte ouvrait le chat
 * sur « Tout mon espace » : la porte de la barre latérale pointait toujours `?fresh=1`, sans
 * compte. Sur la fiche d'un compte, la même porte cadre le fil neuf sur CE compte (`accountId`),
 * comme le font déjà le bouton du Hero et `AskLaura`.
 */

/** Les pages de la section Comptes qui ne sont PAS la fiche d'un compte (`marches` : l'onglet Marché, 14/10/2026). */
const ACCOUNTS_SECTION_PAGES = new Set(['partners', 'sprints', 'memoire-collective', 'marches'])

export function accountIdFromPathname(pathname: string): string | null {
  const match = /^\/accounts\/([^/]+)(?:\/.*)?$/.exec(pathname)
  const segment = match?.[1]
  return segment && !ACCOUNTS_SECTION_PAGES.has(segment) ? segment : null
}

export type AskLauraSearch = { fresh: '1'; accountId?: string } | { conversationId: string }

/**
 * #4967.2 (recette prod 01/11) — revenir par « Demander à Laura » alors qu'un tour est EN COURS
 * ou PRÊT non lu rouvrait une conversation VIERGE (`?fresh=1`) : le fil à rouvrir est celui du tour
 * (même source que la pastille `LauraReadyDot`, #5080). Sans tour : la porte d'avant (#1947).
 * Plusieurs tours : le plus récent (l'ordre d'insertion du magasin).
 */
export function askLauraSidebarSearch(
  pathname: string,
  turns: Readonly<Record<string, 'running' | 'ready'>> = {},
): AskLauraSearch {
  const turnThreadId = Object.keys(turns).at(-1)
  if (turnThreadId) return { conversationId: turnThreadId }
  const accountId = accountIdFromPathname(pathname)
  return accountId ? { fresh: '1', accountId } : { fresh: '1' }
}
