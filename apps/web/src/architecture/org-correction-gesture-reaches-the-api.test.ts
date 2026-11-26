import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-112 — corriger un organigramme est un GESTE, pas une route.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FERME, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Le 30/08/2026, sur `origin/main` :
 *
 *     grep -rn "org-graph" apps/web/src            → 0
 *     grep -rn "expectedGraphVersion" apps/web     → 0
 *
 * pendant que `OrgGraphController` montait trois routes — `PATCH`, `POST …/revert`,
 * `GET …/corrections` — avec verrou optimiste, 409 porteur de diff, entité,
 * migration, contrats et trois fichiers de tests. Du code juste, calculé, testé,
 * que personne n'appelle : le défaut n°1 de ce dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE — ET CE QU'ELLE REFUSE DE VÉRIFIER
 * ─────────────────────────────────────────────────────────────────────────
 * Elle suit la CHAÎNE, du clic à l'appel HTTP :
 *
 *     carte d'une personne (FocalOrgView)
 *        → OrgCorrectionDrawer, monté avec le compte et le graphe
 *        → useCorrectOrgPerson, APPELÉ (pas seulement importé)
 *        → apiFetch PATCH /accounts/:id/org-graph/corrections + expectedGraphVersion
 *
 * Une garde qui se contenterait de constater « le panneau existe » serait
 * BORGNE : c'est exactement l'état d'avant. Ce dépôt en a produit sept en trois
 * jours, toutes vertes sur du code mort.
 *
 * ⚠️ **Les imports et les commentaires sont RETIRÉS avant de chercher.** Un
 * symbole cité dans un docbloc ou importé sans être appelé n'est pas un
 * appelant — et c'est précisément la confusion qui rendrait cette garde
 * inutile. Le contrôle négatif en bas le prouve.
 *
 * ⚠️ **Aucun `RegExp` avec le drapeau `g` n'est réutilisé** : `.test()` est
 * alors STATEFUL et rend un résultat sur deux. Défaut déjà payé ici.
 */

const WEB = join(__dirname, '..')
const CORRECTIONS = join(WEB, 'features/accounts/view/account-detail/tabs/organigramme/corrections')
const ORGANIGRAMME = join(WEB, 'features/accounts/view/account-detail/tabs/organigramme')
const TABS = join(WEB, 'features/accounts/view/account-detail/tabs')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

/** Le source SANS ses commentaires ni ses lignes d'import. */
function executable(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const withoutLines = withoutBlocks.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  return withoutLines
    .split('\n')
    .filter(line => !/^\s*import\s/.test(line) && !/^\s*}\s*from\s/.test(line))
    .join('\n')
}

/**
 * Le symbole est-il APPELÉ (ou monté en JSX), et pas seulement nommé ?
 *
 * ⚠️ Le groupe `(<[^()]*>)?` n'est pas décoratif : `apiFetch<{ items: … }>({…})`
 * porte ses paramètres de type ENTRE le nom et la parenthèse. Sans lui, la
 * garde a rendu `false` sur l'appel le plus important de la chaîne — un faux
 * négatif, donc une garde qui aurait crié au meurtre sur du code vivant.
 */
function isCalled(source: string, symbol: string): boolean {
  const body = executable(source)
  return new RegExp(`${symbol}\\s*(<[^()]*>)?\\s*\\(`).test(body) || new RegExp(`<${symbol}[\\s/>]`).test(body)
}

const focal = read(join(ORGANIGRAMME, 'FocalOrgView.tsx'))
const tab = read(join(TABS, 'TabOrganigramme.tsx'))
const drawer = read(join(CORRECTIONS, 'OrgCorrectionDrawer.tsx'))
const history = read(join(CORRECTIONS, 'OrgCorrectionsHistory.tsx'))
const hooks = read(join(CORRECTIONS, 'useOrgCorrections.ts'))

describe('GA-112 — le corpus n’est pas vide', () => {
  it('les cinq fichiers de la chaîne existent et portent du code', () => {
    for (const [name, source] of Object.entries({ focal, tab, drawer, history, hooks })) {
      expect(source.length, name).toBeGreaterThan(500)
      expect(executable(source).length, name).toBeGreaterThan(200)
    }
  })
})

describe('GA-112 — la chaîne du clic jusqu’à l’appel HTTP', () => {
  it('1. la carte d’une personne porte le geste, avec le compte ET le graphe', () => {
    expect(isCalled(focal, 'OrgCorrectionDrawer')).toBe(true)
    // Sans `graph`, le tiroir ne connaît ni la version attendue ni les entités
    // et les personnes parmi lesquelles choisir : il ne pourrait rien envoyer.
    const mount = focal.slice(focal.indexOf('<OrgCorrectionDrawer'))
    expect(mount).toContain('graph={graph}')
    expect(mount).toContain('accountId={accountId}')
  })

  it('2. le tiroir APPELLE le hook d’écriture — il ne fait pas que l’importer', () => {
    expect(isCalled(drawer, 'useCorrectOrgPerson')).toBe(true)
    // Et il déclenche réellement la mutation depuis un geste.
    expect(executable(drawer)).toContain('.mutate(')
  })

  it('3. l’écriture part en PATCH sur la route du ledger, avec le verrou', () => {
    const body = executable(hooks)
    expect(body).toContain('/org-graph/corrections')
    expect(body).toContain("method: 'PATCH'")
    expect(isCalled(hooks, 'apiFetch')).toBe(true)
    // Le verrou n'est pas un ornement : il voyage dans le corps de la requête,
    // construit à partir du graphe affiché.
    expect(executable(drawer)).toContain('expectedGraphVersion: graph.graphVersion')
  })

  it('4. l’historique est LU, et l’annulation passe par la même porte', () => {
    expect(isCalled(tab, 'OrgCorrectionsHistory')).toBe(true)
    expect(isCalled(history, 'useOrgCorrectionHistory')).toBe(true)
    expect(isCalled(history, 'useRevertOrgCorrection')).toBe(true)
    const body = executable(hooks)
    expect(body).toContain('/revert')
    expect(body).toContain("method: 'POST'")
    expect(body).toContain('expectedGraphVersion')
  })

  it('5. le geste ne s’accroche PAS à `person.reporting` — il serait né mort', () => {
    // Depuis le correctif P0, le pipeline ne produit plus aucune arête
    // `reports_to` : `person.reporting` est toujours `null` sur un dossier issu
    // de l'analyse (mesuré : `cartes: 2 | avec reporting: 0`). Le bouton
    // « vérifier ce lien » en dépend et ne se rend donc jamais. Poser la
    // correction sur la même condition la tuerait de la même façon.
    const mount = focal.slice(focal.indexOf('<OrgCorrectionDrawer'))
    const guardLine = focal.slice(0, focal.indexOf('<OrgCorrectionDrawer')).split('\n').slice(-4).join('\n')
    expect(mount).not.toContain('person.reporting')
    expect(guardLine).not.toContain('person.reporting')
  })
})

describe('GA-112 — le détecteur sait dire NON', () => {
  it('un symbole seulement IMPORTÉ n’est pas un appelant', () => {
    const source = `import { useCorrectOrgPerson } from './useOrgCorrections'\nexport function X() { return null }\n`
    expect(isCalled(source, 'useCorrectOrgPerson')).toBe(false)
  })

  it('un symbole seulement CITÉ dans un commentaire n’est pas un appelant', () => {
    const source = `/** On pourrait appeler useCorrectOrgPerson(accountId) ici. */\nexport const X = 1\n`
    expect(isCalled(source, 'useCorrectOrgPerson')).toBe(false)
    const line = `// <OrgCorrectionDrawer accountId={id} />\nexport const Y = 2\n`
    expect(isCalled(line, 'OrgCorrectionDrawer')).toBe(false)
  })

  it('un appel réel et un montage JSX réel sont reconnus', () => {
    expect(isCalled('const m = useCorrectOrgPerson(accountId)', 'useCorrectOrgPerson')).toBe(true)
    expect(isCalled('return <OrgCorrectionDrawer accountId={id} />', 'OrgCorrectionDrawer')).toBe(true)
    // Un appel GÉNÉRIQUE en est un aussi — c'est la forme de tous les appels
    // HTTP du dépôt, et la première version de cette garde la ratait.
    expect(isCalled('await apiFetch<{ items: Row[] }>({ path })', 'apiFetch')).toBe(true)
  })

  it('le détecteur n’est pas STATEFUL — deux appels de suite rendent la même chose', () => {
    const source = 'const m = useCorrectOrgPerson(accountId)'
    expect(isCalled(source, 'useCorrectOrgPerson')).toBe(isCalled(source, 'useCorrectOrgPerson'))
  })
})
