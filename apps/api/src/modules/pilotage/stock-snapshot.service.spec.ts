import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  METRICS_WITH_DENOMINATOR,
  METRIC_SNAPSHOT_DENOMINATOR,
  METRIC_SNAPSHOT_UNIT,
  STOCK_METRIC_KEYS,
  STOCK_METRIC_PROVENANCE,
  metricDelta,
  metricPointAt,
  previousMonthLastDay,
} from '@bellum/contracts'
import { createMockRepository } from '../../database/test-utils'
import { StockSnapshotService } from './stock-snapshot.service'
import { stockSnapshotDisabled } from './stock-snapshot.scheduler'

/**
 * Ce que la photo mensuelle a le droit d'écrire, et ce qu'elle doit refuser.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS QUESTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *  (a) pas de photo précédente ⇒ aucune base, donc aucun pourcentage possible ;
 *  (b) deux exécutions le même mois ⇒ un seul point, et c'est l'index UNIQUE
 *      qui le tient — pas une intention dans le code ;
 *  (c) la valeur photographiée sort de la MÊME dérivation que celle affichée.
 *      C'est la plus importante : une photo prise par un second `SELECT`
 *      « équivalent » diverge au premier correctif appliqué d'un seul côté, et
 *      la tendance compare alors deux définitions différentes en silence.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

/** Le rapport de chaîne, avec les deux stocks qu'on photographie. */
function chainReport(bench: number | null, activeClients: number | null) {
  return {
    levels: [
      {
        level: 'sourcing',
        status: 'ok',
        metrics: [{ key: 'benchAvailable', value: bench, unit: 'count', status: 'ok' }],
      },
      {
        level: 'expansion',
        status: 'ok',
        metrics: [{ key: 'activeClients', value: activeClients, unit: 'count', status: 'ok' }],
      },
    ],
  }
}

/** Les huit lignes d'hygiène, dont sept sont photographiées. */
function hygieneReport(count: number | null) {
  return {
    lines: [
      { key: 'accounts_without_next_action', count, total: 40, link: '/accounts' },
      { key: 'contacts_without_email', count, total: 90, link: '/contacts' },
      { key: 'projects_without_amount', count, total: 12, link: '/projects' },
      { key: 'missions_without_end_date', count, total: 5, link: '/missions' },
      { key: 'needs_without_skills', count, total: 7, link: '/projects/needs' },
      { key: 'talents_unknown_availability', count, total: 20, link: '/consultants/pool' },
      { key: 'unresolved_duplicates', count, total: null, link: '/pilotage/qualite' },
      { key: 'missions_without_cost', count, total: 5, link: '/missions/facturation' },
    ],
  }
}

type Inserted = {
  workspaceId: string
  takenOn: string
  key: string
  value: number
  provenance: string
  denominator: number | null
}

function buildService(
  options: {
    chain?: ReturnType<typeof chainReport>
    hygiene?: ReturnType<typeof hygieneReport>
    /** Ce que les quatre dérivations de TRAVAIL rendent : un nombre, `null`
     *  (« je ne sais pas »), ou une `Error` (« je suis en panne »). */
    work?: number | null | Error
    /** Les lignes déjà en base, indexées `${takenOn}|${key}` — l'index unique. */
    existing?: Set<string>
    /** Ce que la lecture de la base de comparaison rend. */
    baselineRows?: Array<{ metric_key: string; value: number | string; denominator?: number | string | null }> | Error
  } = {},
) {
  const inserted: Inserted[] = []
  const existing = options.existing ?? new Set<string>()
  const snapshots = createMockRepository()

  snapshots.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO stock_snapshots')) {
      const [workspaceId, takenOn, key, value, provenance, denominator] = params as [
        string,
        string,
        string,
        number,
        string,
        number | null,
      ]
      const unique = `${takenOn}|${key}`
      // La simulation de `ON CONFLICT DO NOTHING` : la contrainte refuse le
      // doublon, et l'instruction rend ZÉRO ligne.
      if (existing.has(unique)) return []
      existing.add(unique)
      inserted.push({ workspaceId, takenOn, key, value, provenance, denominator })
      return [{ id: `snap-${inserted.length}` }]
    }
    if (sql.includes('FROM stock_snapshots')) {
      if (options.baselineRows instanceof Error) throw options.baselineRows
      return options.baselineRows ?? []
    }
    throw new Error(`requête non routée : ${sql}`)
  })
  snapshots.manager.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM workspaces')) return [{ id: 'ws-1' }, { id: 'ws-2' }]
    throw new Error(`requête non routée : ${sql}`)
  })

  const pilotage = { getChainForWorkspace: jest.fn().mockResolvedValue(options.chain ?? chainReport(12, 4)) }
  const hygiene = { overview: jest.fn().mockResolvedValue(options.hygiene ?? hygieneReport(3)) }

  /**
   * Les quatre dérivations d'AUTRES modules, atteintes par un port (31/08/2026).
   *
   * `options.work` porte la valeur commune des quatre : `null` simule « la
   * dérivation ne sait pas », `Error` simule une source EN PANNE. Les deux ne se
   * traitent pas pareil — la première n'écrit rien, la seconde n'écrit rien NON
   * PLUS mais ne doit pas emporter les neuf autres photos avec elle.
   */
  const work = options.work === undefined ? 7 : options.work
  const answer = <T>(value: T) =>
    work instanceof Error ? jest.fn().mockRejectedValue(work) : jest.fn().mockResolvedValue(value)
  const openNeeds = {
    list: answer({ counters: { total: 41, withoutShortlist: work as number } }),
  }
  const timesheets = { month: answer({ summary: { total: 18, submitted: work as number } }) }
  const readiness = {
    list: answer({ summary: { ready: work as number, blocked: 2, invoiced: 3, notDue: 1 } }),
  }
  const talents = { stats: answer({ total: 26, availableNow: work as number }) }

  const service = new StockSnapshotService(
    snapshots as never,
    pilotage as never,
    hygiene as never,
    openNeeds as never,
    timesheets as never,
    readiness as never,
    talents as never,
  )
  return { service, inserted, pilotage, hygiene, openNeeds, timesheets, readiness, talents }
}

describe('(c) la valeur photographiée sort de la MÊME dérivation que celle affichée', () => {
  it('appelle les deux dérivations des écrans, jamais un SQL à elle', async () => {
    const { service, pilotage, hygiene } = buildService()
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(pilotage.getChainForWorkspace).toHaveBeenCalledWith('ws-1')
    expect(hygiene.overview).toHaveBeenCalledWith('ws-1')
  })

  it('n’écrit AUCUN agrégat de son cru — le service ne contient pas de COUNT', () => {
    // La garde structurelle : le jour où quelqu'un « optimise » en recopiant
    // une requête ici, la photo cesse de mesurer ce que l'écran montre.
    const source = readFileSync(join(__dirname, 'stock-snapshot.service.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(code).not.toMatch(/COUNT\s*\(/i)
    expect(code).not.toMatch(/\bFROM\s+(contacts|accounts|consultants|missions|opportunities)\b/i)
  })

  it('recopie exactement la valeur rendue par la dérivation', async () => {
    const { service, inserted } = buildService({ chain: chainReport(12, 4), hygiene: hygieneReport(3) })
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted.find(row => row.key === 'benchAvailable')?.value).toBe(12)
    expect(inserted.find(row => row.key === 'activeClients')?.value).toBe(4)
    expect(inserted.find(row => row.key === 'contacts_without_email')?.value).toBe(3)
  })

  it('écrit la PROVENANCE de chaque valeur, et elle désigne un fichier qui existe', async () => {
    const { service, inserted } = buildService()
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    for (const row of inserted) {
      expect(row.provenance).toBe(STOCK_METRIC_PROVENANCE[row.key as keyof typeof STOCK_METRIC_PROVENANCE])
    }
    // Une provenance qui désigne un fichier disparu est une piste morte, donc
    // pire qu'une absence de provenance.
    const dead = Object.values(STOCK_METRIC_PROVENANCE)
      .map(provenance => provenance.split('#')[0] as string)
      .filter(path => !existsSync(join(REPO_ROOT, path)))
    expect(dead).toEqual([])
  })

  it('photographie TOUS les stocks déclarés, et pas les doublons non tranchés', async () => {
    const { service, inserted } = buildService()
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted.map(row => row.key).sort()).toEqual([...STOCK_METRIC_KEYS].sort())
    expect(inserted.map(row => row.key)).not.toContain('unresolved_duplicates')
  })

  it('appelle AUSSI les quatre dérivations d’autres modules, par leur port', async () => {
    const { service, openNeeds, timesheets, readiness, talents } = buildService()
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(openNeeds.list).toHaveBeenCalledWith('ws-1', expect.objectContaining({ limit: 1 }))
    expect(talents.stats).toHaveBeenCalledWith('ws-1')
    // ⚠️ Le MOIS photographié, jamais « le mois précédent » implicite : un
    // rattrapage lancé le 5 mars écrirait sinon les relevés de mars dans la
    // photo du 28 février.
    expect(timesheets.month).toHaveBeenCalledWith('ws-1', { month: '2026-02' })
    expect(readiness.list).toHaveBeenCalledWith(
      'ws-1',
      { month: '2026-02', blockedOnly: false },
      { canReadFinance: false },
    )
  })

  it('recopie la POPULATION que chaque dérivation rend — jamais une somme inventée', async () => {
    const { service, inserted } = buildService()
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted.find(row => row.key === 'needs_without_positioning')?.denominator).toBe(41)
    expect(inserted.find(row => row.key === 'timesheets_to_validate')?.denominator).toBe(18)
    expect(inserted.find(row => row.key === 'talents_available')?.denominator).toBe(26)
    // Les quatre états PARTITIONNENT la population : 7 prêtes + 2 bloquées
    // + 3 facturées + 1 non due.
    expect(inserted.find(row => row.key === 'invoices_ready')?.denominator).toBe(13)
  })
})

describe('une source EN PANNE n’emporte pas les autres photos', () => {
  it('les neuf stocks du pilotage sont écrits même si les quatre autres sources échouent', async () => {
    // Le mois écoulé ne revient pas et la photo ne se refait pas : perdre neuf
    // points parce qu'une jointure d'un autre module a lâché serait un dégât
    // DÉFINITIF, pour une panne passagère.
    const { service, inserted } = buildService({ work: new Error('jointure en échec') })
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted).toHaveLength(9)
    expect(inserted.map(row => row.key)).not.toContain('invoices_ready')
    // Et surtout : aucune des quatre n'est écrite à ZÉRO.
    expect(inserted.every(row => Number.isFinite(row.value))).toBe(true)
  })

  it('une source en panne n’écrit RIEN pour ses clés — jamais un zéro', async () => {
    const { service, inserted } = buildService({ work: new Error('boum') })
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    for (const key of ['needs_without_positioning', 'timesheets_to_validate', 'invoices_ready', 'talents_available']) {
      expect(inserted.find(row => row.key === key)).toBeUndefined()
    }
  })
})

describe('une valeur NON LUE n’écrit rien — jamais un zéro', () => {
  it('saute le stock dont la dérivation rend null', async () => {
    const { service, inserted } = buildService({ chain: chainReport(null, 4), hygiene: hygieneReport(3) })
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted.map(row => row.key)).not.toContain('benchAvailable')
    // Le défaut symétrique : tout sauter « par prudence » effacerait les huit
    // autres, qui sont parfaitement mesurés.
    expect(inserted.find(row => row.key === 'activeClients')?.value).toBe(4)
  })

  it('n’écrit RIEN quand aucune source n’a répondu', async () => {
    const { service, inserted } = buildService({
      chain: chainReport(null, null),
      hygiene: hygieneReport(null),
      work: null,
    })
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted).toEqual([])
  })

  it('un zéro MESURÉ, lui, se photographie', async () => {
    // « Aucun client actif » est un fait dès que la requête est revenue. Ne pas
    // le photographier serait le défaut inverse : l'espace qui recrute son
    // premier client ne verrait jamais la variation.
    const { service, inserted } = buildService({ chain: chainReport(0, 0), hygiene: hygieneReport(0), work: 0 })
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted.find(row => row.key === 'activeClients')?.value).toBe(0)
    expect(inserted).toHaveLength(STOCK_METRIC_KEYS.length)
  })
})

describe('(b) deux exécutions le même mois ne créent pas deux points', () => {
  it('la seconde exécution n’écrit aucune ligne', async () => {
    const { service, inserted } = buildService()
    const first = await service.snapshotWorkspace('ws-1', '2026-02-28')
    const second = await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(first).toBe(STOCK_METRIC_KEYS.length)
    expect(second).toBe(0)
    expect(inserted).toHaveLength(STOCK_METRIC_KEYS.length)
  })

  it('un rattrapage lancé plus tard dans le mois vise la MÊME ligne', () => {
    // Le jour photographié est dérivé de `now()`, pas de la date d'exécution :
    // le 1er à 03:00 et le 5 à 14:00 écrivent tous deux « 28 février ». C'est
    // ce qui fait que l'index unique reconnaît le doublon.
    expect(previousMonthLastDay(new Date('2026-03-01T03:00:00Z'))).toBe(
      previousMonthLastDay(new Date('2026-03-05T14:00:00Z')),
    )
  })

  it('c’est l’index UNIQUE de la base qui le tient, pas le code', () => {
    // Une intention ne survit pas à deux replicas qui démarrent à la même
    // seconde. On vérifie donc la contrainte ET la clause qui s'appuie dessus.
    const migration = readFileSync(join(__dirname, '..', '..', 'migrations', '1790300000004-StockSnapshots.ts'), 'utf8')
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*stock_snapshots \(workspace_id, taken_on, metric_key\)/)

    const source = readFileSync(join(__dirname, 'stock-snapshot.service.ts'), 'utf8')
    expect(source).toContain('ON CONFLICT (workspace_id, taken_on, metric_key) DO NOTHING')
  })

  it('un espace en échec n’arrête pas le balayage des autres', async () => {
    const { service } = buildService()
    const failing = jest
      .spyOn(service, 'snapshotWorkspace')
      .mockRejectedValueOnce(new Error('base injoignable'))
      .mockResolvedValueOnce(9)

    const result = await service.snapshotAllWorkspaces(new Date('2026-03-01T03:00:00Z'))
    expect(failing).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ workspaces: 2, rows: 9 })
  })
})

describe('#3415 — le rattrapage de la photo du mois écoulé', () => {
  it('complète les clés manquantes dans les premiers jours du mois, sans réécrire les présentes', async () => {
    // Recette Y11 (02/10) : « Besoins sans shortlist » — aucune photo du mois de référence.
    // Le balayage du 1er n'avait pas écrit cette clé ; le rattrapage du 2 la pose, à la date du 30/09.
    const existing = new Set(['2026-09-30|benchAvailable', '2026-09-30|activeClients'])
    const { service, inserted } = buildService({ existing })

    const result = await service.catchUpLastMonth(new Date('2026-10-02T09:00:00Z'))

    // L'index simulé ne porte pas l'espace : le second espace se heurte au premier — 11 clés écrites, pas 22.
    expect(result).toEqual({ workspaces: 2, rows: STOCK_METRIC_KEYS.length - 2 })
    expect(inserted.every(row => row.takenOn === '2026-09-30')).toBe(true)
    expect(inserted.some(row => row.key === 'needs_without_positioning')).toBe(true)
    expect(inserted.some(row => row.key === 'benchAvailable')).toBe(false)
  })

  it('un second rattrapage n’écrit rien de plus', async () => {
    const { service } = buildService()
    await service.catchUpLastMonth(new Date('2026-10-02T09:00:00Z'))
    const again = await service.catchUpLastMonth(new Date('2026-10-03T09:00:00Z'))
    expect(again?.rows).toBe(0)
  })

  it('refuse passé le 5 : une photo « fin septembre » lue le 20 octobre serait un autre état', async () => {
    const { service, inserted, pilotage } = buildService()
    const result = await service.catchUpLastMonth(new Date('2026-10-20T09:00:00Z'))
    expect(result).toBeNull()
    expect(inserted).toHaveLength(0)
    expect(pilotage.getChainForWorkspace).not.toHaveBeenCalled()
  })

  it('compte le jour à Paris : le 5 à 23h30 UTC est déjà le 6', async () => {
    const { service, inserted } = buildService()
    expect(await service.catchUpLastMonth(new Date('2026-10-05T23:30:00Z'))).toBeNull()
    expect(inserted).toHaveLength(0)
  })
})

describe('(a) pas de photo précédente ⇒ aucune base de comparaison', () => {
  it('rend un mois NUL et aucune valeur', async () => {
    const { service } = buildService({ baselineRows: [] })
    const baseline = await service.baselineFor('ws-1', 'chain', new Date('2026-03-17T09:00:00Z'))

    expect(baseline).toEqual({ month: null, takenOn: null, values: {} })
  })

  it('une lecture EN ÉCHEC ne fabrique pas une base vide silencieuse… mais n’affirme rien non plus', async () => {
    const { service } = buildService({ baselineRows: new Error('base injoignable') })
    const baseline = await service.baselineFor('ws-1', 'chain', new Date('2026-03-17T09:00:00Z'))

    // L'écran dira la même chose (« pas de photo »), parce qu'il n'y a rien
    // d'autre d'honnête à dire. Ce qui compte est qu'aucun zéro ne sorte.
    expect(baseline.values).toEqual({})
    expect(baseline.month).toBeNull()
  })

  it('rend la photo du mois précédent quand elle existe', async () => {
    const { service } = buildService({
      baselineRows: [
        { metric_key: 'activeClients', value: 4 },
        // `integer` remonte parfois en chaîne selon le pilote — on ne parie pas.
        { metric_key: 'benchAvailable', value: '31' },
        // Une clé inconnue (photo d'une version antérieure) est IGNORÉE plutôt
        // que servie : personne ne saurait l'interpréter à l'écran.
        { metric_key: 'clé_disparue', value: 7 },
      ],
    })
    const baseline = await service.baselineFor('ws-1', 'chain', new Date('2026-03-17T09:00:00Z'))

    expect(baseline.month).toBe('2026-02')
    expect(baseline.takenOn).toBe('2026-02-28')
    expect(baseline.values).toEqual({ activeClients: 4, benchAvailable: 31 })
  })

  it('chaque réponse ne porte QUE la base des indicateurs qu’elle affiche', async () => {
    // Une tendance servie à côté d'un chiffre absent de l'écran est un chiffre
    // que personne ne peut vérifier.
    const rows = [
      { metric_key: 'activeClients', value: 4 },
      { metric_key: 'contacts_without_email', value: 31 },
    ]
    const chain = await buildService({ baselineRows: rows }).service.baselineFor(
      'ws-1',
      'chain',
      new Date('2026-03-17T09:00:00Z'),
    )
    const hygiene = await buildService({ baselineRows: rows }).service.baselineFor(
      'ws-1',
      'hygiene',
      new Date('2026-03-17T09:00:00Z'),
    )

    expect(chain.values).toEqual({ activeClients: 4 })
    expect(hygiene.values).toEqual({ contacts_without_email: 31 })
  })
})

describe('la photo porte SA POPULATION (31/08/2026)', () => {
  it('écrit le dénominateur des sept stocks d’hygiène — celui que la vue Qualité calcule DÉJÀ', async () => {
    // `DataHygieneService.overview` rend `count` ET `total` dans le même
    // SELECT. Le balayage jetait `total`. L'écrire ne coûte aucune requête.
    const { service, inserted } = buildService({ hygiene: hygieneReport(3) })
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted.find(row => row.key === 'accounts_without_next_action')?.denominator).toBe(40)
    expect(inserted.find(row => row.key === 'contacts_without_email')?.denominator).toBe(90)
    expect(inserted.find(row => row.key === 'talents_unknown_availability')?.denominator).toBe(20)
  })

  it('n’INVENTE aucune population pour les deux stocks de la chaîne', async () => {
    // `gatherInputs` rend des dénombrements NUS. Fabriquer un effectif ici
    // serait une seconde définition de la population des consultants.
    const { service, inserted } = buildService()
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    expect(inserted.find(row => row.key === 'benchAvailable')?.denominator).toBeNull()
    expect(inserted.find(row => row.key === 'activeClients')?.denominator).toBeNull()
  })

  it('le registre des dénominateurs couvre exactement les clés photographiées', () => {
    // Une clé sans entrée se photographierait sans que personne ait répondu
    // « sur quoi ? » ; une entrée en trop désignerait une clé disparue.
    expect(Object.keys(METRIC_SNAPSHOT_DENOMINATOR).sort()).toEqual([...STOCK_METRIC_KEYS].sort())
    expect(Object.keys(METRIC_SNAPSHOT_UNIT).sort()).toEqual([...STOCK_METRIC_KEYS].sort())
    // La garde LIT quelque chose : sans ceci elle serait verte sur du vide.
    // Onze depuis le 31/08/2026 — les sept lignes d'hygiène, plus les quatre
    // stocks de travail, dont la dérivation rend elle aussi sa population.
    // SEULES `benchAvailable` et `activeClients` n'en ont pas : leur dérivation
    // rend des dénombrements nus, et en inventer une serait une seconde
    // définition de l'effectif.
    expect(METRICS_WITH_DENOMINATOR.length).toBe(STOCK_METRIC_KEYS.length - 2)
    expect(METRICS_WITH_DENOMINATOR).not.toContain('benchAvailable')
    expect(METRICS_WITH_DENOMINATOR).not.toContain('activeClients')
  })

  it('une population NON LUE reste `null`, et la valeur se photographie quand même', async () => {
    // `total: null` = la requête n'a pas su le lire. Ce n'est pas « population
    // vide », et surtout ce n'est pas une raison de perdre le comptage.
    const hygiene = hygieneReport(3)
    const line = hygiene.lines.find(l => l.key === 'contacts_without_email')
    if (line) line.total = null
    const { service, inserted } = buildService({ hygiene })
    await service.snapshotWorkspace('ws-1', '2026-02-28')

    const row = inserted.find(r => r.key === 'contacts_without_email')
    expect(row?.value).toBe(3)
    expect(row?.denominator).toBeNull()
  })

  it('la base de comparaison RAPPORTE les dénominateurs photographiés', async () => {
    const { service } = buildService({
      baselineRows: [
        { metric_key: 'contacts_without_email', value: 31, denominator: 90 },
        // `bigint` remonte en CHAÎNE selon le pilote — on ne parie pas.
        { metric_key: 'projects_without_amount', value: 6, denominator: '12' },
        // Sans population lue : la clé ne doit PAS apparaître en dénominateur,
        // et surtout pas y apparaître à zéro.
        { metric_key: 'missions_without_cost', value: 2, denominator: null },
      ],
    })
    const baseline = await service.baselineFor('ws-1', 'hygiene', new Date('2026-03-17T09:00:00Z'))

    expect(baseline.values).toEqual({
      contacts_without_email: 31,
      projects_without_amount: 6,
      missions_without_cost: 2,
    })
    expect(baseline.denominators).toEqual({ contacts_without_email: 90, projects_without_amount: 12 })
    expect(baseline.denominators?.['missions_without_cost']).toBeUndefined()
  })
})

describe('la série de photos — la lecture générique (31/08/2026)', () => {
  /** Une série renvoyée par la base, comme le pilote la rend. */
  function seriesRows(rows: Array<{ key: string; takenOn: string; value: number; denominator?: number | null }>) {
    return rows.map(row => ({
      metric_key: row.key,
      taken_on: row.takenOn,
      value: row.value,
      denominator: row.denominator ?? null,
    }))
  }

  function buildSeriesService(rows: ReturnType<typeof seriesRows> | Error) {
    const snapshots = createMockRepository()
    snapshots.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM stock_snapshots')) {
        if (rows instanceof Error) throw rows
        return rows
      }
      throw new Error(`requête non routée : ${sql}`)
    })
    // Les six dérivations sont vides : la LECTURE d'une série ne les touche
    // pas, et c'est ce que ces objets nus prouvent. Un mock complaisant
    // laisserait passer une lecture qui recalculerait au lieu de relire.
    return new StockSnapshotService(
      snapshots as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
  }

  it('groupe les points par indicateur, du plus ancien au plus récent', async () => {
    const service = buildSeriesService(
      seriesRows([
        { key: 'activeClients', takenOn: '2026-06-30', value: 3 },
        { key: 'activeClients', takenOn: '2026-07-31', value: 4 },
        { key: 'contacts_without_email', takenOn: '2026-07-31', value: 31, denominator: 90 },
      ]),
    )
    const result = await service.seriesFor('ws-1', 12, new Date('2026-08-15T09:00:00Z'))

    const clients = result.series.find(s => s.metricKey === 'activeClients')
    expect(clients?.points).toEqual([
      { month: '2026-06', value: 3 },
      { month: '2026-07', value: 4 },
    ])
    expect(clients?.unit).toBe('count')
    expect(result.series.find(s => s.metricKey === 'contacts_without_email')?.points).toEqual([
      { month: '2026-07', value: 31, denominator: 90 },
    ])
  })

  it('dit combien de mois elle couvre — 0 ou 1 ⇒ aucune variation POSSIBLE', async () => {
    // C'est ce qui distingue « pas encore » d'une panne : l'écran le sait AVANT
    // de tenter une lecture, et n'ouvre pas un incident au premier mois.
    const first = await buildSeriesService(
      seriesRows([{ key: 'activeClients', takenOn: '2026-07-31', value: 4 }]),
    ).seriesFor('ws-1', 12, new Date('2026-08-15T09:00:00Z'))
    expect(first.monthsCovered).toBe(1)

    const none = await buildSeriesService([]).seriesFor('ws-1', 12, new Date('2026-08-15T09:00:00Z'))
    expect(none).toEqual({ series: [], monthsCovered: 0 })
  })

  it('ne COMBLE aucun trou — un mois sans photo est ABSENT, jamais un zéro', async () => {
    // Juillet manque (balayage coupé). Inventer un point à zéro afficherait une
    // chute puis une remontée, toutes deux fausses.
    const service = buildSeriesService(
      seriesRows([
        { key: 'activeClients', takenOn: '2026-06-30', value: 3 },
        { key: 'activeClients', takenOn: '2026-08-31', value: 5 },
      ]),
    )
    const result = await service.seriesFor('ws-1', 12, new Date('2026-09-15T09:00:00Z'))

    expect(result.series[0]?.points.map(p => p.month)).toEqual(['2026-06', '2026-08'])
    expect(result.series[0]?.points.some(p => p.value === 0)).toBe(false)
  })

  it('une population NON LUE n’apparaît pas — `Number(null)` vaudrait 0', async () => {
    const service = buildSeriesService(
      seriesRows([{ key: 'contacts_without_email', takenOn: '2026-07-31', value: 31, denominator: null }]),
    )
    const result = await service.seriesFor('ws-1', 12, new Date('2026-08-15T09:00:00Z'))

    expect(result.series[0]?.points[0]).toEqual({ month: '2026-07', value: 31 })
    expect(result.series[0]?.points[0]).not.toHaveProperty('denominator')
  })

  it('borne la fenêtre, et ne lève jamais sur un paramètre absurde', async () => {
    const service = buildSeriesService([])
    await expect(service.seriesFor('ws-1', 9999, new Date('2026-08-15T09:00:00Z'))).resolves.toBeDefined()
    await expect(service.seriesFor('ws-1', -3, new Date('2026-08-15T09:00:00Z'))).resolves.toBeDefined()
    await expect(service.seriesFor('ws-1', Number.NaN, new Date('2026-08-15T09:00:00Z'))).resolves.toBeDefined()
  })

  it('une lecture EN ÉCHEC rend une série vide, jamais des zéros', async () => {
    const service = buildSeriesService(new Error('base injoignable'))
    await expect(service.seriesFor('ws-1', 12, new Date('2026-08-15T09:00:00Z'))).resolves.toEqual({
      series: [],
      monthsCovered: 0,
    })
  })

  it('ignore une clé inconnue — la photo d’une version antérieure', async () => {
    const service = buildSeriesService(seriesRows([{ key: 'clé_disparue', takenOn: '2026-07-31', value: 7 }]))
    const result = await service.seriesFor('ws-1', 12, new Date('2026-08-15T09:00:00Z'))
    expect(result.series).toEqual([])
  })

  it('se branche sur `metricDelta` sans retouche — le contrat de bout en bout', async () => {
    // Le test qui compte pour l'intégration : ce que le service rend entre
    // DIRECTEMENT dans la lecture de variation, sans adaptateur.
    const service = buildSeriesService(
      seriesRows([
        { key: 'activeClients', takenOn: '2026-06-30', value: 40 },
        { key: 'activeClients', takenOn: '2026-07-31', value: 50 },
      ]),
    )
    const { series } = await service.seriesFor('ws-1', 12, new Date('2026-08-15T09:00:00Z'))
    const points = series[0]?.points ?? []

    const delta = metricDelta({
      unit: series[0]?.unit ?? 'count',
      previous: metricPointAt(points, '2026-06'),
      current: metricPointAt(points, '2026-07'),
    })
    expect(delta.measured === true && delta.change).toBe(10)
    expect(delta.measured === true && delta.percent).toBe(25)
  })
})

describe('le kill-switch', () => {
  const previous = process.env['STOCK_SNAPSHOT_DISABLED']
  afterEach(() => {
    if (previous === undefined) delete process.env['STOCK_SNAPSHOT_DISABLED']
    else process.env['STOCK_SNAPSHOT_DISABLED'] = previous
  })

  it('est ÉTEINT par défaut — tout est ON dans ce dépôt', () => {
    delete process.env['STOCK_SNAPSHOT_DISABLED']
    expect(stockSnapshotDisabled()).toBe(false)
  })

  it('ne s’allume que sur la chaîne exacte « true »', () => {
    process.env['STOCK_SNAPSHOT_DISABLED'] = '1'
    expect(stockSnapshotDisabled()).toBe(false)
    process.env['STOCK_SNAPSHOT_DISABLED'] = 'true'
    expect(stockSnapshotDisabled()).toBe(true)
  })
})
