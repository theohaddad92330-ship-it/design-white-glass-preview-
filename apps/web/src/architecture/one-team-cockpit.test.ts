import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative as pathRelative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-254 — IL N'Y A QU'UN COCKPIT D'ÉQUIPE, ET C'EST `/team`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ LE 04/09/2026 (#1457, #1458, #1459)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le produit portait DEUX cockpits d'équipe, et c'est le mauvais qui s'affichait.
 *
 *  · Le vrai : `features/manager/view/ManagerDashboardPage.tsx`, dix-sept blocs
 *    tous branchés, rendu par la seule route `routes/team/index.tsx`, derrière
 *    `PlanFeatureRoute feature="manager_cockpit"`. Sa donnée vient de
 *    `GET /manager/team-stats`, qui porte `@RequirePermission('team:manage')` +
 *    `WorkspacePermissionGuard`, doublé côté service.
 *
 *  · Le second : un onglet « Équipe » sur `/dashboard` qui rendait un cockpit
 *    parallèle nourri par `GET /dashboard/kpis` et `GET /dashboard/roi` — deux
 *    routes qui servaient des agrégats d'ESPACE en ne portant QUE `JwtGuard`.
 *    Mesuré : zéro occurrence de `team:manage` dans tout `features/dashboard/`.
 *    L'onglet n'était gardé par RIEN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE, ET PAS SEULEMENT LE RETRAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retrait seul se refait : un second cockpit s'ajoute toujours « à côté »,
 * additivement, sans que personne ne relise la porte de celui qui existe déjà.
 * C'est exactement ce que disait le commentaire de l'onglet supprimé — « the
 * original cockpit, unchanged, now living under the "Équipe" tab ».
 *
 * ⚠️ `src/test/nav-gates-on-permission.test.ts` ne pouvait pas l'attraper, et
 * elle le DIT dans son propre docblock : elle ne vise que la NAVIGATION. Un
 * écran atteint par un onglet n'a pas d'entrée de menu à cacher. C'est ce trou
 * que cette garde ferme, sur l'axe des ÉCRANS et de leur porte de données.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE LAISSE PASSER
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Un seul fichier REND `<ManagerDashboardPage`, et c'est la route `/team`.
 *  2. Cette route le garde derrière la capacité de palier `manager_cockpit`.
 *  3. La porte de données d'équipe (`useManagerStats` / `managerApi`) n'est
 *     importée que depuis `features/manager` — aucun second écran ne se nourrit
 *     tout seul de statistiques d'équipe.
 *  4. `features/dashboard` n'appelle qu'une porte `/dashboard/…`, la PERSONNELLE
 *     (`/dashboard/me`), et n'appelle aucune porte `/manager/…`.
 *
 * Elle ne dit RIEN de ce que `/team` affiche, ni de la forme du cockpit
 * personnel : ce n'est pas une garde de design. Elle ne lit que des positions
 * d'appel d'API (`path: '…'`), jamais une destination de navigation
 * (`to: '/dashboard'`) — un lien vers le tableau de bord reste libre.
 *
 * ⚠️ Numéro : GA-253 était le plus haut du dépôt au 04/09/2026. Plusieurs lots
 * écrivant en parallèle, une collision reste possible et se corrige par un
 * renommage, jamais par la suppression d'une garde.
 */

const WEB_SRC = join(__dirname, '..')

/** Le fichier qui rend le cockpit d'équipe, et le seul qui a le droit de le rendre. */
const TEAM_ROUTE = join('routes', 'team', 'index.tsx')
/** La racine où vit le cockpit d'équipe — et la seule qui lit sa porte de données. */
const MANAGER_ROOT = join('features', 'manager')
/** La racine du tableau de bord personnel : elle ne lit QUE la porte personnelle. */
const DASHBOARD_ROOT = join('features', 'dashboard')
/** La seule porte `/dashboard/…` que le tableau de bord a le droit d'appeler. */
const PERSONAL_DOOR = '/dashboard/me'

function relative(file: string): string {
  return pathRelative(WEB_SRC, file)
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // Les gardes elles-mêmes CITENT les chemins qu'elles surveillent : les
      // lire ferait de chaque garde son propre contrevenant.
      if (entry === 'architecture') continue
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (entry === 'routeTree.gen.ts') continue
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/** Retire commentaires de bloc et commentaires de ligne — un chemin cité dans
 *  un docblock n'est pas un appel. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/** Les chemins d'API réellement APPELÉS par un fichier : `path: '/x/y'`.
 *  Une destination de navigation (`to: '/dashboard'`) n'est pas un appel. */
function apiPaths(source: string): string[] {
  // ⚠️ Une RegExp `g` est STATEFUL : on en crée une NEUVE à chaque appel.
  return [...stripComments(source).matchAll(/\bpath:\s*'([^']+)'/g)].map(match => match[1] as string)
}

const files = sourceFiles(WEB_SRC)
const bodies = new Map(files.map(file => [file, readFileSync(file, 'utf8')]))

describe('GA-254 — le corpus lu par la garde', () => {
  it('lit un corpus non vide, et les quatre fichiers dont elle parle', () => {
    // Une garde dont le corpus se vide passe au vert sans rien lire. On ancre
    // donc sur des fichiers dont la disparition doit CASSER la garde.
    expect(files.length).toBeGreaterThan(300)
    const seen = files.map(relative)
    expect(seen).toContain(join(MANAGER_ROOT, 'view', 'ManagerDashboardPage.tsx'))
    expect(seen).toContain(join(DASHBOARD_ROOT, 'view', 'DashboardContent.tsx'))
    expect(seen).toContain(join(DASHBOARD_ROOT, 'api.ts'))
    expect(seen).toContain(TEAM_ROUTE)
  })

  it('trouve réellement des appels d’API dans le tableau de bord', () => {
    // Sans cette assertion, la règle n°4 serait vraie pour une MAUVAISE raison :
    // « aucun chemin interdit » est vrai aussi quand plus aucun chemin n'est lu.
    const called = files
      .filter(file => relative(file).startsWith(DASHBOARD_ROOT))
      .flatMap(file => apiPaths(bodies.get(file) as string))
    expect(called).toContain(PERSONAL_DOOR)
  })

  it('lit un chemin d’appel sans confondre avec une destination de navigation', () => {
    expect(apiPaths("apiFetch({ path: '/dashboard/me' })")).toEqual([PERSONAL_DOOR])
    expect(apiPaths("navigate({ to: '/dashboard' })")).toEqual([])
    expect(apiPaths("// path: '/dashboard/kpis'")).toEqual([])
    expect(apiPaths("/** path: '/dashboard/kpis' */")).toEqual([])
    // Deux appels dans le même fichier : la RegExp `g` ne doit pas en sauter un.
    expect(apiPaths("path: '/a'\npath: '/b'")).toEqual(['/a', '/b'])
  })
})

describe('GA-254 — un seul écran rend le cockpit d’équipe', () => {
  it('`ManagerDashboardPage` n’est rendu que par la route `/team`', () => {
    const renderers = files
      .filter(file => /<ManagerDashboardPage\b/.test(stripComments(bodies.get(file) as string)))
      .map(relative)
    expect(renderers).toEqual([TEAM_ROUTE])
  })

  it('la route `/team` garde le cockpit derrière la capacité de palier', () => {
    const route = bodies.get(join(WEB_SRC, TEAM_ROUTE))
    expect(route, `${TEAM_ROUTE} introuvable`).toBeDefined()
    expect(route).toContain('PlanFeatureRoute')
    expect(route).toContain('manager_cockpit')
  })

  it('la porte de données d’équipe n’est lue que depuis `features/manager`', () => {
    const readers = files
      .filter(file => /\b(useManagerStats|managerApi)\b/.test(stripComments(bodies.get(file) as string)))
      .map(relative)
    expect(readers.length).toBeGreaterThan(0)
    expect(readers.filter(file => !file.startsWith(MANAGER_ROOT))).toEqual([])
  })
})

describe('GA-254 — le tableau de bord n’ouvre que la porte personnelle', () => {
  it('aucun écran du tableau de bord n’appelle une porte d’équipe', () => {
    const offenders: string[] = []
    for (const file of files) {
      const name = relative(file)
      if (!name.startsWith(DASHBOARD_ROOT)) continue
      for (const path of apiPaths(bodies.get(file) as string)) {
        const isTeamDoor = path.startsWith('/manager') || (path.startsWith('/dashboard') && path !== PERSONAL_DOOR)
        if (isTeamDoor) offenders.push(`${name} — ${path}`)
      }
    }
    expect(
      offenders,
      [
        'Un écran de `features/dashboard` appelle une porte de données d’ÉQUIPE.',
        'Le tableau de bord est mono-vue « Moi » depuis le 04/09/2026 : le cockpit',
        'd’équipe vit sur `/team`, derrière `team:manage`. Une porte d’équipe rendue',
        'ici serait servie à quiconque a un jeton — c’était le défaut de #1457.',
      ].join('\n'),
    ).toEqual([])
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════
 * LA RÈGLE GÉNÉRALE — #2108 / #2208, arbitrage de Louis du 16/09/2026
 * ═════════════════════════════════════════════════════════════════════════
 *
 * **UNE LECTURE AGRÉGÉE VIT SUR UNE ROUTE ; LA PAGE D'ARRIVÉE N'EN PORTE QUE
 * L'ACCROCHE.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EST ÉCRITE ICI, ET PAS AILLEURS
 * ─────────────────────────────────────────────────────────────────────────
 * GA-254, juste au-dessus, a posé la réponse pour l'ÉQUIPE : un seul cockpit,
 * et c'est `/team`. Elle a été RE-LITIGÉE onze fois en une journée, et le
 * 16/09/2026 la même question est revenue d'un cran plus haut : #2108
 * demandait un persona Dirigeant sur la page d'arrivée (Revenu, Risque,
 * Adoption, Cash, Décisions structurantes) pendant que #2208 demandait de lire
 * le pilotage sur `/pilotage`. Les deux livrés, le même contenu aurait existé
 * deux fois, sous deux formes, et personne n'aurait su lequel fait foi.
 *
 * Écrire la règle au SINGULIER — « pas de second cockpit d'équipe » — c'est ce
 * qui la fait re-litiger à chaque nouveau persona. Écrite ici au général, elle
 * répond d'avance au quatrième cockpit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'EST UNE ACCROCHE, ET CE QU'ELLE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Une accroche porte AU PLUS TROIS chiffres et UN lien vers la route qui
 * porte la lecture. Elle lit la MÊME porte que cette route (jamais une porte
 * parallèle, jamais un second agrégat côté serveur), derrière la MÊME
 * capacité. Au-delà, ce n'est plus une accroche : c'est un second cockpit, et
 * il se supprime.
 *
 * #2108.1 (« conserver la même architecture quel que soit le rôle ») devient
 * une réponse : oui — ce qui change par rôle, ce sont les PORTES ouvertes, pas
 * la page.
 *
 * ⚠️ Ce que cette garde NE dit pas : ce que l'accroche affiche, ni sa forme.
 * Le contenu est tenu ailleurs — `features/pilotage/accroche.ts` et son test :
 * trois seaux qui s'ADDITIONNENT, « non mesuré » NOMMÉ, et `null` (donc rien
 * d'affiché) tant que la chaîne n'a pas été lue. Une garde protège une règle,
 * elle ne l'invente pas.
 */

/** La route qui porte la LECTURE agrégée du pilotage. */
const PILOTAGE_ROUTE = join('routes', 'pilotage', 'index.tsx')
/** L'accroche que la page d'arrivée a le droit de rendre, et la seule. */
const ACCROCHE = join('features', 'pilotage', 'view', 'PilotageAccroche.tsx')
/** La porte de données de la chaîne de pilotage — une seule, partagée. */
const PILOTAGE_DOOR = '/pilotage/chain'
/** Au-delà, ce n'est plus une accroche. */
const MAX_FIGURES = 3

/** Les destinations de navigation d'un fichier : `to="/x"` ou `to: '/x'`. */
function linkTargets(source: string): string[] {
  const body = stripComments(source)
  return [
    ...[...body.matchAll(/\bto=['"](\/[^'"]*)['"]/g)].map(match => match[1] as string),
    ...[...body.matchAll(/\bto:\s*'(\/[^']*)'/g)].map(match => match[1] as string),
  ]
}

describe('#2108 / #2208 — une lecture agrégée vit sur UNE route, la page d’arrivée n’en porte que l’accroche', () => {
  it('LIT les deux fichiers dont elle parle — sinon elle est verte sans rien lire', () => {
    const seen = files.map(relative)
    expect(seen).toContain(PILOTAGE_ROUTE)
    expect(seen).toContain(ACCROCHE)
    expect(seen).toContain(join(DASHBOARD_ROOT, 'view', 'DashboardContent.tsx'))
  })

  it('un seul écran REND la lecture du pilotage, et c’est la route `/pilotage`', () => {
    const renderers = files
      .filter(file => /<PilotagePage\b/.test(stripComments(bodies.get(file) as string)))
      .map(relative)
    expect(renderers).toEqual([PILOTAGE_ROUTE])
  })

  it('l’accroche lit la MÊME porte que la route qui porte la lecture', () => {
    const source = bodies.get(join(WEB_SRC, ACCROCHE)) as string
    expect(source).toBeDefined()
    // Elle n'appelle AUCUNE porte à elle : elle passe par `pilotageApi.chain`,
    // le même appelant que l'écran. Une porte écrite ici serait un second
    // agrégat, et deux agrégats de la même chaîne divergent.
    expect(apiPaths(source)).toEqual([])
    expect(stripComments(source)).toContain('pilotageApi.chain')
    const api = bodies.get(join(WEB_SRC, 'features', 'pilotage', 'api.ts')) as string
    expect(apiPaths(api)).toContain(PILOTAGE_DOOR)
  })

  it('l’accroche est gardée par la MÊME capacité que la route — la porte change, pas la page', () => {
    const source = stripComments(bodies.get(join(WEB_SRC, ACCROCHE)) as string)
    // Théo D (22/10/2026) : la route `/pilotage` s'ouvre à tous, le palier se lit DANS la page, section par
    // section — c'est donc le fichier de la page qui porte la capacité, plus celui de la route.
    const route = stripComments(bodies.get(join(WEB_SRC, 'features', 'pilotage', 'view', 'PilotagePage.tsx')) as string)
    expect(route).toContain('manager_cockpit')
    expect(source).toContain('manager_cockpit')
  })

  it('l’accroche reste une ACCROCHE : au plus trois chiffres, et UN lien vers la lecture', () => {
    const source = bodies.get(join(WEB_SRC, ACCROCHE)) as string
    const figures = [...stripComments(source).matchAll(/\bkey:\s*'(\w+)',\s*value:/g)]
    expect(figures.length).toBeGreaterThan(0)
    expect(figures.length).toBeLessThanOrEqual(MAX_FIGURES)
    expect(linkTargets(source)).toEqual(['/pilotage'])
  })

  it('la page d’arrivée ne rend AUCUN autre écran de pilotage que l’accroche', () => {
    const offenders: string[] = []
    for (const file of files) {
      const name = relative(file)
      if (!name.startsWith(DASHBOARD_ROOT)) continue
      const body = stripComments(bodies.get(file) as string)
      for (const match of body.matchAll(/<(Pilotage\w+)\b/g)) {
        if (match[1] !== 'PilotageAccroche') offenders.push(`${name} — <${match[1] as string}`)
      }
    }
    expect(
      offenders,
      [
        'Un écran de `features/dashboard` rend une LECTURE de pilotage.',
        'La page d’arrivée n’en porte que l’ACCROCHE (#2108 / #2208, 16/09/2026) :',
        'trois chiffres et un lien. Un second cockpit se refait toujours,',
        'additivement — c’est ce que GA-254 dit juste au-dessus.',
      ].join('\n'),
    ).toEqual([])
  })

  it('sait dire NON : un quatrième chiffre, ou un second lien, est vu', () => {
    const quatre = "key: 'a', value: 1 key: 'b', value: 2 key: 'c', value: 3 key: 'd', value: 4"
    expect([...quatre.matchAll(/\bkey:\s*'(\w+)',\s*value:/g)].length).toBeGreaterThan(MAX_FIGURES)
    expect(linkTargets('<Link to="/pilotage" /><Link to="/team" />')).toEqual(['/pilotage', '/team'])
  })

  it('n’attrape PAS ce qu’elle ne vise pas — un lien cité en commentaire reste vert (témoin)', () => {
    expect(linkTargets('/** <Link to="/team" /> */')).toEqual([])
    expect(linkTargets("// navigate({ to: '/team' })")).toEqual([])
  })
})
