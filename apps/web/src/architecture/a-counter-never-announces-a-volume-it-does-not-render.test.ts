/**
 * #4770.2 — un compteur n'annonce jamais un volume qui ne vient pas de la collection RENDUE.
 *
 * MESURÉ : la puce « Tous » annonçait 69 773 contacts pour un répertoire de 1 010 (#4770, corrigé pour les
 * seuls contacts, #4770.4). Aucune garde ne portait sur la FAMILLE : le même défaut pouvait revenir sur chaque
 * onglet, chaque puce, chaque en-tête.
 *
 * CE QU'ELLE LIT — un compteur est un attribut JSX `count`, `counts`, `total` ou `<x>Count` / `<x>Total` dont la
 * valeur est une expression (les features contacts, consultants, discover, chat, accounts). Chacun est rangé :
 *   - `collection` : la valeur se lit sur la collection en main (`.length`, `.size`, un littéral, `undefined`) ;
 *   - sinon l'expression DOIT être déclarée dans `DECLARED` avec ce qu'elle compte et d'où vient le chiffre ;
 *   - une expression ni lisible ni déclarée est un défaut : le chiffre vient d'on ne sait où.
 * `FOREIGN_POPULATION` refuse en plus, même déclaré, un nom qui désigne un référentiel plutôt que la collection.
 *
 * CE QU'ELLE NE VISE PAS : un nombre qui ne décrit pas une collection rendue (pages, filtres, sélection) n'est pas
 * un défaut — il se déclare `not-a-collection`, avec sa raison, il n'est pas refusé.
 *
 * ⚠️ « 0 inspecté » est un ÉCHEC : une garde qui ne lit rien est verte pour toujours. Le nombre inspecté est
 * rendu, et il a un plancher (cliquet : il monte avec les écrans, il ne descend pas).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const FEATURES = join(__dirname, '..', 'features')
const SCOPE = ['contacts', 'consultants', 'discover', 'chat', 'accounts']

type Kind = 'collection' | 'server-same-query' | 'derived-from-rendered' | 'not-a-collection'

/** Une expression non lisible sur la collection : ce qu'elle compte, et pourquoi ce n'est pas un volume étranger. */
export const DECLARED: Readonly<Record<string, { kind: Kind; of: string }>> = {
  'archiveReport.archivedCount': {
    kind: 'server-same-query',
    of: 'fiches archivées par le geste en cours (rapport du geste)',
  },
  classifiedContactsCount: { kind: 'derived-from-rendered', of: 'contacts classés de l’organigramme rendu' },
  complementarityUnknownCount: {
    kind: 'derived-from-rendered',
    of: 'résultats Découvrir listés dont la complémentarité est inconnue',
  },
  expertiseUnknownCount: {
    kind: 'derived-from-rendered',
    of: 'résultats Découvrir listés dont l’expertise est inconnue',
  },
  observedClientsUnknownCount: {
    kind: 'derived-from-rendered',
    of: 'résultats Découvrir listés sans clients observés',
  },
  completedCount: { kind: 'derived-from-rendered', of: 'comptes de la liste rendue au statut terminé' },
  opportunityCount: { kind: 'derived-from-rendered', of: 'comptes de la liste rendue en opportunité' },
  contactsWithoutEmailCount: {
    kind: 'derived-from-rendered',
    of: 'contacts du compte rendu sans e-mail (verdict de la liste)',
  },
  count: {
    kind: 'derived-from-rendered',
    of: 'passe-plat d’un composant de puce : la valeur est celle de l’appelant, gardée là-bas',
  },
  crmCount: { kind: 'server-same-query', of: 'comptes CRM de l’espace (compteurs serveur de la liste de comptes)' },
  importedCount: {
    kind: 'server-same-query',
    of: 'comptes importés de l’espace (compteurs serveur de la liste de comptes)',
  },
  'counters?.crm': {
    kind: 'server-same-query',
    of: 'comptes CRM de l’espace (compteurs serveur de la liste de comptes)',
  },
  'counters?.imported': {
    kind: 'server-same-query',
    of: 'comptes importés de l’espace (compteurs serveur de la liste de comptes)',
  },
  'perimeterView?.outside_perimeter_count ?? null': {
    kind: 'server-same-query',
    of: 'contacts du compte hors des zones d’entité du lecteur (compteur serveur de la MÊME requête que la liste, #4984)',
  },
  networkCounts: { kind: 'server-same-query', of: 'contacts de la MÊME requête que la liste (#4527.1)' },
  recommendedCounts: { kind: 'server-same-query', of: 'total paginé de la portée active + tally d’ESPACE (#4770.4)' },
  viewCounts: { kind: 'derived-from-rendered', of: 'lignes chargées du répertoire par vue' },
  resultTypeCounts: { kind: 'derived-from-rendered', of: 'résultats Découvrir listés par type' },
  favoriteCount: { kind: 'derived-from-rendered', of: 'fiches du vivier chargées marquées favorites' },
  hiddenSelectedCount: { kind: 'derived-from-rendered', of: 'contacts sélectionnés hors de la vue rendue' },
  'partner.market_observation_count': {
    kind: 'not-a-collection',
    of: 'observations du marché sur CE partenaire : une mesure de la fiche rendue',
  },
  nextCount: { kind: 'derived-from-rendered', of: 'lignes encore à révéler dans la liste rendue' },
  offerCount: { kind: 'derived-from-rendered', of: 'offres cochées sur les comptes rendus' },
  pageCount: {
    kind: 'not-a-collection',
    of: 'nombre de pages ou de lignes de la page rendue : ne décrit pas un volume',
  },
  portfolioCount: { kind: 'server-same-query', of: 'total paginé de la liste de comptes de l’espace' },
  remainingCount: { kind: 'derived-from-rendered', of: 'contacts de la sélection moins ceux visibles' },
  'infiniteData?.pages[0]?.pagination.totalItems': {
    kind: 'server-same-query',
    of: 'total paginé de la requête rendue',
  },
  total: { kind: 'server-same-query', of: 'total paginé de la requête rendue, ou longueur de la liste de l’appelant' },
  'selectAll.proposal?.total': {
    kind: 'server-same-query',
    of: 'total de la proposition « tout sélectionner » de la même requête',
  },
  'stats.total': { kind: 'server-same-query', of: 'fiches du vivier de l’espace (même population que la liste)' },
  totalContacts: { kind: 'server-same-query', of: 'total paginé de la requête de la liste (useContactsListData)' },
  'displayed.interest.total': {
    kind: 'not-a-collection',
    of: 'axes d’un score : le dénominateur du score, pas une collection',
  },
  'displayed.penetrability.total': {
    kind: 'not-a-collection',
    of: 'axes d’un score : le dénominateur du score, pas une collection',
  },
  'countPortfolioFilters(dialogValues)': { kind: 'not-a-collection', of: 'filtres posés, pas des lignes' },
}

/** Un nom qui désigne un référentiel (le marché, le catalogue) et non la collection rendue : refusé même déclaré. */
const FOREIGN_POPULATION = /referential|referentiel|catalog|market(Total|Count)|global(Count|Total)|allWorkspaces/i

const COUNTER_ATTR = /^\s+(count|counts|total|[a-z][A-Za-z]*(?:Count|Counts|Total))=\{(.*)\}\s*$/

/** La valeur se lit sur la collection en main : `.length`, `.size`, littéral, `undefined`/`null`, ou une combinaison. */
function readsTheCollection(expr: string): boolean {
  // Un objet `{ a: x.length, b: y.length }` : chaque valeur doit se lire ; une condition de ternaire n'est pas une valeur.
  const obj = /^\{\s*(.*?)\s*\}$/.exec(expr)
  if (obj) return obj[1].split(',').every(kv => readsTheCollection(kv.slice(kv.indexOf(':') + 1)))
  const branches = expr.includes(' ? ') ? expr.slice(expr.indexOf(' ? ') + 3) : expr
  const parts = branches
    .split(/\s\?\s|\s:\s|\s\+\s/)
    .map(p => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return false
  return parts.every(
    p =>
      /\.(length|size)$/.test(p) ||
      /^\d+$/.test(p) ||
      p === 'undefined' ||
      p === 'null' ||
      (/^[a-z]\w*$/i.test(p) && /^(hasNextPage|totalKnown|expanded|othersOpened)$/.test(p)),
  )
}

export type Verdict = { kind: 'collection' | Kind | 'refused'; why?: string }

export function judgeCounter(expr: string): Verdict {
  const e = expr.trim()
  if (FOREIGN_POPULATION.test(e))
    return { kind: 'refused', why: 'volume d’un référentiel, pas de la collection rendue' }
  if (readsTheCollection(e)) return { kind: 'collection' }
  const declared = DECLARED[e]
  if (declared) return { kind: declared.kind }
  return { kind: 'refused', why: 'chiffre ni lisible sur la collection ni déclaré' }
}

type Found = { file: string; line: number; attr: string; expr: string }

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) out.push(p)
  }
  return out
}

export function findCounters(source: string, file = 'fixture.tsx'): Found[] {
  const found: Found[] = []
  source.split('\n').forEach((text, i) => {
    const m = COUNTER_ATTR.exec(text)
    if (m) found.push({ file, line: i + 1, attr: m[1], expr: m[2].trim() })
  })
  return found
}

function allCounters(): Found[] {
  return SCOPE.flatMap(f => walk(join(FEATURES, f))).flatMap(p =>
    findCounters(readFileSync(p, 'utf8'), relative(FEATURES, p)),
  )
}

describe('#4770.2 — un compteur n’annonce que le volume de la collection rendue', () => {
  it('sait dire NON : un compteur branché sur un référentiel, ou sur une source inconnue, est refusé', () => {
    const bad = findCounters(
      ['<Chip', '  count={marketReferentialTotal}', '/>', '<Tab', '  total={whoKnows.all}', '/>'].join('\n'),
    )
    expect(bad).toHaveLength(2)
    expect(bad.map(b => judgeCounter(b.expr).kind)).toEqual(['refused', 'refused'])
  })

  it('ne vise pas ce qu’elle n’a pas à viser : un nombre qui ne décrit pas une collection n’est pas un défaut', () => {
    expect(judgeCounter('countPortfolioFilters(dialogValues)').kind).toBe('not-a-collection')
    expect(judgeCounter('rows.length').kind).toBe('collection')
    expect(judgeCounter('hasNextPage ? undefined : contacts.length').kind).toBe('collection')
    expect(findCounters('  <p>{count} contacts</p>\n  const count = 3')).toHaveLength(0)
  })

  it('inspecte TOUS les compteurs des cinq features, en rend le nombre, et aucun n’est refusé', () => {
    const counters = allCounters()
    const refused = counters
      .map(c => ({ ...c, verdict: judgeCounter(c.expr) }))
      .filter(c => c.verdict.kind === 'refused')
      .map(c => `${c.file}:${c.line}  ${c.attr}={${c.expr}} — ${c.verdict.why}`)
    // eslint-disable-next-line no-console
    console.info(
      `#4770.2 — ${counters.length} compteurs inspectés (${new Set(counters.map(c => c.expr)).size} expressions)`,
    )
    expect(counters.length, '0 inspecté est un ÉCHEC, pas un vert').toBeGreaterThan(0)
    expect(counters.length, 'le nombre inspecté ne redescend pas (cliquet)').toBeGreaterThanOrEqual(INSPECTED_FLOOR)
    expect(refused).toEqual([])
  })

  it('chaque déclaration sert encore : une ligne qui ne correspond plus à aucun compteur est retirée', () => {
    const used = new Set(allCounters().map(c => c.expr))
    const stale = Object.keys(DECLARED).filter(k => !used.has(k))
    expect(stale).toEqual([])
  })
})

/** 87 compteurs lus sur les cinq features du lot au 02/11/2026. */
const INSPECTED_FLOOR = 87
