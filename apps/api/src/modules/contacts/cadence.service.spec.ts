import { CADENCE_TEMPLATE, CadenceService, computeCadenceSchedule } from './cadence.service'
import { cadencePatternForState } from './cadence-templates'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

describe('cadence date logic', () => {
  it('CADENCE_TEMPLATE has the 4 Théo touches at offsets +1/+3/+6/+9', () => {
    expect(CADENCE_TEMPLATE.map(s => [s.key, s.offsetDays])).toEqual([
      ['initial', 1],
      ['relance', 3],
      ['preuve_sociale', 6],
      ['close_loop', 9],
    ])
    // Exactly one step is the opening message; the other three are follow-ups.
    expect(CADENCE_TEMPLATE.filter(s => s.isInitial)).toHaveLength(1)
    expect(CADENCE_TEMPLATE.filter(s => !s.isInitial).map(s => s.key)).toEqual([
      'relance',
      'preuve_sociale',
      'close_loop',
    ])
  })

  describe('computeCadenceSchedule', () => {
    it('adds the template offsets to the anchor calendar date', () => {
      const steps = computeCadenceSchedule('2026-07-15')
      expect(steps.map(s => [s.key, s.due_date])).toEqual([
        ['initial', '2026-07-16'],
        ['relance', '2026-07-18'],
        ['preuve_sociale', '2026-07-21'],
        ['close_loop', '2026-07-24'],
      ])
    })

    it('applies a relationship pattern when one is passed (LinkedIn 3-touch)', () => {
      const steps = computeCadenceSchedule('2026-07-15', cadencePatternForState('linkedin'))
      expect(steps.map(s => [s.key, s.due_date])).toEqual([
        ['initial', '2026-07-16'],
        ['relance', '2026-07-19'],
        ['preuve_sociale', '2026-07-22'],
        ['close_loop', '2026-07-25'],
      ])
    })

    it('rolls over month boundaries', () => {
      const relance = computeCadenceSchedule('2026-01-30').find(s => s.key === 'relance')
      expect(relance?.due_date).toBe('2026-02-02')
    })

    it('rolls over a leap-February boundary correctly', () => {
      const relance = computeCadenceSchedule('2024-02-27').find(s => s.key === 'relance')
      expect(relance?.due_date).toBe('2024-03-01')
    })

    it('carries the human label from the template', () => {
      const preuve = computeCadenceSchedule('2026-07-15').find(s => s.key === 'preuve_sociale')
      expect(preuve?.label).toBe('Preuve sociale')
    })
  })
})

describe('CadenceService', () => {
  let service: CadenceService
  let items: MockRepository<ActionPlanItemEntity>
  let accounts: MockRepository<AccountEntity>

  const contact = (over: Partial<ContactEntity> = {}): ContactEntity =>
    ({
      id: 'c1',
      user_id: 'user-1',
      account_id: 'acc-1',
      full_name: 'Jean Dupont',
      email_sent_at: new Date('2026-07-15T09:00:00.000Z'),
      ...over,
    }) as ContactEntity

  // The account whose relationship state drives the pattern. Default: a cold
  // (untriaged, no salesContext) account → the standard schedule.
  const setAccount = (over: Partial<AccountEntity> = {}) => {
    accounts.findOne.mockResolvedValue({
      id: 'acc-1',
      commercial_status: 'inbox',
      raw_analysis: {},
      ...over,
    } as AccountEntity)
  }

  beforeEach(() => {
    items = createMockRepository<ActionPlanItemEntity>()
    accounts = createMockRepository<AccountEntity>()
    setAccount()
    service = new CadenceService(items as never, accounts as never)
  })

  // #2671.5 (balayage de la famille) — le compte qui décide du motif de
  // cadence se lit sous la borne d'espace du contact. Le faux dépôt rend le
  // compte de ws-autre à toute requête SANS `workspace_id`, comme la base.
  it('#2671.5 — le compte d’un autre espace ne décide pas de la cadence d’un contact de ws-1', async () => {
    const leaks: string[] = []
    accounts.findOne.mockReset()
    accounts.findOne.mockImplementation(async (opts: { where?: Record<string, unknown> }) => {
      const where = opts?.where ?? {}
      if ('workspace_id' in where && where.workspace_id !== 'ws-autre') return null
      leaks.push(String(where.id))
      return { id: 'acc-autre', workspace_id: 'ws-autre', commercial_status: 'won', raw_analysis: {} } as AccountEntity
    })
    items.find.mockResolvedValueOnce([])
    items.create.mockImplementation(input => input as ActionPlanItemEntity)

    await service.scheduleForContact(contact({ account_id: 'acc-autre', workspace_id: 'ws-1' }), 'user-1')

    expect(leaks).toEqual([])
  })

  // #3289.29 — la cadence suit le jour que l'espace a appris pour ses relances.
  describe('jour appris (#3289.29)', () => {
    const withWeekday = (weekday: 'tuesday' | null) =>
      new CadenceService(items as never, accounts as never, (async () => weekday) as never)

    it('cale chaque relance sur le prochain mardi, jamais plus tôt, sans doublon de jour', async () => {
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)
      await withWeekday('tuesday').scheduleForContact(contact({ workspace_id: 'ws-1' }), 'user-1')
      const due = items.create.mock.calls.map(c => (c[0] as ActionPlanItemEntity).due_date)
      // nominal 18 (sam.) / 21 (mar.) / 24 (ven.) → 21 / 28 / 04-08.
      expect(due).toEqual(['2026-07-21', '2026-07-28', '2026-08-04'])
    })

    it("sans créneau appris, l'échéancier est exactement le nominal", async () => {
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)
      await withWeekday(null).scheduleForContact(contact({ workspace_id: 'ws-1' }), 'user-1')
      expect(items.create.mock.calls.map(c => (c[0] as ActionPlanItemEntity).due_date)).toEqual([
        '2026-07-18',
        '2026-07-21',
        '2026-07-24',
      ])
    })

    it("l'aperçu de la carte porte les mêmes dates que celles qui seront posées", async () => {
      items.find.mockResolvedValueOnce([])
      const cadence = await withWeekday('tuesday').buildCadence(contact({ workspace_id: 'ws-1' }))
      expect(cadence.steps.filter(s => s.key !== 'initial').map(s => s.due_date)).toEqual([
        '2026-07-21',
        '2026-07-28',
        '2026-08-04',
      ])
    })
  })

  describe('scheduleForContact', () => {
    it('creates the 3 follow-up items (relance/preuve/close) as dated, todo cadence rows', async () => {
      items.find.mockResolvedValueOnce([]) // no existing cadence
      items.create.mockImplementation(input => input as ActionPlanItemEntity)

      await service.scheduleForContact(contact(), 'user-1')

      const created = items.create.mock.calls.map(c => c[0] as Partial<ActionPlanItemEntity>)
      expect(created.map(r => r.cadence_step)).toEqual(['relance', 'preuve_sociale', 'close_loop'])
      expect(created.map(r => r.due_date)).toEqual(['2026-07-18', '2026-07-21', '2026-07-24'])
      expect(created.every(r => r.contact_id === 'c1')).toBe(true)
      expect(created.every(r => r.account_id === 'acc-1' && r.user_id === 'user-1')).toBe(true)
      expect(created.every(r => r.done === false && r.execution_status === 'todo')).toBe(true)
      // The opening message ("initial") is what triggered the cadence — not a
      // scheduled follow-up.
      expect(created.some(r => r.cadence_step === 'initial')).toBe(false)
      expect(items.save).toHaveBeenCalledTimes(1)
    })

    it('#3274.4 — chaque relance de la cadence porte la règle « le non-résultat est un résultat »', async () => {
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)
      await service.scheduleForContact(contact(), 'user-1')
      const created = items.create.mock.calls.map(c => c[0] as Partial<ActionPlanItemEntity>)
      expect(created.map(r => r.method_rule)).toEqual(Array(3).fill('non_resultat_est_un_resultat'))
    })

    it('labels each item with the touch + contact name so the relance cron reads well', async () => {
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)
      await service.scheduleForContact(contact(), 'user-1')
      const labels = items.create.mock.calls.map(c => (c[0] as ActionPlanItemEntity).label)
      expect(labels[0]).toContain('Jean Dupont')
      expect(labels[0]).toContain('Relance')
    })

    it('is idempotent: skips creation when cadence items already exist for the contact', async () => {
      items.find.mockResolvedValueOnce([{ id: 'existing' } as ActionPlanItemEntity])
      await service.scheduleForContact(contact(), 'user-1')
      expect(items.create).not.toHaveBeenCalled()
      expect(items.save).not.toHaveBeenCalled()
    })

    it('anchors on the day the contact was emailed (email_sent_at)', async () => {
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)
      await service.scheduleForContact(contact({ email_sent_at: new Date('2026-03-10T12:00:00.000Z') }), 'user-1')
      const dues = items.create.mock.calls.map(c => (c[0] as ActionPlanItemEntity).due_date)
      expect(dues).toEqual(['2026-03-13', '2026-03-16', '2026-03-19'])
    })

    it('#4418 — un geste MANUEL (« Marquer envoyé ») ancre sur le jour du geste, pas sur un ancien envoi Bellum', async () => {
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)
      await service.scheduleForContact(
        contact({ email_sent_at: new Date('2026-03-10T12:00:00.000Z') }),
        'user-1',
        new Date('2026-10-21T08:00:00.000Z'),
      )
      const dues = items.create.mock.calls.map(c => (c[0] as ActionPlanItemEntity).due_date)
      expect(dues).toEqual(['2026-10-24', '2026-10-27', '2026-10-30'])
    })

    it('#4418 — seules les relances de cadence déjà posées bloquent : une autre action du contact ne la supprime pas', async () => {
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)
      await service.scheduleForContact(contact(), 'user-1')
      const where = items.find.mock.calls[0][0].where as Record<string, unknown>
      expect(where.contact_id).toBe('c1')
      expect(where.cadence_step).toBeDefined()
    })

    it('#4418/#4181 — les relances planifiées portent les clés que « réponse reçue » rend caduques', async () => {
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)
      await service.scheduleForContact(contact(), 'user-1', new Date('2026-10-21T08:00:00.000Z'))
      const keys = items.create.mock.calls.map(c => (c[0] as ActionPlanItemEntity).cadence_step)
      // Ces trois clés sont exactement celles de `MailboxService.closeFollowUpTasks` (#4181.2).
      expect(keys.every(k => ['relance', 'preuve_sociale', 'close_loop'].includes(String(k)))).toBe(true)
    })

    it("materialises the relationship pattern (#4418.1 LinkedIn → les 3 relances, décalées d'un jour)", async () => {
      setAccount({
        raw_analysis: {
          salesContext: { relationship: { state: 'linkedin', evidence: ['contexte: linkedin'] } },
        } as never,
      })
      items.find.mockResolvedValueOnce([])
      items.create.mockImplementation(input => input as ActionPlanItemEntity)

      await service.scheduleForContact(contact(), 'user-1')

      const created = items.create.mock.calls.map(c => c[0] as Partial<ActionPlanItemEntity>)
      // #4418.1 — la relation DÉCALE la série J+3/J+6/J+9 (ici +1 jour), elle ne la remplace pas.
      expect(created.map(r => r.cadence_step)).toEqual(['relance', 'preuve_sociale', 'close_loop'])
      expect(created.map(r => r.due_date)).toEqual(['2026-07-19', '2026-07-22', '2026-07-25'])
    })
  })

  // #2733 (SKAIZen Group, 22/09/2026) — un e-mail rebondi (adresse
  // inexistante) ne doit plus relancer quelqu'un qui n'a rien reçu. Les
  // touches déjà JOUÉES (`done: true`) restent un fait passé — on archive, on
  // ne supprime pas ; seules les touches encore À VENIR sont retirées.
  describe('cancelPendingForBounce', () => {
    it("retire les touches À VENIR (done: false) d'un contact rebondi", async () => {
      await service.cancelPendingForBounce('c1')
      expect(items.delete).toHaveBeenCalledWith({ contact_id: 'c1', done: false })
    })

    it('ne touche pas les touches déjà jouées — elles restent un fait passé', async () => {
      await service.cancelPendingForBounce('c1')
      const call = items.delete.mock.calls[0][0] as Record<string, unknown>
      expect(call.done).toBe(false)
      expect(Object.keys(call)).not.toContain('done_at')
    })
  })

  describe('completeOpenItemsByProof (#2396.3)', () => {
    const openContactItem = (over: Partial<ActionPlanItemEntity> = {}) =>
      ({
        id: 'i1',
        contact_id: 'c1',
        execution_status: 'todo',
        target_kind: 'contact',
        done: false,
        outcome: null,
        completion_mode: null,
        ...over,
      }) as ActionPlanItemEntity

    it('marque `done` avec le mode `proof`, sans outcome, les lignes todo/preparées visant le contact', async () => {
      items.find.mockResolvedValueOnce([openContactItem()])
      items.save.mockImplementation(async (rows: ActionPlanItemEntity[]) => rows)

      await service.completeOpenItemsByProof('c1')

      const [saved] = items.save.mock.calls[0] as [ActionPlanItemEntity[]]
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatchObject({ execution_status: 'done', done: true, completion_mode: 'proof', outcome: null })
      expect(saved[0].completed_at).toBeInstanceOf(Date)
    })

    // #2396.11 — le cliquet : une vérification ou une tâche CRM sur le MÊME
    // contact n'est pas une prise de contact, la compléter serait un mensonge.
    // La requête elle-même exclut ces lignes (`target_kind: 'contact'`).
    it('interroge SEULEMENT les lignes dont l’objet est le contact (todo/prepared)', async () => {
      items.find.mockResolvedValueOnce([])
      await service.completeOpenItemsByProof('c1')
      expect(items.find).toHaveBeenCalledWith({
        where: [
          { contact_id: 'c1', execution_status: 'todo', target_kind: 'contact' },
          { contact_id: 'c1', execution_status: 'prepared', target_kind: 'contact' },
        ],
      })
    })

    it("n'écrit rien quand aucune ligne ouverte ne vise ce contact", async () => {
      items.find.mockResolvedValueOnce([])
      await service.completeOpenItemsByProof('c1')
      expect(items.save).not.toHaveBeenCalled()
    })
  })

  describe('buildCadence', () => {
    it('returns the 4-step schedule with the initial marked done once contacted', async () => {
      items.find.mockResolvedValueOnce([]) // nothing persisted yet
      const cadence = await service.buildCadence(contact())

      expect(cadence.contact_id).toBe('c1')
      expect(cadence.contacted).toBe(true)
      expect(cadence.anchor_date).toBe('2026-07-15')
      expect(cadence.steps.map(s => s.key)).toEqual(['initial', 'relance', 'preuve_sociale', 'close_loop'])
      expect(cadence.steps.find(s => s.key === 'initial')?.done).toBe(true)
      // No follow-up items persisted ⇒ not scheduled, next step is the relance.
      expect(cadence.scheduled).toBe(false)
      expect(cadence.next_step?.key).toBe('relance')
    })

    it('reflects persisted follow-up items (done state + item id) and advances next_step', async () => {
      items.find.mockResolvedValueOnce([
        { id: 'i-relance', cadence_step: 'relance', due_date: '2026-07-18', done: true } as ActionPlanItemEntity,
        { id: 'i-preuve', cadence_step: 'preuve_sociale', due_date: '2026-07-21', done: false } as ActionPlanItemEntity,
      ])
      const cadence = await service.buildCadence(contact())

      expect(cadence.scheduled).toBe(true)
      const relance = cadence.steps.find(s => s.key === 'relance')
      expect(relance?.done).toBe(true)
      expect(relance?.item_id).toBe('i-relance')
      // initial done + relance done ⇒ next is preuve sociale.
      expect(cadence.next_step?.key).toBe('preuve_sociale')
    })

    it('previews from today (contacted:false, anchor null) when the contact was never emailed', async () => {
      items.find.mockResolvedValueOnce([])
      const cadence = await service.buildCadence(contact({ email_sent_at: null }))

      expect(cadence.contacted).toBe(false)
      expect(cadence.anchor_date).toBeNull()
      expect(cadence.steps).toHaveLength(4)
      // Not contacted ⇒ the opening message is the next step.
      expect(cadence.next_step?.key).toBe('initial')
    })

    it('exposes the relationship scenario (state + template + cited rule) that produced the schedule', async () => {
      setAccount({ commercial_status: 'customer', raw_analysis: {} })
      items.find.mockResolvedValueOnce([])
      const cadence = await service.buildCadence(contact())

      expect(cadence.scenario.state).toBe('client_actif')
      expect(cadence.scenario.template).toBe('client_expansion')
      expect(cadence.scenario.citation.evidence).toEqual(['kanban: customer'])
      // Client-expansion pattern → the follow-ups are the expansion touches.
      expect(cadence.steps.map(s => s.key)).toEqual(['initial', 'relance', 'preuve_sociale', 'close_loop'])
    })

    it('a cold account keeps the standard scenario and the historical schedule', async () => {
      items.find.mockResolvedValueOnce([])
      const cadence = await service.buildCadence(contact())
      expect(cadence.scenario.state).toBe('froid')
      expect(cadence.scenario.template).toBe('standard')
      expect(cadence.steps.map(s => s.key)).toEqual(['initial', 'relance', 'preuve_sociale', 'close_loop'])
    })

    // #2645.2 — la preuve que le modèle de revenu n'est pas qu'une valeur dans
    // un contrat : il change les DATES que le commercial voit sur sa carte.
    it('un revenu ponctuel déclaré resserre les relances et repousse la reprise après livraison', async () => {
      setAccount({
        raw_analysis: { salesContext: { esnProfile: { businessModel: { revenueModel: 'ponctuel' } } } } as never,
      })
      items.find.mockResolvedValueOnce([])
      const cadence = await service.buildCadence(contact())

      expect(cadence.scenario.template).toBe('standard') // le patron ne change pas
      expect(cadence.steps.map(s => s.offset_days)).toEqual([1, 2, 4, 34])
    })

    it('un revenu récurrent déclaré étire le suivi sur le même patron', async () => {
      setAccount({
        raw_analysis: { salesContext: { esnProfile: { businessModel: { revenueModel: 'recurrent' } } } } as never,
      })
      items.find.mockResolvedValueOnce([])
      const cadence = await service.buildCadence(contact())

      expect(cadence.steps.map(s => s.offset_days)).toEqual([1, 5, 9, 14])
    })
  })
})
