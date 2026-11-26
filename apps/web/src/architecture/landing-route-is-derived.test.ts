import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1786 — LA ROUTE D'ARRIVÉE SE DÉRIVE, ELLE NE SE CODE PAS EN DUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INCIDENT QUI PAIE CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt affiche depuis des semaines, dans ses propres commentaires, que
 * « sur mobile, Laura est le premier onglet ET l'écran d'arrivée ». `HomePage`
 * la respectait. **Le login, non.** `resolveLandingFrom` rendait toujours
 * `/dashboard` en dur, et ni `useRedirectAfterAuth` ni `useOauthCallback` ne
 * lisaient `isMobile` : la règle était donc DÉJÀ FAUSSE en production pour
 * quiconque se connectait normalement — c'est-à-dire pour tout le monde.
 *
 * Et une fois ces deux chemins corrigés, il en restait **trois** : la sortie de
 * réinitialisation de mot de passe et les deux gardes d'onboarding, qui
 * s'exécutent dans un `beforeLoad` — hors de React, donc sans hook, donc « on
 * verra plus tard ». C'est le motif « une règle écrite pour un cas et pas pour
 * son jumeau », et c'est précisément ce qu'une garde doit empêcher de revenir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle interdit d'écrire une route d'arrivée LITTÉRALE dans une redirection ou
 * une navigation. Elle n'interdit pas de naviguer vers `/dashboard` depuis un
 * lien ou un bouton : y ALLER quand on le demande est normal ; y ATTERRIR sans
 * avoir dérivé la destination ne l'est pas.
 *
 * `landingRouteNow()` (hors React) et `resolveDefaultLandingRoute()` (dans un
 * composant) sont les deux seules portes, et elles partagent le même calcul —
 * un réglage vit à un seul endroit (GA-26).
 */

const WEB_SRC = join(import.meta.dirname, '..')

/**
 * LE CORPUS — et il est ÉTROIT, à dessein.
 *
 * Première version de cette garde : elle balayait `apps/web/src` en entier et
 * attrapait douze fichiers parfaitement sains — « ouvrir Laura » vers `/chat`,
 * « revenir aux contacts » vers `/contacts`, l'alias `/needs` → `/projects`.
 * **Aller** quelque part sur un geste explicite est légitime ; ce qu'on garde,
 * c'est **atterrir** sans avoir dérivé la destination. Une garde qui attrape ce
 * qu'elle ne vise pas se fait désactiver au premier arbitrage, et elle le
 * mérite.
 *
 * Ne sont donc regardés que les endroits qui DÉCIDENT d'un atterrissage :
 * après une authentification, après une invitation acceptée, et aux gardes
 * d'onboarding qui renvoient « chez toi ».
 */
const LANDING_DECIDERS = [
  'features/auth/',
  'routes/onboarding/',
  'components/templates/home-page',
  'AcceptInvitationView',
]

/** Les routes qui peuvent être une DESTINATION D'ARRIVÉE. Écrire l'une d'elles
 *  en littéral dans un `redirect`/`navigate` court-circuite la dérivation. */
// #2151.60 — `/watchlist` n'est plus une destination : la préférence `watchlist`
// mène à `/mes-cibles`, qui prend sa place dans la liste.
const LANDING_ROUTES = ['/dashboard', '/chat', '/discover', '/accounts', '/contacts', '/projects', '/signals']

/**
 * Les fichiers qui ONT le droit de nommer une route d'arrivée en littéral :
 * ceux qui PORTENT la dérivation, et eux seuls.
 */
const CARRIES_THE_DERIVATION = ['features/preferences/preferences-provider.tsx', 'features/mobile/mobile-nav.ts']

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    // Un test a le droit d'ASSERTER une destination littérale : c'est même la
    // seule façon de prouver que la dérivation rend la bonne.
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/**
 * Les redirections et navigations LITTÉRALES d'un fichier.
 *
 * ⚠️ Motif délibérément ancré sur `to:` suivi d'une chaîne : il ne matche ni
 * `to: landingRouteNow()`, ni `to={'/dashboard'}` d'un `<Link>` (aller quelque
 * part sur un clic est légitime), ni un commentaire — d'où le dépouillement
 * préalable. Et pas de drapeau `g` sur un motif réutilisé : `RegExp.test()`
 * avec `g` est STATEFUL, et rend un faux négatif une fois sur deux.
 */
function literalLandings(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const found: string[] = []
  for (const match of withoutComments.matchAll(/(?:redirect|navigate)\(\s*\{\s*to:\s*'([^']+)'/g)) {
    if (LANDING_ROUTES.includes(match[1])) found.push(match[1])
  }
  return found
}

describe('#1786 — la route d’arrivée se dérive', () => {
  const files = tsFiles(WEB_SRC)
    .filter(f => LANDING_DECIDERS.some(part => f.includes(part)))
    .filter(f => !CARRIES_THE_DERIVATION.some(allowed => f.endsWith(allowed)))

  it('LIT quelque chose — le corpus n’est pas vide', () => {
    // Une garde dont le corpus est vide est verte pour rien. Six l'ont été ici
    // en deux jours.
    expect(files.length).toBeGreaterThan(8)
  })

  it('aucun `redirect`/`navigate` ne code une route d’arrivée en dur', () => {
    const coupables = files
      .map(file => ({ file: file.slice(WEB_SRC.length + 1), routes: literalLandings(readFileSync(file, 'utf8')) }))
      .filter(entry => entry.routes.length > 0)
    expect(coupables).toEqual([])
  })

  it('sait dire NON — une redirection littérale est bien attrapée', () => {
    expect(literalLandings("throw redirect({ to: '/dashboard' })")).toEqual(['/dashboard'])
    expect(literalLandings("await navigate({ to: '/chat' })")).toEqual(['/chat'])
  })

  it('n’attrape pas ce qu’elle ne vise pas', () => {
    // La dérivation elle-même.
    expect(literalLandings('throw redirect({ to: landingRouteNow() })')).toEqual([])
    // Un lien : y ALLER sur un clic est légitime, ce n'est pas un atterrissage.
    expect(literalLandings("<Link to='/dashboard'>Tableau de bord</Link>")).toEqual([])
    // Une route qui n'est pas une destination d'arrivée.
    expect(literalLandings("throw redirect({ to: '/login' })")).toEqual([])
    // Un commentaire qui cite le motif ne le déclenche pas.
    expect(literalLandings("// avant #1786 : redirect({ to: '/dashboard' })")).toEqual([])
  })
})
