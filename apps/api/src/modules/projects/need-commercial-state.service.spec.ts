import { NeedCommercialStateService } from './need-commercial-state.service'

/**
 * #2339.1/.2/.5/.6/.11/.13 (épopée #2795) — le second lecteur du journal
 * append-only besoin→shortlist→positionnement→mission (#2320.23), pour UN
 * besoin. Chaque méthode reste une LECTURE : aucun test ici n'attend une
 * écriture.
 */
describe('NeedCommercialStateService', () => {
  const build = (opts: {
    need?: Record<string, unknown> | null
    siblings?: Record<string, unknown>[]
    shortlists?: Record<string, unknown>[]
    submissions?: Record<string, unknown>[]
    missions?: Record<string, unknown>[]
    history?: unknown[]
  }) => {
    const needs = {
      findOne: jest.fn().mockResolvedValue(opts.need ?? null),
      find: jest.fn().mockResolvedValue(opts.siblings ?? []),
    }
    const shortlists = { find: jest.fn().mockResolvedValue(opts.shortlists ?? []) }
    const submissions = { find: jest.fn().mockResolvedValue(opts.submissions ?? []) }
    const missions = { find: jest.fn().mockResolvedValue(opts.missions ?? []) }
    const commercialTransitions = { history: jest.fn().mockResolvedValue(opts.history ?? []) }
    const service = new NeedCommercialStateService(
      needs as never,
      shortlists as never,
      submissions as never,
      missions as never,
      commercialTransitions as never,
    )
    return { service, needs, shortlists, submissions, missions, commercialTransitions }
  }

  describe('journal (#2339.1)', () => {
    it("fusionne les quatre sujets, triés par date d'occurrence", async () => {
      const { service, commercialTransitions } = build({
        need: { id: 'n-1', workspace_id: 'w-1', status: 'qualified' },
        shortlists: [{ id: 's-1' }],
        submissions: [{ id: 'sub-1' }],
        missions: [{ id: 'm-1' }],
      })
      commercialTransitions.history.mockImplementation((subjectType: string) => {
        const at = {
          need: '2026-09-01T00:00:00Z',
          shortlist: '2026-09-03T00:00:00Z',
          submission: '2026-09-05T00:00:00Z',
          mission: '2026-09-02T00:00:00Z',
        }[subjectType]
        return Promise.resolve([
          {
            id: `t-${subjectType}`,
            subjectType,
            subjectId: 'x',
            fromState: null,
            toState: 'ok',
            actorId: null,
            proof: null,
            nextAction: null,
            occurredAt: at,
          },
        ])
      })
      const result = await service.journal('w-1', 'n-1')
      expect(result?.entries.map(e => e.subjectLabel)).toEqual(['need', 'mission', 'shortlist', 'submission'])
    })

    it("`null` quand le besoin n'existe pas ou appartient à un autre espace", async () => {
      const { service, commercialTransitions } = build({ need: null })
      const result = await service.journal('w-1', 'n-inconnu')
      expect(result).toBeNull()
      expect(commercialTransitions.history).not.toHaveBeenCalled()
    })
  })

  describe('missionHandoffCheck (#2339.2)', () => {
    it('refuse quand aucun positionnement n’a de consultant engagé', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', status: 'client_review' },
        submissions: [{ stage: 'shortlisted', substatus: null }],
      })
      const result = await service.missionHandoffCheck('w-1', 'n-1')
      expect(result).toEqual({
        needId: 'n-1',
        status: 'client_review',
        allowed: false,
        missing: ['consultant_engaged'],
        existingMissionId: null,
      })
    })

    it('refuse quand une mission ACTIVE existe déjà pour ce besoin', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', status: 'won' },
        submissions: [{ stage: 'accepted', substatus: null }],
        missions: [{ id: 'm-1', status: 'active' }],
      })
      const result = await service.missionHandoffCheck('w-1', 'n-1')
      expect(result).toEqual({
        needId: 'n-1',
        status: 'won',
        allowed: false,
        missing: ['mission_already_exists'],
        existingMissionId: 'm-1',
      })
    })

    it('autorise quand un consultant est engagé et qu’aucune mission active n’existe', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', status: 'won' },
        submissions: [{ stage: 'accepted', substatus: null }],
        missions: [{ id: 'm-old', status: 'ended' }],
      })
      const result = await service.missionHandoffCheck('w-1', 'n-1')
      expect(result).toEqual({ needId: 'n-1', status: 'won', allowed: true, missing: [], existingMissionId: null })
    })

    // #4270.4 (18/10) — gagné, un forfait encadré devient une mission suivie sans staffing.
    it('autorise un forfait ENCADRÉ sans aucun positionnement — pas de consultant à engager', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', status: 'won', delivery_mode: 'supervised' },
        submissions: [],
        missions: [],
      })
      const result = await service.missionHandoffCheck('w-1', 'n-1')
      expect(result).toEqual({ needId: 'n-1', status: 'won', allowed: true, missing: [], existingMissionId: null })
    })
  })

  describe('duplicateCandidates (#2339.5/.6)', () => {
    it('propose un besoin du même compte au même intitulé, sans jamais fusionner', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', account_id: 'a-1', title: 'Architecte Java', skills: [] },
        siblings: [
          {
            id: 'n-1',
            account_id: 'a-1',
            title: 'Architecte Java',
            skills: [],
            status: 'qualified',
            archived_at: null,
          },
          {
            id: 'n-2',
            account_id: 'a-1',
            title: 'architecte java',
            skills: [],
            status: 'to_qualify',
            archived_at: null,
          },
          { id: 'n-3', account_id: 'a-1', title: 'Chef de projet', skills: [], status: 'lost', archived_at: null },
        ],
      })
      const result = await service.duplicateCandidates('w-1', 'n-1')
      expect(result?.candidates).toEqual([
        { needId: 'n-2', title: 'architecte java', status: 'to_qualify', reason: 'meme_intitule' },
      ])
    })

    it('aucun candidat reste une liste vide, jamais une absence de réponse', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', account_id: 'a-1', title: 'Architecte Java', skills: [] },
        siblings: [
          {
            id: 'n-1',
            account_id: 'a-1',
            title: 'Architecte Java',
            skills: [],
            status: 'qualified',
            archived_at: null,
          },
        ],
      })
      const result = await service.duplicateCandidates('w-1', 'n-1')
      expect(result).toEqual({ needId: 'n-1', candidates: [] })
    })
  })

  describe('noGoState (#2339.13)', () => {
    it('NO-GO sur deux missions actives issues du même besoin', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', status: 'won' },
        missions: [
          { id: 'm-1', status: 'active' },
          { id: 'm-2', status: 'onboarding' },
        ],
      })
      const result = await service.noGoState('w-1', 'n-1')
      expect(result).toEqual({ needId: 'n-1', status: 'won', noGo: true, reasons: ['mission_dupliquee'] })
    })

    it('NO-GO sur un besoin clos qui porte encore une mission active', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', status: 'cancelled' },
        missions: [{ id: 'm-1', status: 'active' }],
      })
      const result = await service.noGoState('w-1', 'n-1')
      expect(result).toEqual({
        needId: 'n-1',
        status: 'cancelled',
        noGo: true,
        reasons: ['besoin_clos_mission_active'],
      })
    })

    it('aucune incohérence : NO-GO faux, raisons vides', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1', status: 'qualified' },
        missions: [],
      })
      const result = await service.noGoState('w-1', 'n-1')
      expect(result).toEqual({ needId: 'n-1', status: 'qualified', noGo: false, reasons: [] })
    })
  })

  describe('missionsForNeed (#2339.6/.11/.13)', () => {
    it('rend chaque mission avec la preuve du positionnement retenu', async () => {
      const { service } = build({
        need: { id: 'n-1', workspace_id: 'w-1' },
        missions: [
          {
            id: 'm-1',
            label: 'Architecte Java — THALES',
            status: 'active',
            submission_id: 'sub-9',
            crm_deal_id: null,
            opportunity_id: 'opp-1',
            created_at: new Date('2026-09-10T00:00:00Z'),
          },
        ],
      })
      const result = await service.missionsForNeed('w-1', 'n-1')
      expect(result).toEqual([
        {
          id: 'm-1',
          label: 'Architecte Java — THALES',
          status: 'active',
          submissionId: 'sub-9',
          crmDealId: null,
          opportunityId: 'opp-1',
          createdAt: '2026-09-10T00:00:00.000Z',
        },
      ])
    })

    it("aucune mission encore n'est pas une erreur — `[]`", async () => {
      const { service } = build({ need: { id: 'n-1', workspace_id: 'w-1' }, missions: [] })
      const result = await service.missionsForNeed('w-1', 'n-1')
      expect(result).toEqual([])
    })
  })
})
