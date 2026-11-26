import { FindOperator } from 'typeorm'
import { LauraAcceptanceService } from './laura-acceptance.service'
import { LauraService } from './laura.service'

/**
 * #2439.10 — UNE TRACE D'INTERVENTION OUBLIÉE NE COMPTE PLUS NULLE PART
 * (décision de Louis du 21/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Oublier » une trace depuis Réglages › Mémoire de Laura faisait un DELETE :
 * la ligne partait, et avec elle sa contribution à ce qui fait taire Laura
 * (`LauraService`) et au taux d'acceptation par surface
 * (`LauraAcceptanceService`). Depuis #2439.10 l'oubli ARCHIVE — la ligne reste.
 *
 * Il ne suffit donc PAS d'archiver : les deux lectures doivent exclure l'archivé
 * pour que le comportement reste celui d'avant. Une trace oubliée qui continue
 * de peser dans un compteur est exactement ce que la doctrine appelle une
 * mémoire qui ne redevient pas inconnue.
 *
 * ⚠️ Le TAUX D'ACCEPTATION mesure le PRODUIT, jamais la personne : ce n'est pas
 * un motif pour garder une trace oubliée dans son dénominateur. La ligne
 * n'était pas là avant ce lot (elle était détruite) ; l'exclure garde la mesure
 * IDENTIQUE, l'inclure la changerait en silence.
 */

const ALICE = 'user-alice'
const NOW = new Date('2026-09-21T12:00:00.000Z')

type TraceRow = {
  id: string
  user_id: string
  intervention_key: string
  reaction: string | null
  created_at: Date
  archived_at: Date | null
}

/**
 * Un critère de `find`, appliqué pour de vrai. Les `FindOperator` sont
 * INTERPRÉTÉS — comparer `IsNull()` par `===` le rendrait toujours faux, donc
 * « aucune ligne », donc un vert obtenu par vacuité. Un opérateur inconnu LÈVE.
 */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([column, expected]) => {
    const value = row[column] ?? null
    if (expected instanceof FindOperator) {
      switch (expected.type) {
        case 'isNull':
          return value === null
        case 'not':
          return !matches(row, { [column]: expected.child ?? expected.value })
        case 'moreThanOrEqual':
          return value instanceof Date && value.getTime() >= (expected.value as Date).getTime()
        default:
          throw new Error(`opérateur non simulé : ${expected.type}`)
      }
    }
    return value === (expected ?? null)
  })
}

function fakeInterventions(rows: TraceRow[]) {
  const find = jest.fn(async (options: { where?: Record<string, unknown> }) =>
    options.where ? rows.filter(row => matches(row as never, options.where as Record<string, unknown>)) : rows,
  )
  // #2319.118 — `LauraService.plan` interroge aussi l'agrégat À PORTÉE ESPACE ;
  // ce fichier ne teste pas ce point, une carte vide garde le comportement
  // existant STRICTEMENT inchangé.
  const builder = {
    select: jest.fn(() => builder),
    addSelect: jest.fn(() => builder),
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    getRawMany: jest.fn().mockResolvedValue([]),
  }
  const createQueryBuilder = jest.fn(() => builder)
  return { find, createQueryBuilder, rows }
}

function trace(overrides: Partial<TraceRow> & { id: string }): TraceRow {
  return {
    user_id: ALICE,
    intervention_key: 'crm_not_connected',
    reaction: 'refused',
    created_at: new Date(NOW.getTime() - 60_000),
    archived_at: null,
    ...overrides,
  }
}

describe('#2439.10 — le taux d’acceptation par surface ne compte plus une trace oubliée', () => {
  afterEach(() => {
    delete process.env['OBSERVABILITY_ALERT_MIN_SAMPLE']
  })

  it('deux traces, dont une OUBLIÉE : l’échantillon est de 1, pas de 2', async () => {
    process.env['OBSERVABILITY_ALERT_MIN_SAMPLE'] = '1'
    const interventions = fakeInterventions([
      trace({ id: 't-live', reaction: 'acted' }),
      trace({ id: 't-forgotten', reaction: 'refused', archived_at: new Date(NOW.getTime() - 1_000) }),
    ])
    const acceptance = new LauraAcceptanceService(interventions as never)

    const bySurface = await acceptance.bySurface(NOW)

    // Sans le filtre, l'échantillon vaudrait 2 et le taux 50 % : la trace
    // oubliée pèserait encore sur la mesure de la surface.
    expect(bySurface.get('crm_not_connected')).toEqual({ state: 'measured', acceptedPercent: 100, sample: 1 })
  })

  it('la seule trace de la surface est OUBLIÉE : la surface redevient « non mesurée »', async () => {
    process.env['OBSERVABILITY_ALERT_MIN_SAMPLE'] = '1'
    const interventions = fakeInterventions([
      trace({ id: 't-forgotten', reaction: 'acted', archived_at: new Date(NOW.getTime() - 1_000) }),
    ])
    const acceptance = new LauraAcceptanceService(interventions as never)

    expect((await acceptance.bySurface(NOW)).get('crm_not_connected')).toEqual({
      state: 'unmeasured',
      reason: 'no_observation',
      sample: 0,
    })
  })
})

describe('#2439.10 — ce qui fait taire Laura ne relit plus une trace oubliée', () => {
  /**
   * `LauraService.recentTraces` est PRIVÉE et son appelant (`plan`) demande une
   * dizaine d'entrées sans rapport avec cette règle : la garde lit donc le
   * critère réellement passé à la base — la même façon de prouver qu'ailleurs
   * dans ce dépôt (`whereClauses`, `memory-reply-uses.service.spec.ts`). Retirer
   * le filtre laisse `archived_at` absent du critère, et ce test tombe.
   */
  it('la lecture des traces récentes porte `archived_at IS NULL`', async () => {
    const interventions = fakeInterventions([trace({ id: 't-live' })])
    const preferences = {
      findOne: jest.fn().mockResolvedValue({ user_id: ALICE, laura_enabled: true }),
      save: jest.fn(async (row: object) => row),
      create: (row: object) => row,
    }
    const laura = new LauraService(interventions as never, preferences as never, {} as never, {} as never)

    await laura.plan(ALICE, {
      workspaceId: 'ws-esn',
      screen: '/chat',
      busy: false,
      candidateKeys: [],
      health: { score: null, axes: [], unmeasuredAxes: [] } as never,
      now: NOW,
    })

    const where = interventions.find.mock.calls[0]?.[0]?.['where'] as Record<string, unknown>
    expect(where).toBeDefined()
    expect(where['archived_at']).toBeInstanceOf(FindOperator)
    expect((where['archived_at'] as FindOperator<unknown>).type).toBe('isNull')
  })
})
