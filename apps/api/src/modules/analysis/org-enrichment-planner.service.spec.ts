import { failure, isFailure, success } from '@bellum/utils'
import { ORG_ENRICHMENT_WAVE_SIZE } from '@bellum/contracts'
import { OrgEnrichmentPlannerService } from './org-enrichment-planner.service'

const ACCOUNT = { id: 'acc-1', workspace_id: 'ws-1' }

function contactRow(overrides: Partial<Record<string, unknown>> & { id: string }) {
  return {
    full_name: `Contact ${overrides.id}`,
    title: null,
    entity: null,
    family: null,
    priority: null,
    ...overrides,
  }
}

function makeService(opts?: {
  contacts?: unknown[]
  coverageGaps?: unknown
  account?: unknown
  hasCredit?: boolean
  waveResult?: unknown
}) {
  const accounts = { findOne: jest.fn().mockResolvedValue(success(opts?.account ?? ACCOUNT)) }
  const contactsService = { findByAccount: jest.fn().mockResolvedValue(opts?.contacts ?? []) }
  const coverage =
    opts?.coverageGaps === undefined
      ? undefined
      : { computeForAccount: jest.fn().mockResolvedValue({ gaps: opts.coverageGaps }) }
  const credits = {
    hasEnrichmentCredit: jest.fn().mockResolvedValue(opts?.hasCredit ?? true),
    consumeAnalysisSlot: jest.fn().mockResolvedValue({ ok: true, used: 1, limit: 250 }),
  }
  const onDemand = {
    enrichOrganigramWave: jest.fn().mockResolvedValue(opts?.waveResult ?? success({ matched: 2, total: 2 })),
  }
  const service = new OrgEnrichmentPlannerService(
    accounts as never,
    contactsService as never,
    coverage as never,
    credits as never,
    onDemand as never,
  )
  return { service, accounts, contactsService, coverage, credits, onDemand }
}

describe('OrgEnrichmentPlannerService.estimate', () => {
  it('refuse un compte introuvable', async () => {
    const { service, accounts } = makeService()
    accounts.findOne.mockResolvedValue(failure({ code: 'not_found', message: 'nope' }))
    const result = await service.estimate('acc-x', 'user-1', { mode: 'next_batch' })
    expect(isFailure(result)).toBe(true)
  })

  // P5 (29/09) — `enrichment-plan` mesuré à 5,0 s : le compte et ses contacts se
  // lisaient en série, et les contacts étaient SCORÉS (relecture du compte) pour
  // rien. Plafond : 1 lecture de compte, 1 lecture de contacts, sans score, quel
  // que soit le nombre de contacts (3 puis 30), et les deux en vol ensemble.
  it.each([3, 30])('P5 — compte et contacts en vol ensemble, contacts non scorés (%i contacts)', async n => {
    const contacts = Array.from({ length: n }, (_, i) => contactRow({ id: `c${i}` }))
    const { service, accounts, contactsService } = makeService({ contacts })
    let inFlight = 0
    let peak = 0
    const tracked =
      <T>(value: T) =>
      async (): Promise<T> => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise(resolve => setImmediate(resolve))
        inFlight -= 1
        return value
      }
    accounts.findOne.mockImplementation(tracked(success(ACCOUNT)))
    contactsService.findByAccount.mockImplementation(tracked(contacts))

    await service.estimate('acc-1', 'user-1', { mode: 'next_batch' })

    expect(accounts.findOne).toHaveBeenCalledTimes(1)
    expect(contactsService.findByAccount).toHaveBeenCalledTimes(1)
    expect(contactsService.findByAccount).toHaveBeenCalledWith('acc-1', 'user-1', null, { scored: false })
    expect(peak).toBe(2)
  })

  it('next_batch : coût EXACT via creditCostOf, jamais un nombre recopié', async () => {
    const contacts = Array.from({ length: 5 }, (_, i) => contactRow({ id: `c${i}` }))
    const { service } = makeService({ contacts })
    const result = await service.estimate('acc-1', 'user-1', { mode: 'next_batch' })
    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    expect(result.output.contactsTargeted).toEqual({ status: 'measured', value: 5 })
    expect(result.output.waveCount).toEqual({ status: 'measured', value: 1 })
    // creditCostOf('targeted_refresh', { perimeterUnits: 5 }) = min(3, 1 + 4) = 3
    expect(result.output.estimatedCredits).toEqual({ status: 'measured', value: 3 })
    expect(result.output.waveSize).toBe(ORG_ENRICHMENT_WAVE_SIZE)
  })

  it('un compte sans rien à enrichir coûte ZÉRO — mesuré, jamais « unknown »', async () => {
    const { service } = makeService({ contacts: [] })
    const result = await service.estimate('acc-1', 'user-1', { mode: 'next_batch' })
    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    expect(result.output.contactsTargeted).toEqual({ status: 'measured', value: 0 })
    expect(result.output.estimatedCredits).toEqual({ status: 'measured', value: 0 })
    expect(result.output.waveCount).toEqual({ status: 'measured', value: 0 })
  })

  it('full_account : plusieurs vagues, le coût est la SOMME de chaque vague plafonnée', async () => {
    // 120 contacts -> vagues de 50/50/20. targeted_refresh plafonne à 3 crédits
    // dès que la vague atteint 3 contacts (base 1 + 1/unité, max 3) — donc les
    // TROIS vagues coûtent 3 chacune : 3+3+3 = 9, jamais un 8 approximatif.
    const contacts = Array.from({ length: 120 }, (_, i) => contactRow({ id: `c${i}` }))
    const { service } = makeService({ contacts })
    const result = await service.estimate('acc-1', 'user-1', { mode: 'full_account' })
    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    expect(result.output.contactsTargeted).toEqual({ status: 'measured', value: 120 })
    expect(result.output.waveCount).toEqual({ status: 'measured', value: 3 })
    expect(result.output.estimatedCredits).toEqual({ status: 'measured', value: 9 })
  })

  it('missing_roles : le service de couverture indisponible rend un coût INCONNU, jamais 0', async () => {
    const { service } = makeService({ contacts: [contactRow({ id: 'a', title: 'RSSI' })], coverageGaps: undefined })
    const result = await service.estimate('acc-1', 'user-1', { mode: 'missing_roles' })
    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    expect(result.output.contactsTargeted.status).toBe('unknown')
    expect(result.output.estimatedCredits.status).toBe('unknown')
  })

  it('missing_roles : coverage disponible calcule un coût mesuré', async () => {
    const contacts = [contactRow({ id: 'a', title: 'RSSI Groupe' }), contactRow({ id: 'b', title: 'Développeur' })]
    const gaps = [
      {
        family: 'cyber',
        family_label: 'Cyber / Sécurité',
        level: 'n1',
        level_label: 'N-1',
        label: 'Cyber',
        suggested_titles: 'RSSI',
        reason: 'gap',
        priority: 1,
      },
    ]
    const { service } = makeService({ contacts, coverageGaps: gaps })
    const result = await service.estimate('acc-1', 'user-1', { mode: 'missing_roles' })
    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    expect(result.output.contactsTargeted).toEqual({ status: 'measured', value: 1 })
    expect(result.output.scopeLabel).toContain('Cyber')
  })

  it('direction : refuse un paramètre entity manquant avant tout calcul', async () => {
    const { service, contactsService } = makeService({ contacts: [contactRow({ id: 'a' })] })
    const result = await service.estimate('acc-1', 'user-1', { mode: 'direction' })
    expect(isFailure(result)).toBe(true)
    expect(contactsService.findByAccount).not.toHaveBeenCalled()
  })

  it('hierarchy_level : refuse un paramètre hierarchyLevels manquant avant tout calcul', async () => {
    const { service } = makeService({ contacts: [] })
    const result = await service.estimate('acc-1', 'user-1', { mode: 'hierarchy_level' })
    expect(isFailure(result)).toBe(true)
  })
})

describe('OrgEnrichmentPlannerService.confirmWave', () => {
  it('lance la vague via enrichOrganigramWave et débite APRÈS succès — jamais un nombre recopié', async () => {
    const contacts = Array.from({ length: 5 }, (_, i) => contactRow({ id: `c${i}` }))
    const { service, onDemand, credits } = makeService({ contacts, waveResult: success({ matched: 3, total: 5 }) })

    const result = await service.confirmWave('acc-1', 'user-1', { mode: 'next_batch' })

    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    expect(onDemand.enrichOrganigramWave).toHaveBeenCalledWith('acc-1', 'user-1', expect.arrayContaining(['c0']))
    expect(onDemand.enrichOrganigramWave.mock.calls[0][2]).toHaveLength(5)
    // creditCostOf('targeted_refresh', { perimeterUnits: 5 }) = 3, comme l'estimation
    expect(result.output).toEqual({ matched: 3, waveSize: 5, creditsDebited: 3, remaining: 0 })
    expect(credits.consumeAnalysisSlot).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ accountId: 'acc-1', cost: 3 }),
    )
  })

  it('remaining > 0 quand le périmètre dépasse une vague — full_account sur 120 contacts', async () => {
    const contacts = Array.from({ length: 120 }, (_, i) => contactRow({ id: `c${i}` }))
    const { service } = makeService({ contacts })

    const result = await service.confirmWave('acc-1', 'user-1', { mode: 'full_account' })

    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    expect(result.output.waveSize).toBe(50)
    expect(result.output.remaining).toBe(70)
  })

  it('refuse — zéro appel IA, zéro débit — quand plus aucun crédit', async () => {
    const contacts = [contactRow({ id: 'a' })]
    const { service, onDemand, credits } = makeService({ contacts, hasCredit: false })

    const result = await service.confirmWave('acc-1', 'user-1', { mode: 'next_batch' })

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('insufficient_credits')
    expect(onDemand.enrichOrganigramWave).not.toHaveBeenCalled()
    expect(credits.consumeAnalysisSlot).not.toHaveBeenCalled()
  })

  it('refuse sans débiter quand il n’y a rien à enrichir dans ce périmètre', async () => {
    const { service, onDemand, credits } = makeService({ contacts: [] })

    const result = await service.confirmWave('acc-1', 'user-1', { mode: 'next_batch' })

    expect(isFailure(result)).toBe(true)
    expect(onDemand.enrichOrganigramWave).not.toHaveBeenCalled()
    expect(credits.consumeAnalysisSlot).not.toHaveBeenCalled()
  })

  it('ne débite pas quand la classification échoue', async () => {
    const contacts = [contactRow({ id: 'a' })]
    const { service, credits } = makeService({
      contacts,
      waveResult: failure({ code: 'ia_failed', message: 'boom' }),
    })

    const result = await service.confirmWave('acc-1', 'user-1', { mode: 'next_batch' })

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('ia_failed')
    expect(credits.consumeAnalysisSlot).not.toHaveBeenCalled()
  })

  it('un débit qui échoue ne défait pas une vague acquise (best-effort, comme verifyOrgRelation)', async () => {
    const contacts = [contactRow({ id: 'a' })]
    const { service, credits } = makeService({ contacts })
    credits.consumeAnalysisSlot.mockRejectedValue(new Error('ledger down'))

    const result = await service.confirmWave('acc-1', 'user-1', { mode: 'next_batch' })

    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    expect(result.output.matched).toBe(2)
  })

  it('refuse un mode direction sans entité, comme estimate — jamais de sélection sur un paramètre absent', async () => {
    const { service, contactsService } = makeService({ contacts: [contactRow({ id: 'a' })] })

    const result = await service.confirmWave('acc-1', 'user-1', { mode: 'direction' })

    expect(isFailure(result)).toBe(true)
    expect(contactsService.findByAccount).not.toHaveBeenCalled()
  })
})

/**
 * #2637.1 (21/09/2026, décision Louis) — le cinquième argument `free` de
 * `runWave` porte la gratuité du rattrapage automatique jusqu'ici, dernier
 * maillon avant le débit réel. `false`/absent (le bouton MANUEL,
 * `confirmWave` ci-dessus) reste inchangé — déjà couvert plus haut.
 */
describe('OrgEnrichmentPlannerService.runWave — gratuit (#2637.1)', () => {
  it('`free: true` ne débite RIEN (`consumeAnalysisSlot` jamais appelé), mais le coût réel reste MESURÉ', async () => {
    const contacts = Array.from({ length: 5 }, (_, i) => contactRow({ id: `c${i}` }))
    const { service, credits } = makeService({ contacts, waveResult: success({ matched: 3, total: 5 }) })

    const result = await service.runWave('acc-1', 'user-1', 'missing_roles', ['c0', 'c1', 'c2', 'c3', 'c4'], true)

    expect(isFailure(result)).toBe(false)
    if (isFailure(result)) return
    // creditCostOf('targeted_refresh', { perimeterUnits: 5 }) = 3, comme le
    // chemin payant — le coût réel reste identique, seul le débit disparaît.
    expect(result.output).toEqual({ matched: 3, creditsDebited: 3 })
    expect(credits.consumeAnalysisSlot).not.toHaveBeenCalled()
  })

  it('`free` absent (défaut) débite normalement — le chemin MANUEL n’est pas touché', async () => {
    const contacts = [contactRow({ id: 'a' })]
    const { service, credits } = makeService({ contacts })

    const result = await service.runWave('acc-1', 'user-1', 'next_batch', ['a'])

    expect(isFailure(result)).toBe(false)
    expect(credits.consumeAnalysisSlot).toHaveBeenCalledWith('user-1', expect.objectContaining({ accountId: 'acc-1' }))
  })
})
