import { routineKeySchema } from '@bellum/contracts'
import { CrmRoutinesService } from './crm-routines.service'
import { findRoutine } from './routine-catalog'
import { RoutineExecutors } from './routine-executors'
import { familyOfRoutine } from './routine-role-order'

/**
 * #2916 (#2399.2, Louis 15/10/2026 : « tu CHOISIS les 5 automatisations manquantes les plus utiles à un
 * commercial ESN parmi ce que le moteur sait déjà déclencher ») — cinq lectures du pipeline. Chacune
 * NOTIFIE, n'écrit rien, n'envoie rien ; une lecture non mesurée se dit, elle n'est jamais un faux zéro.
 */
const NEW_KEYS = [
  'deal_close_date_soon',
  'deal_close_date_overdue',
  'deal_without_close_date',
  'won_deal_expansion',
  'lost_deal_revisit',
] as const
const NOW = new Date('2026-10-15T09:00:00.000Z')

function executorsWith(reads: Partial<Record<string, { measured: boolean; rows: unknown[] }>>): RoutineExecutors {
  const crmRoutines = new Proxy(
    {},
    { get: (_t, name: string) => async () => reads[name] ?? { measured: true, rows: [] } },
  )
  return new RoutineExecutors(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    crmRoutines as never,
    null as never,
    null as never,
    null as never,
  )
}

describe('les cinq automatisations du pipeline — le catalogue', () => {
  it.each(NEW_KEYS)('%s : clé du contrat, au catalogue, N1, désactivée par défaut, famille nommée', key => {
    expect(routineKeySchema.options).toContain(key)
    const def = findRoutine(key)
    expect(def).toBeDefined()
    expect(def?.automationLevel).toBe('n1_prepare')
    expect(def?.defaultEnabled).toBe(false)
    expect(def?.stopCondition?.fr.length).toBeGreaterThan(20)
    expect(familyOfRoutine(key)).toBeDefined()
  })
})

describe('les cinq automatisations du pipeline — les lectures SQL', () => {
  function service(query: jest.Mock) {
    return new CrmRoutinesService({ manager: { query } } as never)
  }
  const reads: Array<[string, (s: CrmRoutinesService) => Promise<unknown>]> = [
    ['dealCloseDatesSoon', s => s.dealCloseDatesSoon('ws-1')],
    ['dealCloseDatesOverdue', s => s.dealCloseDatesOverdue('ws-1')],
    ['dealsWithoutCloseDate', s => s.dealsWithoutCloseDate('ws-1')],
    ['wonDealsToExpand', s => s.wonDealsToExpand('ws-1')],
    ['lostDealsToRevisit', s => s.lostDealsToRevisit('ws-1')],
  ]

  it.each(reads)('%s : bornée à l’espace demandeur, jamais une écriture', async (_name, run) => {
    const query = jest.fn().mockResolvedValue([])
    await run(service(query))
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/o\.workspace_id = \$1/)
    expect(params[0]).toBe('ws-1')
    expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true)
    expect(sql.toUpperCase()).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/)
  })

  it.each(reads)('%s : une requête cassée rend measured=false, jamais un faux zéro', async (_name, run) => {
    const query = jest.fn().mockRejectedValue(new Error('boom'))
    const s = service(query)
    jest.spyOn(s['logger'], 'error').mockImplementation(() => undefined)
    expect(await run(s)).toEqual({ measured: false, rows: [] })
  })

  it('l’expansion et la reprise n’écartent que les comptes SANS affaire ouverte', async () => {
    const query = jest.fn().mockResolvedValue([])
    const s = service(query)
    await s.wonDealsToExpand('ws-1')
    await s.lostDealsToRevisit('ws-1')
    for (const [sql] of query.mock.calls as [string][]) expect(sql).toContain('NOT EXISTS')
  })
})

describe('les cinq automatisations du pipeline — les exécuteurs', () => {
  it.each(NEW_KEYS)('%s : lecture non mesurée → elle se tait ET le dit', async key => {
    const out = await executorsWith({
      dealCloseDatesSoon: { measured: false, rows: [] },
      dealCloseDatesOverdue: { measured: false, rows: [] },
      dealsWithoutCloseDate: { measured: false, rows: [] },
      wonDealsToExpand: { measured: false, rows: [] },
      lostDealsToRevisit: { measured: false, rows: [] },
    }).run(key, 'u1', NOW, 'w1')
    expect(out.notified).toBe(false)
    expect(out.outcome).toContain('rien n’a été mesuré')
  })

  it.each(NEW_KEYS)('%s : rien à signaler → elle se tait, comme un fait mesuré', async key => {
    const out = await executorsWith({}).run(key, 'u1', NOW, 'w1')
    expect(out.notified).toBe(false)
    expect(out.outcome).not.toContain('rien n’a été mesuré')
  })

  it('échéance proche : nomme l’affaire la plus proche et ses jours restants, ouvre les projets', async () => {
    const out = await executorsWith({
      dealCloseDatesSoon: { measured: true, rows: [{ label: 'Migration cloud', stage: 'negotiation', days: 6 }] },
    }).run('deal_close_date_soon', 'u1', NOW, 'w1')
    expect(out.notified).toBe(true)
    expect(out.notification?.body).toContain('Migration cloud')
    expect(out.notification?.body).toContain('6')
    expect(out.notification?.link).toBe('/projects')
  })

  it('échéance dépassée : nomme l’affaire la plus en retard', async () => {
    const out = await executorsWith({
      dealCloseDatesOverdue: { measured: true, rows: [{ label: 'Support N3', stage: 'qualified', days: 12 }] },
    }).run('deal_close_date_overdue', 'u1', NOW, 'w1')
    expect(out.notified).toBe(true)
    expect(out.notification?.body).toContain('Support N3')
    expect(out.notification?.body).toContain('12')
  })

  it('sans date de clôture : compte, sans inventer de date', async () => {
    const out = await executorsWith({
      dealsWithoutCloseDate: {
        measured: true,
        rows: [
          { label: 'A', stage: 'negotiation' },
          { label: 'B', stage: 'profiles_submitted' },
        ],
      },
    }).run('deal_without_close_date', 'u1', NOW, 'w1')
    expect(out.notification?.title).toContain('2')
    expect(out.notification?.link).toBe('/projects')
  })

  it('affaire gagnée / perdue : nomme le compte et le délai ; le motif seulement s’il est déclaré', async () => {
    const won = await executorsWith({
      wonDealsToExpand: { measured: true, rows: [{ company_name: 'Société Générale', days: 74 }] },
    }).run('won_deal_expansion', 'u1', NOW, 'w1')
    expect(won.notification?.body).toContain('Société Générale')
    expect(won.notification?.body).toContain('74')
    expect(won.notification?.link).toBe('/accounts')

    const withReason = await executorsWith({
      lostDealsToRevisit: { measured: true, rows: [{ company_name: 'Airbus', days: 190, loss_reason: 'budget gelé' }] },
    }).run('lost_deal_revisit', 'u1', NOW, 'w1')
    expect(withReason.notification?.body).toContain('budget gelé')

    const noReason = await executorsWith({
      lostDealsToRevisit: { measured: true, rows: [{ company_name: 'Airbus', days: 190, loss_reason: null }] },
    }).run('lost_deal_revisit', 'u1', NOW, 'w1')
    expect(noReason.notification?.body).toContain('Airbus')
    expect(noReason.notification?.body).not.toContain('null')
    expect(noReason.notification?.body).not.toMatch(/motif/i)
  })
})
