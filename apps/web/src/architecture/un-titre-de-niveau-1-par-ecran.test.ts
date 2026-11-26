/**
 * GA-347 — chaque écran porte un titre de niveau 1. // #2456
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE EMPÊCHÉ
 * ─────────────────────────────────────────────────────────────────────────
 * « Lis-moi le titre de cette page. » Sur `/discover`, mesuré en production au
 * SHA `3993b432b` le 16/09/2026 à 10 h 04 : `document.querySelectorAll('h1')`
 * rend **0** sur 255 éléments lus, `[role="heading"][aria-level="1"]` rend **0**
 * aussi. Le plan de titres du document commence au niveau 2, et la première
 * chose annoncée est « TA CIBLE » — un libellé de BLOC, pas le sujet de l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE NE LIT PAS QU'UN FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * L'issue liste 39 écrans sans `element="h1"` dans leur propre fichier, et
 * prévient elle-même que **ce compte est un majorant, pas un verdict** :
 * `AccountDetailPage` y figure et l'écran rend pourtant bien « DEVOTEAM », via
 * `AccountDetailHero.tsx`. Une garde qui lirait le seul fichier de l'écran
 * accuserait donc du code irréprochable — c'est le défaut exact que raconte
 * l'en-tête d'`accessible-names.test.ts` (43 fautifs annoncés, zéro réel), et
 * une garde qui accuse à tort se fait désactiver dans la semaine.
 *
 * Elle répond donc à la vraie question : **l'écran, ou l'un des composants
 * qu'il REND, fournit-il un titre de niveau 1 ?**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX CORRECTIONS DE CONCEPTION, MESURÉES
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Le corpus n'est pas `features/*∕view/*Page.tsx`.** Ce motif rend 63
 *    fichiers — et il ne contient NI `Discover.tsx` NI `Chat.tsx`, c'est-à-dire
 *    ni l'écran du défaut, ni l'écran témoin cité par l'issue. Un corpus qui
 *    rate son propre sujet ne garde rien. Le corpus est donc l'ensemble des
 *    ROUTES : un écran, c'est une adresse.
 *
 * 1 bis. **Un écran peut recevoir son titre de la COQUE, et la coque est
 *    conditionnelle.** `PageHeader` en porte un, mais il ne le rendait pas
 *    quand la barre d'onglets nommait l'endroit — c'est le défaut de
 *    `/discover`. Depuis la décision de Louis du 16/09/2026 il y pose un titre
 *    `sr-only`. La garde ne le SUPPOSE pas : elle relit le fichier de l'entête
 *    (`HEADER_NAMES_TABBED_SCREENS`) et le registre de navigation, de sorte
 *    qu'ôter ce titre fasse rougir l'INTERDIT en NOMMANT les écrans touchés.
 *
 * 2. **Suivre les imports ne suffit pas, il faut suivre ce qui est RENDU.**
 *    Première mesure, en suivant tous les imports relatifs : 3 fautifs sur 55,
 *    et `/discover` n'en faisait pas partie. La raison : un écran importe des
 *    types, des hooks, des utilitaires, et par eux atteint n'importe quoi. La
 *    garde ne descend donc que dans les modules dont un identifiant importé est
 *    effectivement écrit `<Ainsi` dans le JSX du fichier.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sectionForPath } from '@/components/navigation/sections'

const SRC = join(__dirname, '..')
const ROUTES = join(SRC, 'routes')

/**
 * ⚠️ Retirer les commentaires AVANT de compter — deux comptages faux la même
 * nuit dans ce dépôt, parce que la doc d'une règle CITE la règle. Ici un
 * `<h1>` d'exemple dans un commentaire ferait passer un écran muet.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out)
      continue
    }
    if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

const FILES = sourceFiles(SRC)
const SOURCE = new Map(FILES.map(file => [file, stripComments(readFileSync(file, 'utf8'))]))

/**
 * Les trois formes qu'un titre de niveau 1 prend dans ce dépôt : l'idiome
 * `<Text element="h1">`, la balise brute, et le titre ARIA.
 *
 * ⚠️ Ces expressions n'ont PAS le drapeau `g` : `RegExp.test()` avec `g` est
 * STATEFUL (il reprend à `lastIndex`) et rend un résultat sur deux — une garde
 * borgne de plus dans l'historique de ce dépôt.
 */
const RAW_H1 = /<h1[\s>]/
const ARIA_HEADING_FIRST = /role="heading"[^>]*aria-level=\{?["']?1["']?\}?/
const ARIA_LEVEL_FIRST = /aria-level=\{?["']?1["']?\}?[^>]*role="heading"/

function providesLevelOneHeading(source: string): boolean {
  if (source.includes('element="h1"')) return true
  if (RAW_H1.test(source)) return true
  return ARIA_HEADING_FIRST.test(source) || ARIA_LEVEL_FIRST.test(source)
}

/**
 * ⚠️ `PageHeader` porte un `element="h1"` et ne compte POURTANT pas comme
 * fournisseur dans le parcours : son titre est CONDITIONNEL, et la condition
 * est précisément celle qui a vidé `/discover`. Le laisser dans l'ensemble
 * rendait la garde verte sur les 88 écrans — toute route rend `CustomerPage`,
 * donc toute route « atteignait » un `h1` qui, à l'écran, ne s'affiche pas.
 * Ce qu'il donne vraiment est modélisé à part, par `headerNamesScreen`.
 */
const CONDITIONAL_TITLE_SHELLS = [join(SRC, 'components/layout/PageHeader.tsx')]

const PROVIDES = new Map(
  FILES.map(file => [file, !CONDITIONAL_TITLE_SHELLS.includes(file) && providesLevelOneHeading(SOURCE.get(file)!)]),
)

function resolveSpecifier(from: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier)
  // Un module de `node_modules` ne peut pas porter le titre d'un écran de ce
  // produit : on ne descend pas dedans.
  else return null
  for (const candidate of [base + '.tsx', base + '.ts', join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/**
 * Les identifiants que le fichier REND, pas ceux qu'il importe.
 *
 * Deux formes, et la seconde a été trouvée en mesurant : `<Ainsi` pour le JSX,
 * mais aussi `component: Ainsi` — un fichier de route TanStack passe son écran
 * par RÉFÉRENCE (`createFileRoute('/')({ component: HomePage })`) et n'écrit
 * jamais une seule balise. Sans cette seconde forme, la garde ne descendait
 * dans AUCUN de ces écrans-là et les accusait tous.
 */
function renderedIdentifiers(source: string): Set<string> {
  const names = new Set<string>()
  for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) names.add(match[1]!)
  for (const match of source.matchAll(/[A-Za-z]*[Cc]omponent\s*[:=]\s*\{?\s*([A-Z][A-Za-z0-9_]*)/g)) {
    names.add(match[1]!)
  }
  return names
}

/** Les liaisons d'un `import` : les noms introduits, et le module d'où ils viennent. */
function importBindings(source: string): { names: string[] | null; specifier: string }[] {
  const bindings: { names: string[] | null; specifier: string }[] = []
  for (const match of source.matchAll(/import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = match[1]!
    const names: string[] = []
    const braced = clause.match(/\{([\s\S]*?)\}/)
    if (braced) {
      for (const part of braced[1]!.split(',')) {
        const trimmed = part.trim().replace(/^type\s+/, '')
        if (!trimmed) continue
        const renamed = trimmed.match(/\s+as\s+([A-Za-z0-9_$]+)$/)
        names.push(renamed ? renamed[1]! : trimmed.split(/\s+/)[0]!)
      }
    }
    const defaultBinding = clause
      .replace(/\{[\s\S]*?\}/, '')
      .replace(/^type\s+/, '')
      .split(',')[0]!
      .trim()
    if (/^[A-Za-z0-9_$]+$/.test(defaultBinding)) names.push(defaultBinding)
    bindings.push({ names, specifier: match[2]! })
  }
  // Un import dynamique (`lazy`) n'expose aucun nom au JSX du fichier : on le
  // suit toujours, sinon un écran chargé paresseusement deviendrait invisible.
  for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    bindings.push({ names: null, specifier: match[1]! })
  }
  return bindings
}

const RENDERED_CHILDREN = new Map<string, string[]>()
for (const file of FILES) {
  const source = SOURCE.get(file)!
  const rendered = renderedIdentifiers(source)
  const children = new Set<string>()
  for (const { names, specifier } of importBindings(source)) {
    const resolved = resolveSpecifier(file, specifier)
    if (!resolved) continue
    if (names === null || names.some(name => rendered.has(name))) children.add(resolved)
  }
  RENDERED_CHILDREN.set(file, [...children])
}

/**
 * PROFONDEUR 6, et voici pourquoi ce nombre.
 *
 * Mesurée sur le dépôt, et le test « la profondeur 6 SUFFIT » plus bas la
 * REMESURE à chaque exécution : le verdict est le même à 6 qu'à 20 crans, et il
 * diffère à 1 — le parcours sert donc, et six suffit. Six, c'est la place d'un
 * écran → coque → section → carte → entête → titre, sans laisser le parcours
 * devenir un balayage du dépôt entier.
 * Le parcours est en LARGEUR et mémoïse les fichiers déjà vus, donc un cycle
 * d'imports (il y en a : `Discover.tsx` importe sa route, qui l'importe) ne
 * boucle pas.
 */
const MAX_DEPTH = 6

const CLOSURES = new Map<string, Set<string>>()

/** Tout ce qu'un écran REND, lui compris, jusqu'à `maxDepth`. Mémoïsé. */
function renderedClosure(entry: string, maxDepth: number = MAX_DEPTH): Set<string> {
  const key = `${entry}@${maxDepth}`
  const cached = CLOSURES.get(key)
  if (cached) return cached
  const seen = new Set<string>()
  let frontier = [entry]
  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const file of frontier) {
      if (seen.has(file)) continue
      seen.add(file)
      next.push(...(RENDERED_CHILDREN.get(file) ?? []))
    }
    frontier = next
  }
  CLOSURES.set(key, seen)
  return seen
}

/**
 * `provides` est un PARAMÈTRE, et ce n'est pas de la coquetterie : c'est ce qui
 * permet au test « elle sait dire NON » de rejouer la garde entière sur un
 * dépôt où l'on a retiré le titre d'un écran, sans toucher au disque.
 */
function levelOneHeadingSource(
  entry: string,
  provides: Map<string, boolean> = PROVIDES,
  maxDepth: number = MAX_DEPTH,
): string | null {
  for (const file of renderedClosure(entry, maxDepth)) {
    if (provides.get(file)) return file
  }
  return null
}

/**
 * L'adresse que sert un fichier de route (TanStack, routage par fichiers).
 * Rend `null` pour ce qui n'est pas un écran : la racine, les mises en page
 * (`route.tsx`, qui rendent un `<Outlet />`) et les routes à paramètre — une
 * adresse dynamique ne se résout pas sans données, et ses écrans de détail
 * portent leur titre par leur fil d'Ariane (`AccountDetailHero`, le témoin).
 */
function routeUrl(file: string): string | null {
  const relative = file.slice(ROUTES.length + 1).replace(/\.tsx$/, '')
  if (relative === '__root') return null
  const segments = relative.split('/')
  if (segments.includes('route') || relative.includes('$')) return null
  if (segments[segments.length - 1] === 'index') segments.pop()
  return '/' + segments.join('/')
}

/**
 * L'entête de page nomme-t-elle CET écran ?
 *
 * `PageHeader` porte bien un `<Text element="h1">` — mais dans sa SEULE branche
 * par défaut. Deux conditions l'éteignent, et ce sont elles qui ont produit le
 * défaut de `/discover` :
 *
 * - `nameLivesInTabs` : quand la section a plusieurs onglets, la barre d'onglets
 *   nomme l'endroit et l'entête ne répétait pas le mot (loi 4 du tome 7). Vrai
 *   pour `/discover`, qui est un onglet de la section Comptes — et là `hasContent`
 *   devenait faux, l'entête rendait `null`, le document perdait son seul titre.
 *   **Corrigé le 16/09/2026** (décision de Louis) : l'entête rend désormais dans
 *   ce cas un titre `sr-only`, invisible à l'œil et lu par les lecteurs d'écran.
 *   La loi 4 porte sur la répétition VISIBLE : elle n'est pas re-litigée ;
 * - `skipHeader` / `skipLayout` : les écrans pleine page dessinent leur chrome,
 *   et l'entête n'est jamais montée — là, le titre reste à la charge de l'écran ;
 * - `titleInScreen` : l'écran DÉCLARE écrire son titre lui-même, et l'entête se
 *   tait pour ne pas en poser un second.
 */
const CUSTOMER_PAGE = join(SRC, 'components/page/CustomerPage.tsx')

/**
 * Les fichiers qui DÉFINISSENT la coque : ils écrivent `skipHeader` parce que
 * c'est le nom de leur propre prop, pas parce qu'un écran la demande. Les
 * confondre avec un appelant éteindrait l'entête pour tout le monde.
 */
const SHELL_DEFINITIONS = new Set([
  CUSTOMER_PAGE,
  join(SRC, 'components/page/CustomerPageContent.tsx'),
  join(SRC, 'components/page/SettingsPage.tsx'),
  join(SRC, 'components/page/BackofficePage.tsx'),
  ...CONDITIONAL_TITLE_SHELLS,
])

/**
 * Cet écran DÉCLARE-T-IL écrire son titre lui-même ? (`titleInScreen`)
 *
 * Les fichiers de la coque sont exclus : ils écrivent ce mot parce que c'est le
 * nom de LEUR prop, pas parce qu'un écran la passe.
 */
function screenDeclaresItsOwnTitle(closure: Set<string>): boolean {
  for (const file of closure) {
    if (SHELL_DEFINITIONS.has(file)) continue
    if (SOURCE.get(file)?.includes('titleInScreen')) return true
  }
  return false
}

/**
 * #2456 — L'ENTÊTE POSE-T-ELLE VRAIMENT LE TITRE MASQUÉ ? On le LIT, on ne le
 * suppose pas.
 *
 * C'est le point où une garde se met à mentir : elle MODÉLISE un comportement
 * de la coque, quelqu'un retire le comportement, et le modèle continue de dire
 * « conforme ». Les trois conditions sont donc relues dans le fichier lui-même —
 * la branche, la classe qui le cache, et le fait que ce soit bien un niveau 1.
 * Retirer le `sr-only` de `PageHeader` fait rougir l'INTERDIT en NOMMANT les
 * onze écrans qui en dépendent, pas un test de présence de chaîne.
 */
const PAGE_HEADER = join(SRC, 'components/layout/PageHeader.tsx')
const HEADER_NAMES_TABBED_SCREENS =
  SOURCE.get(PAGE_HEADER)!.includes('headerNamesItForScreenReaders') &&
  SOURCE.get(PAGE_HEADER)!.includes('sr-only') &&
  providesLevelOneHeading(SOURCE.get(PAGE_HEADER)!)

function headerNamesScreen(entry: string, url: string): boolean {
  const closure = renderedClosure(entry)
  if (!closure.has(CUSTOMER_PAGE)) return false
  for (const file of closure) {
    if (SHELL_DEFINITIONS.has(file)) continue
    const source = SOURCE.get(file)
    if (source && (source.includes('skipHeader') || source.includes('skipLayout'))) return false
  }
  // La seule façon de faire taire l'entête est de déclarer que l'écran s'en
  // charge — et c'est alors LUI qu'on exige.
  if (screenDeclaresItsOwnTitle(closure)) return false
  // Depuis la décision de Louis du 16/09/2026, l'entête nomme l'écran des deux
  // côtés : visiblement quand la barre d'onglets ne le fait pas, et pour les
  // seuls lecteurs d'écran quand elle le fait. Le second cas est CONDITIONNÉ au
  // code qu'on vient de lire. La garde LIT le registre de navigation
  // (`sectionForPath`), elle ne le recopie pas : deux chemins qui refont la
  // même dérivation divergent (GA-26).
  const tabsNameThePlace = (sectionForPath(url)?.section.tabs.length ?? 0) > 1
  return tabsNameThePlace ? HEADER_NAMES_TABBED_SCREENS : true
}

type Screen = { file: string; url: string; label: string }

/**
 * Une route qui ne déclare AUCUN composant n'est pas un écran : elle redirige
 * (`beforeLoad` + `redirect`). `/favorites` et `/knowledge` sont exactement
 * cela — deux adresses conservées pour ne pas casser un lien déjà partagé, qui
 * n'affichent jamais rien. Leur réclamer un titre serait accuser du code juste.
 */
function declaresAComponent(source: string): boolean {
  return /[A-Za-z]*[Cc]omponent\s*[:=]/.test(source)
}

const SCREENS: Screen[] = readdirSync(ROUTES, { recursive: true })
  .map(entry => join(ROUTES, String(entry)))
  .filter(file => file.endsWith('.tsx') && !file.includes('.test.') && statSync(file).isFile())
  .flatMap(file => {
    const url = routeUrl(file)
    if (url === null || !declaresAComponent(SOURCE.get(file)!)) return []
    return [{ file, url, label: file.slice(SRC.length + 1) }]
  })

/**
 * DEUX ADRESSES QUI NE SONT PAS DES ÉCRANS — nommées, jamais muettes.
 *
 * Elles déclarent bien un composant, donc `declaresAComponent` ne les écarte
 * pas ; mais ce composant n'affiche jamais d'interface. Leur demander un titre
 * serait accuser du code juste, et une garde qui accuse à tort se fait
 * désactiver dans la semaine.
 */
const NOT_A_SCREEN: Record<string, string> = {
  '/': "l'accueil ne rend qu'une redirection (`RedirectTo` vers l'écran de démarrage choisi dans Préférences) ; le titre appartient à l'écran d'arrivée",
  '/auth/callback':
    "écran de TRANSIT OAuth : il échange un jeton et redirige. Il n'affiche qu'un indicateur de chargement, ou un message d'erreur qui porte son propre titre",
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * LA DETTE EST SOLDÉE — et c'est pour cela qu'il n'y a pas de liste. // #2456
 * ─────────────────────────────────────────────────────────────────────────
 * Le premier relevé, le 16/09/2026, disait : 78 écrans, 62 conformes, **16 sans
 * titre**, dont quatorze qu'un lot seul ne pouvait pas payer — leur donner un
 * titre VISIBLE aurait répété le libellé de l'onglet actif, que la loi 4 du
 * tome 7 interdit de redire. Une liste d'exceptions NOMMÉE et datée les portait.
 *
 * Louis a tranché le même jour, sur l'option recommandée : l'entête pose un
 * titre de niveau 1 **réservé aux lecteurs d'écran** quand la barre d'onglets
 * nomme l'endroit. La loi 4 porte sur la répétition VISIBLE — elle n'est pas
 * re-litigée, et le trou qu'elle laissait est refermé d'un seul geste, à un
 * seul endroit (`PageHeader`). Les trois derniers écrans ont été traités un par
 * un : `/settings` et `/settings/mcp` avaient déjà leur titre à l'écran, rendu
 * en `<p>` et en `h2` ; `/search` est pleine page et a reçu le même titre
 * `sr-only` que l'entête.
 *
 * **La liste d'exceptions a donc disparu, parce qu'elle est vide — pas parce
 * qu'on a rétréci le corpus.** C'est ce que prouvent les deux tests « elle LIT »
 * et « le corpus n'est pas rétréci » : 78 écrans, deux seules adresses écartées,
 * chacune NOMMÉE avec sa raison dans `NOT_A_SCREEN`. Si un écran neuf arrive
 * sans titre, l'INTERDIT ci-dessous le NOMME.
 */
function screensWithoutTitle(provides: Map<string, boolean> = PROVIDES, maxDepth: number = MAX_DEPTH): string[] {
  return SCREENS.filter(screen => !(screen.url in NOT_A_SCREEN))
    .filter(screen => !headerNamesScreen(screen.file, screen.url))
    .filter(screen => levelOneHeadingSource(screen.file, provides, maxDepth) === null)
    .map(screen => screen.url)
}

describe('GA-347 — un titre de niveau 1 par écran', () => {
  const offenders = screensWithoutTitle()

  // Un INTERDIT, pas un cliquet : zéro exception, et l'échec NOMME l'écran.
  it('aucun écran sans titre de niveau 1', () => {
    expect(offenders).toEqual([])
  })

  it('le corpus n’est pas rétréci — deux adresses écartées, nommées, avec leur raison', () => {
    // La garde serait triviale si l'on pouvait sortir un écran gênant du
    // corpus. Les seules sorties sont ces deux-là, et chacune porte sa phrase.
    expect(Object.keys(NOT_A_SCREEN)).toEqual(['/', '/auth/callback'])
    for (const reason of Object.values(NOT_A_SCREEN)) expect(reason.length).toBeGreaterThan(40)
    // Et elles ne cachent rien : elles ne rendent aucune interface.
    for (const url of Object.keys(NOT_A_SCREEN)) {
      expect(SCREENS.some(screen => screen.url === url)).toBe(true)
    }
  })

  /**
   * PREUVE 1 — ELLE LIT QUELQUE CHOSE.
   * Une sonde à zéro élément rend un vert qui ne prouve rien : le relevé porte
   * donc ses comptes, et ils sont vérifiés.
   */
  it('elle LIT — 78 écrans parcourus, des milliers de fichiers, et ils sont TOUS conformes', () => {
    expect(SCREENS.length).toBeGreaterThanOrEqual(70)
    expect(FILES.length).toBeGreaterThan(1500)
    expect([...PROVIDES.values()].filter(Boolean).length).toBeGreaterThan(30)
    const conformant = SCREENS.filter(
      screen =>
        screen.url in NOT_A_SCREEN ||
        headerNamesScreen(screen.file, screen.url) ||
        levelOneHeadingSource(screen.file) !== null,
    )
    expect(conformant.length).toBe(SCREENS.length)
    // Les DEUX chemins servent : aucun n'est une branche morte.
    expect(SCREENS.filter(screen => levelOneHeadingSource(screen.file) !== null).length).toBeGreaterThan(20)
    expect(
      SCREENS.filter(
        screen => levelOneHeadingSource(screen.file) === null && headerNamesScreen(screen.file, screen.url),
      ).length,
    ).toBeGreaterThan(5)
    // `/discover`, l'écran de l'issue, est parcouru ET conforme.
    expect(SCREENS.map(screen => screen.url)).toContain('/discover')
    expect(offenders).not.toContain('/discover')
  })

  /**
   * PREUVE 2 — ELLE SAIT DIRE NON, EN NOMMANT L'ÉCRAN.
   *
   * Le geste a d'abord été fait POUR DE VRAI sur le disque : retirer
   * `element="h1"` de `Chat.tsx` (l'écran de `/chat`, celui que l'issue donne
   * pour témoin conforme) fait tomber **3 tests sur 10**, et le premier NOMME
   * l'écran plutôt que de compter — message relevé mot pour mot :
   *
   *   FAIL src/architecture/un-titre-de-niveau-1-par-ecran.test.ts
   *     > GA-347 — un titre de niveau 1 par écran
   *     > aucun écran sans titre de niveau 1, hors la dette NOMMÉE de #2456
   *   AssertionError: expected [ '/chat' ] to deeply equal []
   *   - Expected  + Received
   *   - []
   *   + [ "/chat", ]
   *
   * Les deux autres sont le cliquet (« expected 15 to be less than or equal to
   * 14 ») et cette preuve-ci. `Chat.tsx` a été remis en état juste après.
   *
   * Le test ci-dessous rejoue ce retrait à chaque exécution, sans toucher au
   * disque : c'est la version qui survit au lot.
   */
  it('sait dire NON — retirer le titre de l’écran de /chat la fait rougir, en NOMMANT /chat', () => {
    const chat = SCREENS.find(screen => screen.url === '/chat')
    expect(chat, 'l’écran /chat doit être dans le corpus, sinon la preuve ne prouve rien').toBeDefined()
    expect(offenders).not.toContain('/chat')

    const chatScreen = join(SRC, 'features/chat/view/Chat.tsx')
    expect(PROVIDES.get(chatScreen), 'Chat.tsx est bien ce qui donne son titre à /chat').toBe(true)

    const amputated = new Map(PROVIDES)
    amputated.set(chatScreen, false)
    expect(screensWithoutTitle(amputated)).toContain('/chat')
  })

  /**
   * PREUVE 3 — LE TÉMOIN : elle n'attrape pas ce qu'elle ne vise pas.
   *
   * `AccountDetailPage` n'a AUCUN `h1` dans son propre fichier — l'issue le
   * compte d'ailleurs parmi ses 39 candidats — et l'écran rend pourtant bien
   * « DEVOTEAM », par `AccountDetailHero.tsx` qu'il monte. C'est le cas exact
   * qu'une garde mono-fichier accuserait à tort.
   */
  it('TÉMOIN — le dossier de compte reçoit son titre d’un composant qu’il rend, et la garde le laisse passer', () => {
    const page = join(SRC, 'features/accounts/view/account-detail/view/AccountDetailPage.tsx')
    const hero = join(SRC, 'features/accounts/view/account-detail/components/AccountDetailHero.tsx')
    expect(existsSync(page)).toBe(true)
    // Le témoin n'aurait aucune valeur si le fichier de l'écran portait le titre.
    expect(PROVIDES.get(page)).toBe(false)
    expect(PROVIDES.get(hero)).toBe(true)
    expect(levelOneHeadingSource(page)).toBe(hero)
  })

  /**
   * Les deux pièges déjà payés par ce dépôt, tenus par un test plutôt que par
   * une bonne intention.
   */
  it('retire les commentaires avant de compter — un `<h1>` cité dans une doc ne compte pas', () => {
    expect(providesLevelOneHeading(stripComments('/* exemple : <h1>Titre</h1> */ <div />'))).toBe(false)
    expect(providesLevelOneHeading(stripComments('// on écrit <Text element="h1">\nconst a = 1'))).toBe(false)
    expect(providesLevelOneHeading(stripComments('<Text element="h1">Vrai</Text>'))).toBe(true)
  })

  it('ses expressions n’ont pas le drapeau `g` — `RegExp.test()` y serait STATEFUL', () => {
    for (const expression of [RAW_H1, ARIA_HEADING_FIRST, ARIA_LEVEL_FIRST]) {
      expect(expression.flags).not.toContain('g')
    }
    // La démonstration : deux appels de suite sur la MÊME chaîne doivent rendre
    // le même verdict. Avec `g`, le second rendrait `false`.
    expect(RAW_H1.test('<h1 class="x">')).toBe(true)
    expect(RAW_H1.test('<h1 class="x">')).toBe(true)
  })

  /**
   * #2456 (16/09/2026) — L'AUTRE FAÇON DE SE TROMPER : DEUX TITRES.
   *
   * Depuis que l'entête pose un titre `sr-only` sur toute section à onglets, un
   * écran qui écrit DÉJÀ le sien en recevrait un second — deux « titre de
   * niveau 1 » annoncés pour la même page, ce qui est un défaut au même titre
   * que zéro. La sortie est `titleInScreen`, et c'est ce test qui l'exige.
   */
  it('jamais DEUX titres — un écran qui écrit le sien déclare `titleInScreen`', () => {
    const doubled = SCREENS.filter(screen => !(screen.url in NOT_A_SCREEN))
      .filter(screen => headerNamesScreen(screen.file, screen.url) && levelOneHeadingSource(screen.file) !== null)
      .map(screen => screen.url)
    expect(doubled).toEqual([])
  })

  it('TÉMOIN du chemin masqué — /discover et /chat écrivent leur titre, et l’entête se tait', () => {
    for (const url of ['/discover', '/chat']) {
      const screen = SCREENS.find(candidate => candidate.url === url)
      expect(screen, `${url} doit être dans le corpus`).toBeDefined()
      // L'écran le porte lui-même…
      expect(levelOneHeadingSource(screen!.file)).not.toBeNull()
      // …et l'entête ne lui en pose pas un second. Les deux y arrivent par des
      // chemins DIFFÉRENTS, et c'est voulu : `/discover` le DÉCLARE
      // (`titleInScreen`, il est dans une section à onglets), `/chat` dessine
      // son propre chrome (`skipHeader`) et n'a donc aucune entête à faire
      // taire. Une garde qui n'accepterait qu'un seul des deux chemins
      // forcerait le second à déclarer une chose qui n'est pas vraie.
      expect(headerNamesScreen(screen!.file, screen!.url)).toBe(false)
    }
    // Et `/discover`, lui, passe bien par la déclaration.
    const discover = SCREENS.find(candidate => candidate.url === '/discover')!
    expect(screenDeclaresItsOwnTitle(renderedClosure(discover.file))).toBe(true)
  })

  /**
   * PREUVE 2 bis — LE NOUVEAU CHEMIN SAIT DIRE NON, LUI AUSSI. // #2456
   *
   * Geste fait POUR DE VRAI le 16/09/2026 : retirer le titre `sr-only` de
   * `PageHeader` (les deux endroits qui le rendent). **2 tests sur 12** tombent,
   * et le premier NOMME les onze écrans qui n'avaient que celui-là :
   *
   *   FAIL … > aucun écran sans titre de niveau 1
   *   AssertionError: expected [ '/expenses/bareme', …(10) ] to deeply equal []
   *   + [ "/expenses/bareme", "/missions/cessions", "/missions/encaissements",
   *       "/missions/facturation", "/missions/nouvelle", "/missions/paiements",
   *       "/pilotage/energie", "/pilotage/finance", "/pilotage/qualite",
   *       "/pilotage/rex", "/rfp" ]
   *
   * Le second est le test ci-dessous (`expected false to be true`), qui dit
   * POURQUOI. `PageHeader.tsx` a été remis en état juste après.
   */
  it('un titre MASQUÉ compte comme un titre — l’entête en pose un sur les sections à onglets', () => {
    expect(HEADER_NAMES_TABBED_SCREENS).toBe(true)
    // `/briefing` est une section à onglets qui n'écrit pas son titre : c'est
    // l'entête qui le lui donne, et la garde doit le compter conforme.
    expect(SCREENS.map(screen => screen.url)).toContain('/briefing')
    expect(screensWithoutTitle()).not.toContain('/briefing')
    // ⚠️ Et le verdict DÉPEND du code lu, il ne le suppose pas : onze écrans
    // n'ont d'autre titre que celui-là. C'est ce que compte cette ligne, et
    // c'est elle qui rend l'INTERDIT rouge si quelqu'un retire le `sr-only`.
    const dependents = SCREENS.filter(
      screen => !(screen.url in NOT_A_SCREEN) && levelOneHeadingSource(screen.file) === null,
    )
    expect(dependents.length).toBeGreaterThan(5)
  })

  it('la profondeur 6 SUFFIT — aller plus loin ne change pas le verdict', () => {
    // Le nombre n'est pas choisi, il est mesuré : le verdict se stabilise, et
    // parcourir jusqu'à 20 crans (bien au-delà de l'arbre réel) rend la même
    // liste. Sans ce test, « 6 » serait une opinion, et une garde trop courte
    // accuserait un écran dont le titre vit juste un cran plus bas.
    expect(screensWithoutTitle(PROVIDES, 20)).toEqual(screensWithoutTitle())
    expect(screensWithoutTitle(PROVIDES, 6)).toEqual(screensWithoutTitle(PROVIDES, 5))
    // Et elle est nécessaire : à profondeur 1, l'écran seul ne suffit pas —
    // c'est la preuve que le parcours SERT, et n'est pas une décoration.
    expect(screensWithoutTitle(PROVIDES, 1).length).toBeGreaterThan(screensWithoutTitle().length)
  })

  it('l’entête de page ne compte jamais comme fournisseur — son titre est conditionnel', () => {
    const pageHeader = join(SRC, 'components/layout/PageHeader.tsx')
    // Elle en PORTE bien un : si ce n'était plus vrai, l'exclusion ci-dessous
    // ne garderait plus rien et la garde deviendrait trop gourmande en silence.
    expect(providesLevelOneHeading(SOURCE.get(pageHeader)!)).toBe(true)
    expect(PROVIDES.get(pageHeader)).toBe(false)
  })
})
