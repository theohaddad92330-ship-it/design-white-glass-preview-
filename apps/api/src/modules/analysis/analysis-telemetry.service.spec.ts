import { AnalysisTelemetryService, detectCreditSignal } from './analysis-telemetry.service'
import { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

describe('detectCreditSignal', () => {
  it('returns null for empty / unrelated messages', () => {
    expect(detectCreditSignal(null)).toBeNull()
    expect(detectCreditSignal(undefined)).toBeNull()
    expect(detectCreditSignal('')).toBeNull()
    expect(detectCreditSignal('TimeoutError: phase research timed out after 360s')).toBeNull()
  })

  it('detects Anthropic credit-balance exhaustion', () => {
    expect(detectCreditSignal('Error: Your credit balance is too low to access the Claude API')).toEqual({
      provider: 'anthropic',
      kind: 'credit',
    })
  })

  it('detects an Apollo plan / People-Match cap as a quota', () => {
    expect(detectCreditSignal('Apollo People-Match requires you to upgrade your plan (403 Forbidden)')).toEqual({
      provider: 'apollo',
      kind: 'quota',
    })
  })

  it('detects a Firecrawl credit/quota exhaustion', () => {
    expect(detectCreditSignal('Firecrawl: insufficient credits remaining for this month')).toEqual({
      provider: 'firecrawl',
      kind: 'credit',
    })
  })

  it('maps a bare 402 to a credit signal and a 429 to a rate signal', () => {
    expect(detectCreditSignal('Request failed with status code 402 Payment Required')).toEqual({
      provider: 'inconnu',
      kind: 'credit',
    })
    expect(detectCreditSignal('429 Too Many Requests')).toEqual({ provider: 'inconnu', kind: 'rate' })
  })
})

describe('AnalysisTelemetryService', () => {
  let service: AnalysisTelemetryService
  let repo: MockRepository<AccountEntity>
  let contacts: MockRepository<ContactEntity>
  let runs: MockRepository<AnalysisRunEntity>

  /** Program the `analysis_runs` measured-duration lookup: one entry per
   *  account id → its real wall-clock span in ms. Anything absent is UNKNOWN. */
  function setRunDurations(byAccount: Record<string, number>) {
    runs.query.mockImplementation(async (_sql: string, params?: unknown[]) => {
      const ids = (params?.[0] as string[] | undefined) ?? []
      return ids.filter(id => id in byAccount).map(id => ({ account_id: id, duration_ms: byAccount[id] }))
    })
  }

  beforeEach(() => {
    repo = createMockRepository<AccountEntity>()
    contacts = createMockRepository<ContactEntity>()
    runs = createMockRepository<AnalysisRunEntity>()
    contacts.find.mockResolvedValue([] as never)
    runs.query.mockResolvedValue([] as never)
    service = new AnalysisTelemetryService(repo as never, contacts as never, runs as never)
  })

  it('maps recent accounts to telemetry rows + summary', async () => {
    repo.find.mockResolvedValueOnce([
      {
        id: 'a1',
        company_name: 'SNCF',
        status: 'completed',
        api_cost_euros: '0.81',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:05:00Z'),
      },
      {
        id: 'a2',
        company_name: 'OVH',
        status: 'completed',
        api_cost_euros: '0.40',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:03:00Z'),
      },
    ] as never)
    // Real measured spans from `analysis_runs`, NOT `updated_at − created_at`.
    setRunDurations({ a1: 5 * 60 * 1000, a2: 3 * 60 * 1000 })

    const report = await service.getRecent(10)

    expect(report.analyses).toHaveLength(2)
    expect(report.analyses[0]).toMatchObject({
      accountId: 'a1',
      companyName: 'SNCF',
      status: 'completed',
      costUsd: 0.81,
      durationMs: 5 * 60 * 1000,
    })
    expect(report.summary.count).toBe(2)
    expect(report.summary.totalCostUsd).toBeCloseTo(1.21, 5)
    expect(report.summary.avgCostUsd).toBeCloseTo(0.605, 5)
  })

  describe('durationMs — mesurée depuis analysis_runs, jamais estimée ni plafonnée', () => {
    const account = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      company_name: id.toUpperCase(),
      status: 'completed',
      api_cost_euros: '0.10',
      created_at: new Date('2026-01-01T00:00:00Z'),
      // Un `updated_at` très postérieur au run — c'est exactement ce que
      // l'ancienne heuristique confondait avec la durée de traitement.
      updated_at: new Date('2026-01-08T00:00:00Z'),
      ...overrides,
    })

    // Le cœur du bug : `updated_at − created_at` = 7 JOURS. L'ancienne heuristique
    // le plafonnait à 60 min et affichait « 60m 0s » comme si c'était mesuré. La
    // vraie durée du run est de 4 min.
    it('ignore `updated_at` (édition du compte) et lit la durée réelle du run', async () => {
      repo.find.mockResolvedValueOnce([account('a1')] as never)
      setRunDurations({ a1: 4 * 60 * 1000 })

      const report = await service.getRecent(10)

      expect(report.analyses[0].durationMs).toBe(4 * 60 * 1000)
      // Surtout PAS le plafond d'une heure de l'ancienne estimation.
      expect(report.analyses[0].durationMs).not.toBe(3_600_000)
    })

    // « Ne jamais inventer » : sans run terminé mesurable, la durée est INCONNUE.
    it('renvoie null (pas 0, pas un plafond) quand aucun run terminé n’est mesurable', async () => {
      repo.find.mockResolvedValueOnce([account('a1')] as never)
      setRunDurations({}) // aucun run pour a1

      const report = await service.getRecent(10)

      expect(report.analyses[0].durationMs).toBeNull()
    })

    it('un échec de lecture des runs dégrade en durée inconnue, jamais estimée', async () => {
      repo.find.mockResolvedValueOnce([account('a1')] as never)
      runs.query.mockRejectedValueOnce(new Error('db down'))

      const report = await service.getRecent(10)

      expect(report.analyses[0].durationMs).toBeNull()
    })

    // La conséquence produit signalée : les durées inconnues polluaient la
    // « DURÉE MOY. » du cockpit. Elles ne doivent plus produire de valeur du tout.
    it('n’émet aucune durée pour les comptes sans run mesurable (moyenne DM propre)', async () => {
      repo.find.mockResolvedValueOnce([account('a1'), account('a2'), account('a3')] as never)
      setRunDurations({ a1: 2 * 60 * 1000 }) // seul a1 est mesurable

      const report = await service.getRecent(10)

      const measured = report.analyses.map(a => a.durationMs)
      expect(measured).toEqual([2 * 60 * 1000, null, null])
    })
  })

  it('clamps the limit to MAX and orders by updated_at desc', async () => {
    repo.find.mockResolvedValueOnce([] as never)
    await service.getRecent(99999)
    const arg = repo.find.mock.calls[0]![0] as { take: number; order: unknown }
    expect(arg.take).toBe(200)
    expect(arg.order).toEqual({ updated_at: 'DESC' })
  })

  it('getDetail returns the full detail incl raw_analysis', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'SNCF',
      status: 'completed',
      api_cost_euros: '0.71',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:05:00Z'),
      priority_score: 7,
      raw_analysis: { subsidiaries: [{ name: 'Filiale A' }] },
    } as never)
    setRunDurations({ a1: 5 * 60 * 1000 })

    const detail = await service.getDetail('a1')

    expect(detail).toMatchObject({
      accountId: 'a1',
      companyName: 'SNCF',
      status: 'completed',
      costUsd: 0.71,
      priorityScore: 7,
      durationMs: 5 * 60 * 1000,
    })
    expect(detail?.rawAnalysis).toEqual({ subsidiaries: [{ name: 'Filiale A' }] })
    expect(detail?.topContacts).toEqual([])
    expect(detail?.phaseTelemetry).toEqual([])
  })

  it('getDetail surfaces per-phase telemetry from raw_analysis', async () => {
    const phases = [
      { name: 'research', costUsd: 0.39, inputTokens: 50000, outputTokens: 12000, durationMs: 240000 },
      { name: 'plan', costUsd: 0.21, inputTokens: 30000, outputTokens: 9000, durationMs: 90000 },
    ]
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'SG',
      status: 'completed',
      api_cost_euros: '0.60',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:06:00Z'),
      priority_score: 8,
      raw_analysis: { phase_telemetry: phases },
    } as never)

    const detail = await service.getDetail('a1')
    expect(detail?.phaseTelemetry).toHaveLength(2)
    expect(detail?.phaseTelemetry[0]).toMatchObject({ name: 'research', costUsd: 0.39, durationMs: 240000 })
  })

  it('getDetail surfaces the full contact set (best priority first, with all fields + one real message)', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'Société Générale',
      status: 'completed',
      api_cost_euros: '0.71',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:05:00Z'),
      priority_score: 8,
      raw_analysis: {},
    } as never)
    contacts.find.mockResolvedValueOnce([
      {
        full_name: 'Jean Dupont',
        title: 'DSI ITIM',
        entity: 'ITIM',
        family: 'IT / Infrastructure',
        decision_role: 'TECHNICAL',
        priority: 1,
        why_contact: 'Sponsor data, décide le stack.',
        profile_summary: 'DSI de la BU paiements, 12 ans dans le groupe.',
        email: 'jean.dupont@socgen.com',
        email_verified: true,
        phone: '+33 1 42 00 00 00',
        linkedin_url: 'https://linkedin.com/in/jdupont',
        email_message: { subject: 'Renfort data', body: 'Bonjour Jean, ...' },
        linkedin_message: null,
        user_status: 'new',
        source: 'apollo',
        raw_data: {
          city: 'Paris',
          country: 'France',
          apolloDetails: { seniority: 'c_suite', departments: ['information_technology'] },
        },
      },
    ] as never)

    const detail = await service.getDetail('a1')

    // The full set, ordered by priority asc (1 = top decider), nulls last.
    const findArg = contacts.find.mock.calls[0]![0] as { where: unknown; order: unknown; take: number }
    expect(findArg).toMatchObject({ where: { account_id: 'a1' }, take: 500 })
    expect(findArg.order).toEqual({ priority: { direction: 'ASC', nulls: 'LAST' } })

    expect(detail?.topContacts).toHaveLength(1)
    expect(detail?.topContacts[0]).toEqual({
      fullName: 'Jean Dupont',
      title: 'DSI ITIM',
      entity: 'ITIM',
      family: 'IT / Infrastructure',
      decisionRole: 'TECHNICAL',
      priority: 1,
      whyContact: 'Sponsor data, décide le stack.',
      profileSummary: 'DSI de la BU paiements, 12 ans dans le groupe.',
      email: 'jean.dupont@socgen.com',
      emailVerified: true,
      phone: '+33 1 42 00 00 00',
      linkedinUrl: 'https://linkedin.com/in/jdupont',
      photoUrl: null,
      city: 'Paris',
      country: 'France',
      apolloDetails: { seniority: 'c_suite', departments: ['information_technology'] },
      message: 'Bonjour Jean, ...',
      userStatus: 'new',
      sourceTag: 'PUBLIC',
      bucket: 'decideur',
      hierarchyLevel: 'direction',
      // Lot 758 — la pertinence sur les critères évaluables : 28(technical)+12(direction)
      // +10(apollo) = 50 / 55. L'e-mail vérifié est une pastille, il ne note plus.
      // Proximité + fit angle need a cartography/angles this raw_analysis has not,
      // so they are reported unevaluated and leave the denominator instead of
      // costing the contact 15 points for information that is simply missing.
      contactScore: 91,
      // The explainable /100 breakdown — each criterion proven, and flagged with
      // whether it could be evaluated at all.
      scoreBreakdown: [
        { key: 'role', points: 28, max: 30, proof: 'décideur technique', evaluated: true },
        { key: 'proximity', points: 0, max: 20, proof: 'périmètre non rattaché', evaluated: false },
        { key: 'seniority', points: 12, max: 15, proof: 'Direction', evaluated: true },
        { key: 'angleFit', points: 0, max: 25, proof: 'angle non évalué', evaluated: false },
        // La preuve nomme la CAPACITÉ de la source, pas son éditeur : elle est
        // rendue BRUTE sur la fiche contact, hors de Réglages › Intégrations.
        { key: 'freshness', points: 10, max: 10, proof: 'annuaire professionnel vérifié', evaluated: true },
      ],
      relevanceScore: 89, // (28 + 12) / 45 evaluable
      accessibilityScore: 100, // (15 + 10) / 25
      // ⚠️ `priorityReason`, LUI, nomme le fournisseur — exception bornée : son
      // seul rendu est ce back-office opérateur, jamais un écran client (GA-44).
      priorityReason: 'décideur technique · direction · email vérifié · Apollo',
      qualifStatus: 'priorite_immediate', // real target, reachable
      careerLevers: null,
      implicitFears: null,
    })
  })

  it('surfaces an explainable score breakdown that sums to contactScore (§3, passthrough)', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'ACME',
      status: 'completed',
      api_cost_euros: '0.5',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:05:00Z'),
      priority_score: 5,
      raw_analysis: {},
    } as never)
    contacts.find.mockResolvedValueOnce([
      {
        full_name: 'Marie Martin',
        title: "Directrice des Systèmes d'Information",
        entity: 'ACME',
        decision_role: 'technical',
        priority: 1,
        email: 'marie@acme.com',
        email_verified: true,
        source: 'apollo',
        email_message: null,
        linkedin_message: null,
        user_status: 'new',
        raw_data: {},
        family: 'IT',
        why_contact: '',
        profile_summary: '',
        phone: null,
        linkedin_url: null,
      },
    ] as never)

    const detail = await service.getDetail('a1')
    const contact = detail!.topContacts[0]!
    // Lot 758 — the 5 relevance criteria, in order, each bounded to its cap.
    expect(contact.scoreBreakdown.map(c => c.key)).toEqual(['role', 'proximity', 'seniority', 'angleFit', 'freshness'])
    for (const crit of contact.scoreBreakdown) {
      expect(crit.points).toBeGreaterThanOrEqual(0)
      expect(crit.points).toBeLessThanOrEqual(crit.max)
      expect(crit.proof).toBeTruthy()
    }
    // The breakdown IS the score. At full coverage that is literally Σ(points);
    // when a criterion could not be evaluated (no perimeter / no angle in this
    // account's raw_analysis) it leaves the denominator too, so the score is
    // Σ(evaluated points) read over Σ(their caps) — never a silent penalty.
    const evaluated = contact.scoreBreakdown.filter(c => c.evaluated)
    const denominator = evaluated.reduce((s, c) => s + c.max, 0)
    const points = evaluated.reduce((s, c) => s + c.points, 0)
    expect(contact.contactScore).toBe(Math.round((points * 100) / denominator))
  })

  it('spreads the contact score by entity zone: same profile, P1 perimeter outscores out-of-scope noise', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'VINCI',
      status: 'completed',
      api_cost_euros: '0.9',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:05:00Z'),
      priority_score: 4,
      raw_analysis: {
        priority_perimeters: [{ name: 'VINCI Energies', tier: 'P1' }],
        entities_exhaustive: [
          { name: 'VINCI Energies', relevance: 'operating' },
          { name: 'GIE MUSE', relevance: 'noise' },
        ],
      },
    } as never)
    const baseContact = {
      title: 'DSI',
      decision_role: 'TECHNICAL',
      priority: 1,
      email: 'x@vinci.com',
      email_verified: true,
      source: 'apollo',
      email_message: null,
      linkedin_message: null,
      user_status: 'new',
      raw_data: {},
      family: 'IT',
      why_contact: '',
      profile_summary: '',
      phone: null,
      linkedin_url: null,
    }
    contacts.find.mockResolvedValueOnce([
      { ...baseContact, full_name: 'P1 Contact', entity: 'VINCI Energies' },
      { ...baseContact, full_name: 'Noise Contact', entity: 'GIE MUSE' },
    ] as never)

    const detail = await service.getDetail('a1')
    const p1 = detail!.topContacts.find(c => c.fullName === 'P1 Contact')!
    const noise = detail!.topContacts.find(c => c.fullName === 'Noise Contact')!
    // Identical title/role/email — only the entity zone differs, so proximity
    // alone spreads the score. Both zones ARE evaluated (P1 = 20, out-of-scope
    // noise = a real 0), so both scores are read over the same denominator.
    expect(p1.contactScore).toBeGreaterThan(noise.contactScore)
    const proximityOf = (c: typeof p1) => c.scoreBreakdown.find(x => x.key === 'proximity')!
    expect(proximityOf(p1)).toMatchObject({ points: 20, evaluated: true })
    expect(proximityOf(noise)).toMatchObject({ points: 0, evaluated: true })
    // Every other criterion is identical between the two.
    for (const key of ['role', 'seniority', 'angleFit', 'freshness']) {
      expect(p1.scoreBreakdown.find(x => x.key === key)?.points).toBe(
        noise.scoreBreakdown.find(x => x.key === key)?.points,
      )
    }
  })

  it('#19: inherits the perimeter zone despite BU-name drift (prefix match, not exact key)', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'VINCI',
      status: 'completed',
      api_cost_euros: '0.9',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:05:00Z'),
      priority_score: 4,
      raw_analysis: {
        priority_perimeters: [{ name: 'VINCI Energies', tier: 'P1' }],
        entities_exhaustive: [{ name: 'VINCI Energies', relevance: 'operating' }],
      },
    } as never)
    const baseContact = {
      title: 'DSI',
      decision_role: 'TECHNICAL',
      priority: 1,
      email: 'x@vinci.com',
      email_verified: true,
      source: 'apollo',
      email_message: null,
      linkedin_message: null,
      user_status: 'new',
      raw_data: {},
      family: 'IT',
      why_contact: '',
      profile_summary: '',
      phone: null,
      linkedin_url: null,
    }
    contacts.find.mockResolvedValueOnce([
      // Sits IN the P1 perimeter → 20.
      { ...baseContact, full_name: 'Exact', entity: 'VINCI Energies' },
      // BU drift: sub-unit of the same perimeter — exact-key lookup would MISS
      // and flatline to 0; the prefix matcher inherits the P1 zone → 20.
      { ...baseContact, full_name: 'Drift', entity: 'VINCI Energies Digital' },
      // Bare parent (1 token) must NOT grab the P1 zone via prefix (≥2-token guard).
      { ...baseContact, full_name: 'Parent', entity: 'VINCI' },
    ] as never)

    const detail = await service.getDetail('a1')
    const exact = detail!.topContacts.find(c => c.fullName === 'Exact')!
    const drift = detail!.topContacts.find(c => c.fullName === 'Drift')!
    const parent = detail!.topContacts.find(c => c.fullName === 'Parent')!
    expect(drift.contactScore).toBe(exact.contactScore) // drift inherits the P1 zone (20)
    const proximityOf = (c: typeof exact) => c.scoreBreakdown.find(x => x.key === 'proximity')!
    // The bare parent must NOT grab the P1 zone via prefix (≥2-token guard)…
    expect(proximityOf(exact)).toMatchObject({ points: 20, evaluated: true })
    // …and it is reported as UNEVALUATED rather than scored a neutral middle: we
    // don't know its perimeter, which is not the same claim as "half a perimeter".
    expect(proximityOf(parent)).toMatchObject({ points: 0, evaluated: false })
    // Being placed in P1 still ranks a contact above one we couldn't place.
    expect(exact.contactScore).toBeGreaterThan(parent.contactScore)
  })

  const accountRow = (companyName: string) =>
    ({
      id: 'a1',
      company_name: companyName,
      status: 'completed',
      api_cost_euros: '0.10',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:05:00Z'),
      priority_score: 5,
      raw_analysis: {},
    }) as never

  const contactRow = (over: Record<string, unknown>) =>
    ({
      full_name: 'X',
      title: 'T',
      entity: null,
      source: 'apollo',
      user_status: 'new',
      email_verified: false,
      raw_data: {},
      ...over,
    }) as never

  it('tags a contact who left the company as RISQUE (obsolète)', async () => {
    repo.findOne.mockResolvedValueOnce(accountRow('Société Générale'))
    contacts.find.mockResolvedValueOnce([
      contactRow({
        full_name: 'Alice Martin',
        title: 'Ex-DSI',
        entity: 'ITIM',
        raw_data: { apolloDetails: { employmentHistory: [{ organization: 'Capgemini', current: true }] } },
      }),
    ])
    const detail = await service.getDetail('a1')
    expect(detail?.topContacts[0]?.sourceTag).toBe('RISQUE')
  })

  it('keeps a still-employed contact PUBLIC (current employer matches the account)', async () => {
    repo.findOne.mockResolvedValueOnce(accountRow('Société Générale'))
    contacts.find.mockResolvedValueOnce([
      contactRow({
        entity: 'ITIM',
        raw_data: { apolloDetails: { employmentHistory: [{ organization: 'SOCIETE GENERALE SA', current: true }] } },
      }),
    ])
    const detail = await service.getDetail('a1')
    expect(detail?.topContacts[0]?.sourceTag).toBe('PUBLIC')
  })

  it('does not false-flag a subsidiary contact as RISQUE (current org matches the entity)', async () => {
    repo.findOne.mockResolvedValueOnce(accountRow('Société Générale'))
    contacts.find.mockResolvedValueOnce([
      contactRow({
        title: 'Head of Mobile',
        entity: 'BoursoBank',
        raw_data: { apolloDetails: { employmentHistory: [{ organization: 'BoursoBank', current: true }] } },
      }),
    ])
    const detail = await service.getDetail('a1')
    expect(detail?.topContacts[0]?.sourceTag).toBe('PUBLIC')
  })

  it('does not RISQUE-flag when no current employer is known', async () => {
    repo.findOne.mockResolvedValueOnce(accountRow('Société Générale'))
    contacts.find.mockResolvedValueOnce([
      contactRow({ source: 'ai_generated', raw_data: { apolloDetails: { seniority: 'manager' } } }),
    ])
    const detail = await service.getDetail('a1')
    expect(detail?.topContacts[0]?.sourceTag).toBe('HYPOTHÈSE')
  })

  it('surfaces the contact photo from raw_data', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'X',
      status: 'completed',
      api_cost_euros: '0.1',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:01:00Z'),
      priority_score: 5,
      raw_analysis: {},
    } as never)
    contacts.find.mockResolvedValueOnce([
      { full_name: 'Léa', priority: 90, raw_data: { photoUrl: 'https://cdn.apollo/lea.jpg' } },
    ] as never)

    const detail = await service.getDetail('a1')
    expect(detail?.topContacts[0]!.photoUrl).toBe('https://cdn.apollo/lea.jpg')
  })

  it('falls back to the LinkedIn message when there is no email body', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'X',
      status: 'completed',
      api_cost_euros: '0.1',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:01:00Z'),
      priority_score: 5,
      raw_analysis: {},
    } as never)
    contacts.find.mockResolvedValueOnce([
      {
        full_name: 'Marie',
        decision_role: 'CHAMPION',
        priority: 80,
        email_message: null,
        linkedin_message: 'Salut Marie',
      },
    ] as never)

    const detail = await service.getDetail('a1')
    expect(detail?.topContacts[0]!.message).toBe('Salut Marie')
  })

  it('getDetail returns null when the account is missing', async () => {
    repo.findOne.mockResolvedValueOnce(null as never)
    expect(await service.getDetail('ghost')).toBeNull()
  })

  it('surfaces credit alerts from failed analyses + an approximate per-provider spend', async () => {
    repo.find.mockResolvedValueOnce([
      {
        id: 'a1',
        company_name: 'SNCF',
        status: 'error',
        api_cost_euros: '0.12',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:02:00Z'),
        error_message: 'Your credit balance is too low to access the Claude API',
        raw_analysis: {
          phase_telemetry: [
            { name: 'research', costUsd: 0.12, inputTokens: 1000, outputTokens: 100, durationMs: 1000 },
            { name: 'contacts', costUsd: 0, inputTokens: 0, outputTokens: 0, durationMs: 500 },
          ],
        },
      },
      {
        id: 'a2',
        company_name: 'OVH',
        status: 'completed',
        api_cost_euros: '0.40',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:03:00Z'),
        error_message: null,
        raw_analysis: { phase_telemetry: [{ name: 'plan', costUsd: 0.2, durationMs: 800 }] },
      },
    ] as never)

    const report = await service.getRecent(10)

    // Real detected alert only — the completed run produces none.
    expect(report.creditAlerts).toHaveLength(1)
    expect(report.creditAlerts[0]).toMatchObject({ accountId: 'a1', provider: 'anthropic', kind: 'credit' })

    // Claude is metered ($ from token cost); Apollo/Firecrawl/Pappers/Brave are
    // call-attributed only (no per-call $).
    const claude = report.providerSpend.find(p => p.provider === 'claude')
    expect(claude).toMatchObject({ metered: true })
    expect(claude?.costUsd).toBeCloseTo(0.32, 5)
    const apollo = report.providerSpend.find(p => p.provider === 'apollo')
    expect(apollo).toMatchObject({ metered: false, costUsd: null, calls: 1 })
  })

  it('surfaces the IA v2 grounding KPI from the sources block + confidence', async () => {
    repo.find.mockResolvedValueOnce([
      {
        id: 'a1',
        company_name: 'Société Générale',
        status: 'completed',
        api_cost_euros: '0.71',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:05:00Z'),
        raw_analysis: {
          sources: {
            coverage: {
              public_facts: 19,
              hypothesis_facts: 1,
              facts_with_source: 12,
              facts_with_evidence: 5,
              registry_size: 35,
              legal_citations: 110,
            },
          },
          confidence: { score: 82, tier: 'high' },
        },
      },
      // Older run, no sources/confidence block → grounding is null (honest), and
      // it does NOT dilute the aggregate averages.
      {
        id: 'a2',
        company_name: 'OVH',
        status: 'completed',
        api_cost_euros: '0.40',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:03:00Z'),
        raw_analysis: {},
      },
    ] as never)

    const report = await service.getRecent(10)

    expect(report.analyses[0]!.grounding).toEqual({
      sourcedFacts: 19,
      hypothesisFacts: 1,
      factsWithSource: 12,
      factsWithEvidence: 5,
      registrySize: 35,
      legalCitations: 110,
      sourcedRatio: 0.95,
      confidenceScore: 82,
      confidenceTier: 'high',
    })
    expect(report.analyses[1]!.grounding).toBeNull()

    // Only the run with a grounding block counts toward the summary.
    expect(report.groundingSummary).toMatchObject({
      analysesWithGrounding: 1,
      withSourcedRatio: 1,
      totalRegistrySize: 35,
      totalLegalCitations: 110,
      meetingTarget: 1, // 19/20 = 0.95 ≥ 0.95 target
    })
    expect(report.groundingSummary.avgSourcedRatio).toBeCloseTo(0.95, 5)
    expect(report.groundingSummary.avgConfidenceScore).toBeCloseTo(82, 5)
  })

  it('reports meetingTarget = 0 when the sourced ratio is below the < 5 % non-sourced target', async () => {
    repo.find.mockResolvedValueOnce([
      {
        id: 'a1',
        company_name: 'X',
        status: 'completed',
        api_cost_euros: '0.10',
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:05:00Z'),
        raw_analysis: { sources: { coverage: { public_facts: 5, hypothesis_facts: 8 } } },
      },
    ] as never)

    const report = await service.getRecent(10)
    expect(report.analyses[0]!.grounding?.sourcedRatio).toBeCloseTo(5 / 13, 5)
    expect(report.groundingSummary.meetingTarget).toBe(0)
    // No confidence block → the confidence fields are null, not fabricated.
    expect(report.analyses[0]!.grounding?.confidenceScore).toBeNull()
    expect(report.groundingSummary.avgConfidenceScore).toBeNull()
  })

  it('getDetail surfaces the grounding KPI', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'a1',
      company_name: 'SG',
      status: 'completed',
      api_cost_euros: '0.60',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:06:00Z'),
      priority_score: 8,
      raw_analysis: {
        sources: { coverage: { public_facts: 5, hypothesis_facts: 0, registry_size: 4 } },
        confidence: { score: 75, tier: 'high' },
      },
    } as never)

    const detail = await service.getDetail('a1')
    expect(detail?.grounding).toMatchObject({
      sourcedFacts: 5,
      hypothesisFacts: 0,
      registrySize: 4,
      sourcedRatio: 1,
      confidenceScore: 75,
      confidenceTier: 'high',
    })
  })

  it('treats a null cost as 0 in the summary but null in the row', async () => {
    repo.find.mockResolvedValueOnce([
      {
        id: 'a1',
        company_name: 'X',
        status: 'analyzing',
        api_cost_euros: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
        updated_at: new Date('2026-01-01T00:00:00Z'),
      },
    ] as never)

    const report = await service.getRecent()

    expect(report.analyses[0]!.costUsd).toBeNull()
    // Un compte encore `analyzing` n'a aucun run terminé → durée INCONNUE (null),
    // pas 0. Zéro se serait moyenné dans la « DURÉE MOY. » du cockpit ; null en
    // est exclu.
    expect(report.analyses[0]!.durationMs).toBeNull()
    // Supervision 30/09 : aucune analyse chiffrée => total et moyenne INCONNUS.
    expect(report.summary.totalCostUsd).toBeNull()
    expect(report.summary.avgCostUsd).toBeNull()
    expect(report.summary.unpricedCount).toBe(1)
  })

  it('supervision 30/09 — la moyenne se fait sur les seules analyses chiffrées', async () => {
    const base = {
      status: 'completed',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:05:00Z'),
    }
    repo.find.mockResolvedValueOnce([
      { id: 'a1', company_name: 'A', api_cost_euros: '1.00', ...base },
      { id: 'a2', company_name: 'B', api_cost_euros: '0.50', ...base },
      { id: 'a3', company_name: 'C', api_cost_euros: null, ...base },
    ] as never)
    const report = await service.getRecent(10)
    expect(report.summary.count).toBe(3)
    expect(report.summary.totalCostUsd).toBeCloseTo(1.5, 5)
    expect(report.summary.avgCostUsd).toBeCloseTo(0.75, 5)
    expect(report.summary.unpricedCount).toBe(1)
  })
})
