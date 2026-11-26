/**
 * #4359 — LES ANCIENNES ADRESSES QU'UN MESSAGE DÉJÀ PARTI PEUT ENCORE PORTER.
 *
 * Décision de Louis (20/10/2026) : les trente-deux fichiers de route qui ne
 * faisaient plus que `redirect()` sont retirés ; une adresse que plus rien ne
 * génère tombe sur la page « introuvable » (garde
 * `une-adresse-hors-catalogue-montre-introuvable`). Sept adresses font
 * exception, parce qu'une notification, un message de Laura ou un retour OAuth
 * les a PRODUITES et qu'un lien parti ne se rappelle pas :
 *
 *  - `/needs`, `/watchlist` : « des liens de notification déjà partis »
 *    (`route-migration-registry.ts`) ;
 *  - `/missions/renouvellements` : des e-mails partis (#3656) — restaurée
 *    (FIX-E2E-4393). `/favorites` et `/actions/ecritures` restent « introuvable »
 *    par décision #4359 (garde `route-migration-registry.test.ts`) ;
 *  - `/knowledge` : le CTA « Ajouter un document » du copilote ;
 *  - `/agenda` : `engagement-alerts.service.ts` a écrit ce lien dans des
 *    notifications conservées ;
 *  - `/pilotage/marche` : `routine-executors.ts`, même chose ;
 *  - `/consultants/pool` : les liens des rituels (`ritual.ts`) ;
 *  - `/settings/integrations` : le retour OAuth des sept connecteurs, le temps
 *    que l'API et le web ne soient plus déployés à des moments différents.
 *
 * UNE table, pas sept fichiers de route : elle est lue par le routeur
 * (`rewrite.input`, `router.tsx`) AVANT la résolution, donc ces adresses ne
 * sont ni des routes ni des écrans. `appRouteTarget` ne les accepte pas — Laura
 * n'a plus le droit d'écrire une nouvelle fois ces adresses.
 *
 * Une cible peut porter sa propre chaîne de requête / ancre (`/missions?vue=liste`, `/pilotage#parcours`) :
 * celles de l'ancien lien gagnent, la cible ne complète que ce qui manque.
 *
 * La chaîne de requête et l'ancre de l'ancien lien survivent (X41, #2958) :
 * c'est elle qui porte l'accusé de réception d'un retour OAuth.
 */
export const LEGACY_ADDRESSES: Readonly<Record<string, string>> = {
  '/needs': '/projects',
  '/missions/renouvellements': '/missions/planification',
  '/watchlist': '/signals',
  // Théo A signaux — l'écran « Signaux » est `/signals` ; `/mes-cibles` n'est plus qu'une redirection (hash gardé).
  '/knowledge': '/settings/knowledge',
  '/agenda': '/briefing',
  // Théo A today-jour.A8 — « Tableau de bord » RETIRÉ (Louis 22/10/2026, Théo exact) : « Ta journée » (/briefing)
  // le remplace. Les liens d'onboarding, de bascule d'espace et de visite guidée l'atteignent encore.
  '/dashboard': '/briefing',
  '/pilotage/marche': '/accounts/marches',
  '/consultants/pool': '/consultants',
  '/settings/integrations': '/integrations',
  // #4197.2 — le Board des missions n'a plus de page : sa vue (tableau) est la liste de `/missions`. Sans cette
  // ligne `/missions/$id` prenait « board » pour un identifiant (« Mission introuvable », recette prod 31/10).
  '/missions/board': '/missions?vue=liste',
  // #4167.3 — Parcours est une section de Pilotage › Pipe (`#parcours`). Sans cette ligne `/actions/$id` prenait
  // « chaines » pour un identifiant (« Action introuvable »). Garde #4167 ; revient sur la lecture « introuvable »
  // de #4359 pour CETTE adresse seulement (Louis 31/10) — `/actions/ecritures` et `/favorites` y restent.
  '/actions/chaines': '/pilotage#parcours',
  '/pilotage/parcours': '/pilotage#parcours',
  // #4197.2 — `/pipeline` rendait 404 (recette prod 31/10) : les affaires sont sous `/projects`. Requête et ancre gardées.
  '/pipeline': '/projects',
}

/** L'adresse actuelle d'une ancienne adresse, ou `undefined` si elle n'en est pas une. */
export function currentAddressOf(pathname: string): string | undefined {
  const bare = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return Object.hasOwn(LEGACY_ADDRESSES, bare) ? LEGACY_ADDRESSES[bare] : undefined
}

/**
 * L'adresse montrée par le navigateur doit être l'adresse ACTUELLE : le
 * `rewrite.input` seul résout le bon écran mais laisse l'ancienne adresse dans
 * la barre (et dans l'historique). `replaceState` AVANT la création du routeur
 * remplace l'entrée courante — le retour arrière ne ramène pas sur l'ancienne
 * adresse. Chaîne de requête et ancre conservées.
 */
export function replaceLegacyAddressInBrowser(): void {
  if (typeof window === 'undefined') return
  const next = rewriteLegacyAddress({ url: new URL(window.location.href) })
  if (next === undefined) return
  window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}${next.hash}`)
}

/** Le `rewrite.input` du routeur : réécrit le chemin, garde `search` et `hash`. */
export function rewriteLegacyAddress({ url }: { url: URL }): URL | undefined {
  const destination = currentAddressOf(url.pathname)
  if (destination === undefined) return undefined
  const to = new URL(destination, url.origin)
  const target = to.pathname
  const next = new URL(url.href)
  next.pathname = target
  // #4197.2 — une cible fixe sa vue d'arrivée, sans écraser la recherche de l'ancien lien.
  to.searchParams.forEach((value, key) => {
    if (!next.searchParams.has(key)) next.searchParams.set(key, value)
  })
  // #4167.3 — l'ancre de la cible ne sert que si l'ancien lien n'en portait pas.
  return to.hash !== '' && url.hash === '' ? new URL(`${next.pathname}${next.search}${to.hash}`, url.origin) : next
}
