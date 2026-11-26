import type { ConfigService } from '@nestjs/config'
import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError, TechnicalError } from '@bellum/errors'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'

// HttpClient calls undici's OWN `fetch` (a custom `Agent` dispatcher that Node's
// global fetch rejects — see packages/http/src/client.ts), so stubbing
// `global.fetch` never intercepts it. Mock the `undici` module instead, exactly
// like the http package's own test does. The `mock`-prefixed name is the one
// jest allows the (hoisted) factory to reference.
const mockFetch = jest.fn()
jest.mock('undici', () => ({ Agent: jest.fn(), fetch: mockFetch }))

import type { EsnAnswers, GraphEvent } from '@bellum/contracts'
import { IaClient } from './ia.client'

const fetchMock = mockFetch

function makeConfig(baseUrl = 'http://ia.test'): ConfigService {
  return { get: (_key: string, def?: unknown) => baseUrl ?? def } as unknown as ConfigService
}

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as Response
}

/**
 * A `text/event-stream` response carrying `frames` as SSE `data:` lines.
 *
 * `streamSse` reads `response.body` as a byte stream, so the frames go through
 * the SAME serialise → chunk → decode → parse path a real run takes. Driving the
 * boundary from the wire (rather than calling the schema directly) is the point:
 * the outage lived in the gap between what the producer wrote and what the
 * consumer read, and only an end-to-end path can expose that gap.
 */
function sseResponse(frames: unknown[]): Response {
  const payload = frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join('')
  const bytes = new TextEncoder().encode(payload)
  let sent = false
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined }
          sent = true
          return { done: false, value: bytes }
        },
        cancel: async () => undefined,
        releaseLock: () => undefined,
      }),
    },
  } as unknown as Response
}

function buildClient(opts?: { correlationId?: string }): IaClient {
  const correlation = new CorrelationIdService()
  if (opts?.correlationId) {
    jest.spyOn(correlation, 'getCorrelationId').mockReturnValue(opts.correlationId)
  }
  return new IaClient(makeConfig(), correlation)
}

describe('IaClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    // Deterministic backoff — skip real waits between retries.
    jest.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('posts to the composed URL and returns the parsed JSON body', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { data: { ok: true } }))
    const client = buildClient({ correlationId: 'cid-42' })

    const result = await client.request<{ data: { ok: boolean } }>({
      urlInfo: { template: '/phase/1/research' },
      body: { company_name: 'SNCF' },
    })

    expect(result).toEqual({ data: { ok: true } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://ia.test/phase/1/research')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['x-correlation-id']).toBe('cid-42')
    expect((init as RequestInit).body).toBe(JSON.stringify({ company_name: 'SNCF' }))
  })

  it('wraps exhausted 5xx in TechnicalError(cause=HttpRetriesExhaustedError) with inner HttpError(retryable=true)', async () => {
    fetchMock.mockResolvedValue(makeResponse(500, 'Boom'))
    const client = buildClient()

    const err = await client
      .request({
        urlInfo: { template: '/phase/1/research', variables: {} },
        body: {},
        maxAttempts: 1,
      })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(TechnicalError)
    const cause = (err as TechnicalError).cause
    expect(cause).toBeInstanceOf(HttpRetriesExhaustedError)
    const inner = (cause as HttpRetriesExhaustedError).cause
    expect(inner).toBeInstanceOf(HttpError)
    expect((inner as HttpError).status).toBe(500)
    expect((inner as HttpError).retryable).toBe(true)
  })

  it('wraps 4xx (other than 408/429) with cause=HttpError(retryable=false)', async () => {
    fetchMock.mockResolvedValue(makeResponse(404, 'Not Found'))
    const client = buildClient()

    const err = await client
      .request({
        urlInfo: { template: '/phase/1/research', variables: {} },
        body: {},
        maxAttempts: 3,
      })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(TechnicalError)
    const cause = (err as TechnicalError).cause
    expect(cause).toBeInstanceOf(HttpError)
    expect((cause as HttpError).retryable).toBe(false)
  })

  it('does not retry on non-retryable status (404 is thrown immediately)', async () => {
    fetchMock.mockResolvedValue(makeResponse(404, 'gone'))
    const client = buildClient()

    await client
      .request({
        urlInfo: { template: '/phase/1/research', variables: {} },
        body: {},
        maxAttempts: 3,
      })
      .catch((e: unknown) => e)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on 500 and succeeds on the second attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(500, 'Boom'))
      .mockResolvedValueOnce(makeResponse(200, { data: { ok: true } }))
    const client = buildClient()

    const result = await client.request<{ data: { ok: boolean } }>({
      urlInfo: { template: '/phase/1/research' },
      body: {},
      maxAttempts: 2,
    })

    expect(result).toEqual({ data: { ok: true } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('wraps exhausted transient failure in TechnicalError with cause=HttpRetriesExhaustedError', async () => {
    fetchMock.mockResolvedValue(makeResponse(500, 'Boom'))
    const client = buildClient()

    const err = await client
      .request({
        urlInfo: { template: '/phase/1/research', variables: {} },
        body: {},
        maxAttempts: 2,
      })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(TechnicalError)
    expect((err as TechnicalError).cause).toBeInstanceOf(HttpRetriesExhaustedError)
  })

  it('battlecard posts account_id + profile_data to /battlecard/generate (no user_id in body path)', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { success: true, data: {} }))
    const client = buildClient()

    await client.battlecard({ userId: 'u-1', accountId: 'a-1', profileData: { companyName: 'MonESN' } })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://ia.test/battlecard/generate')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      user_id: 'u-1',
      account_id: 'a-1',
      profile_data: { companyName: 'MonESN' },
    })
  })

  // C.2 (Cédric 20/10) — les ancres d'organisation voyagent jusqu'à l'IA ; absentes, omises.
  it('contacts() envoie organization_ids / organization_domains quand fournis, les omet sinon', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { data: { contacts: [] } }))
    const client = buildClient()
    const base = { companyName: 'SAFRAN', profileData: {}, accountId: 'a-1', userId: 'u-1' }

    await client.contacts({ ...base, organizationIds: ['org-1'], organizationDomains: ['safran-group.com'] })
    await client.contacts(base)

    const withAnchor = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
    const without = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)
    expect(withAnchor.organization_ids).toEqual(['org-1'])
    expect(withAnchor.organization_domains).toEqual(['safran-group.com'])
    expect('organization_ids' in without).toBe(false)
    expect('organization_domains' in without).toBe(false)
  })

  /**
   * #2123.59 — mesuré en production le 17/09 : choisir un objectif dans le
   * composer déclenche la génération, qui échoue après un DÉLAI perceptible
   * (« La génération du message a échoué. Réessaie dans un instant. »).
   *
   * Cause trouvée : contrairement à CHAQUE autre appel Claude-coûteux de ce
   * fichier (`battlecard`, `rewriteCv`, `needPlay`, `compareAccounts` — tous
   * `maxAttempts: 1` + un `timeoutMs` étendu, « un seul essai : retrying triple
   * la dépense sans bénéfice »), `generateMessage` héritait des défauts de
   * `HttpClient` (3 tentatives, 30 s chacune). Le prompt du composer porte
   * désormais le CADRAGE (#1926) + les paramètres du formulaire (#2123.61-.68) :
   * un appel qui approche ou dépasse 30 s est retenté DEUX FOIS de plus au lieu
   * d'être rendu à l'appelant, ce qui explique le délai avant l'échec — et
   * triple le coût Claude d'une génération qui échoue de toute façon. `/ia/message`
   * ne débite aucun crédit ; l'appelant web propose déjà un retry explicite
   * (P0-05) : un second essai automatique côté serveur n'apporte rien.
   */
  it('generateMessage — un seul essai (pas de retry serveur sur un appel Claude-coûteux)', async () => {
    fetchMock.mockResolvedValue(makeResponse(500, 'Boom'))
    const client = buildClient()

    await client.generateMessage({ userId: 'u-1', contactId: 'c-1', channel: 'email' }).catch((e: unknown) => e)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  /**
   * #2542.2/#2542.3 — mesuré en suivant la chaîne #2542 (le même défaut que
   * #2123.59, trouvé la veille) : `cvParse` (`/cv/parse`, un appel Claude —
   * `apps/ia/app/routers/cv.py` → `call_claude`) HÉRITAIT des défauts de
   * `HttpClient` (3 tentatives, 30 s chacune) au lieu du patron déjà tenu par
   * CHAQUE autre appel Claude-coûteux de ce fichier (`battlecard`, `rewriteCv`,
   * `needPlay`, `compareAccounts`, `generateMessage`) : un seul essai + un
   * `timeoutMs` étendu — « retrying triple la dépense sans bénéfice ». Un
   * dossier de compétences dont la lecture approche ou dépasse 30 s était donc
   * retenté DEUX FOIS de plus au lieu d'être rendu à l'appelant : le délai
   * perceptible AVANT « service indisponible » que Ludovic Marx a mesuré
   * (« temps de traitement des documents est un peu long »), et jusqu'à trois
   * fois le coût Claude d'une lecture qui échoue de toute façon. `timeoutMs`
   * reprend EXACTEMENT celui de `rewriteCv` — la seule autre route CV de ce
   * fichier, même forme de prompt (un CV entier, une sortie structurée).
   */
  it('cvParse — un seul essai, même patron que rewriteCv (pas de retry serveur sur un appel Claude-coûteux)', async () => {
    fetchMock.mockResolvedValue(makeResponse(500, 'Boom'))
    const client = buildClient()

    await client.cvParse({ cvText: 'YANIS BERTHIER — Ingénieur plateforme.' }).catch((e: unknown) => e)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // #1631.3/.4 (lot 14) — l'axe CHEMIN sur le chemin « Actualiser » (phase 1
  // seule) : le MÊME contrat que `analyzeGraph`, une autre méthode qui sérialise.
  it("research envoie l'axe chemin quand la mémoire marché l'a résolu, l'omet sinon", async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
    const client = buildClient()

    await client.research({
      companyName: 'BNP Paribas',
      profileData: {},
      accountId: 'a-1',
      userId: 'u-1',
      marketPathsObserved: 5,
      marketTopEsn: 'Capgemini',
    })

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      market_paths_observed: 5,
      market_top_esn: 'Capgemini',
    })

    fetchMock.mockClear()
    await client.research({ companyName: 'Société Inconnue', profileData: {}, accountId: 'a-1', userId: 'u-1' })
    const [, init2] = fetchMock.mock.calls[0]!
    const body2 = JSON.parse((init2 as RequestInit).body as string)
    expect(body2).not.toHaveProperty('market_paths_observed')
    expect(body2).not.toHaveProperty('market_top_esn')
  })

  // LOT (15/10) DATA-A point 2 — le drapeau de la veille ne part QUE pour le rafraîchissement quotidien.
  it('research envoie watch_refresh pour la veille quotidienne, l’omet sinon (wire byte-identique)', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
    const client = buildClient()
    await client.research({ companyName: 'Acme', profileData: {}, accountId: 'a-1', userId: 'u-1', watchRefresh: true })
    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ watch_refresh: true })
    fetchMock.mockClear()
    await client.research({ companyName: 'Acme', profileData: {}, accountId: 'a-1', userId: 'u-1' })
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).not.toHaveProperty('watch_refresh')
  })

  // LOT (15/10) DATA-C — la voie « lot » (Message Batches) voyage en EN-TÊTE,
  // jamais dans le corps : absente, la requête est byte-identique.
  it('research pose x-bellum-llm-lane en voie lot, rien sinon', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
    const client = buildClient()
    const input = { companyName: 'SNCF', profileData: {}, accountId: 'a-1', userId: 'u-1' }

    await client.research(input, { llmLane: 'batch', timeoutMs: 1_000, maxAttempts: 1 })
    const [, lane] = fetchMock.mock.calls[0]!
    expect(((lane as RequestInit).headers as Record<string, string>)['x-bellum-llm-lane']).toBe('batch')
    expect(JSON.parse((lane as RequestInit).body as string)).not.toHaveProperty('llmLane')

    fetchMock.mockClear()
    await client.research(input)
    const [, plain] = fetchMock.mock.calls[0]!
    expect((plain as RequestInit).headers as Record<string, string>).not.toHaveProperty('x-bellum-llm-lane')
  })

  // #4070.1/.4 — le chemin « Actualiser » (phase 1 seule, `AnalysisOnDemandService.
  // runResearch`) reçoit aussi les faits du compte et l'analyse précédente — mêmes
  // clés, même forme byte-identique, que le graphe complet (`analyzeGraph`).
  it('research envoie les faits du compte et l’analyse précédente, les omet sinon', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
    const client = buildClient()

    await client.research({
      companyName: 'SNCF',
      profileData: {},
      accountId: 'a-1',
      userId: 'u-1',
      accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
      previousAnalysis: 'Analyse du 2026-06-18',
    })

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      account_facts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', age_days: 863 }],
      previous_analysis: 'Analyse du 2026-06-18',
    })

    fetchMock.mockClear()
    await client.research({ companyName: 'Société Inconnue', profileData: {}, accountId: 'a-1', userId: 'u-1' })
    const [, init2] = fetchMock.mock.calls[0]!
    const body2 = JSON.parse((init2 as RequestInit).body as string)
    expect(body2).not.toHaveProperty('account_facts')
    expect(body2).not.toHaveProperty('previous_analysis')
  })

  // #4070.2/.4 — le re-plan à la demande (« changer de stratégie »,
  // `AnalysisOnDemandService.replan`) reçoit aussi les faits du compte, les motifs
  // de perte et l'analyse précédente — mêmes clés que le graphe complet.
  it('plan envoie les faits du compte, les motifs de perte et l’analyse précédente, les omet sinon', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
    const client = buildClient()

    await client.plan({
      accountId: 'a-1',
      userId: 'u-1',
      accountData: {},
      contacts: [],
      profileData: {},
      accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
      lostDealRex: 'Perte du 2024-06-01 — motif déclaré : prix.',
      previousAnalysis: 'Analyse du 2026-06-18',
    })

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      account_facts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', age_days: 863 }],
      lost_deal_rex: 'Perte du 2024-06-01 — motif déclaré : prix.',
      previous_analysis: 'Analyse du 2026-06-18',
    })

    fetchMock.mockClear()
    await client.plan({ accountId: 'a-1', userId: 'u-1', accountData: {}, contacts: [], profileData: {} })
    const [, init2] = fetchMock.mock.calls[0]!
    const body2 = JSON.parse((init2 as RequestInit).body as string)
    expect(body2).not.toHaveProperty('account_facts')
    expect(body2).not.toHaveProperty('lost_deal_rex')
    expect(body2).not.toHaveProperty('previous_analysis')
  })

  it('compareAccounts posts account_ids (snake) to /compare/', async () => {
    fetchMock.mockResolvedValue(makeResponse(200, { success: true, data: {} }))
    const client = buildClient()

    await client.compareAccounts({ userId: 'u-1', accountIds: ['a-1', 'a-2'], profileData: {} })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://ia.test/compare/')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      user_id: 'u-1',
      account_ids: ['a-1', 'a-2'],
      profile_data: {},
    })
  })

  // #2007 — `generateProfile` ne mappait que les dix champs Temps-1 vers
  // `/profiler/generate`, alors que `EsnAnswers` porte déjà le complément
  // Temps-2 et le profil progressif (§21-30). L'IA (`OnboardingAnswers`) les
  // ignorait silencieusement faute d'être envoyés : ce test suit le champ
  // depuis `EsnAnswers` jusqu'au corps HTTP réellement posté.
  describe('generateProfile', () => {
    const FULL_ANSWERS: EsnAnswers = {
      esn_name: 'DataCraft',
      consultant_size: '1-10',
      sales_team_size: 'Solo',
      expertise_areas: ['Data & Intelligence Artificielle'],
      positioning: 'Généraliste - large spectre selon les besoins client',
      target_sectors: ['Banque de détail & Banque privée'],
      target_company_types: ['ETI (500-5 000 salariés)'],
      staffing_model: 'Mix équilibré CDI / Freelances',
      geo_zones: ['National (toute la France)'],
      remote_and_travel_scope: [],
      zone_capability_status: [],
      main_sales_pain: 'Trouver les bons comptes à cibler',
      offer_domain: 'esn_it',
      offer_domains: ['esn_it'],
      recruits_for_clients: 'no',
      decision_maker_personas: ["DSI / Directeur des Systèmes d'Information"],
      avg_sales_cycle: '3 à 6 mois',
      avg_tjm: '550-700',
      client_references: ['Société Générale'],
      no_go_sectors: ['BTP & Construction'],
      user_role: 'Business Manager',
      role_tenure: '1-2 ans',
      industry_tenure: '5 ans et plus',
      individual_goal: 'Signer 3 nouveaux comptes',
      monthly_target: '8000',
      company_age: '5-10 ans',
      company_size: '10-30',
      consultants_on_mission: '8',
      consultants_in_pipe: '2',
      team_overlap: 'Non',
      ramp_up_capacity: '2 semaines',
      avg_deal_size: '50k-100k',
      target_margin: '25%',
      portfolio_size: '15',
      accounts_relationship_status: 'Actif',
      weekly_calls: '20',
      weekly_emails: '30',
      weekly_linkedin: '10',
      proactivity_level: 'Élevé',
      public_sector_practice: 'Non',
      regulated_sector_readiness: 'Oui',
      partner_relationship: 'Aucun',
      go_to_market_channels: ['Cold email'],
      sales_routine: ['Priorisation hebdo'],
      sales_blockers: ['Manque de temps'],
      tooling: ['LinkedIn Sales Navigator'],
      shared_data_scope: ['Contacts'],
      // #2058.2 / #2058.10
      contact_windows: ['Matin (avant 12h)', 'Jamais après 19h'],
      detail_level: 'Court et dense',
      esn_maturity_situation: 'Activité en création',
      company_growth_goal: 'Ouvrir un nouveau territoire',
      active_clients_band: '1 à 5 clients actifs',
      revenue_recurrence: 'Un mix de récurrent et de one-shot',
      client_concentration_risk: 'Je ne sais pas encore',
      consultants_managed_by_user_band: '1 à 5 consultants',
      available_consultants_band: 'Quelques consultants disponibles en intercontrat',
      // Lot 26 (#2038, #2039, #2040, #2041).
      service_types: ['Régie', 'Forfait'],
      service_types_proven: ['Régie'],
      service_types_desired: ['Audit'],
      reference_sectors: ['Banque de détail & Banque privée'],
      priority_sectors: ['Banque de détail & Banque privée'],
      case_study_results: ['-30% de délai de recrutement'],
      reference_accounts: [],
      client_testimonials: ['« Équipe réactive » — DSI, client X'],
      expertise_no_concrete_proof: [],
      expertise_client_reference: [],
      expertise_personal_experience: [],
      expertise_partner: [],
      expertise_talent_pool: [],
      staffing_modes: ['Sous-traitance'],
      profile_validation_methods: ['Entretien technique interne'],
      contractual_constraints: ["Durée d'engagement minimale"],
      // Lot L17 (#2042, #2043, #2044).
      ideal_client_size: ['500 à 5 000 salariés'],
      ideal_client_structure: ['Filiale de groupe'],
      ideal_client_maturity: ['Client en forte croissance'],
      ideal_client_territory: ['Clients basés en Île-de-France'],
      ideal_client_accessibility: 'Accessible directement (réseau ou déjà en contact)',
      ideal_client_max_sales_cycle: '1 à 3 mois',
      ideal_client_min_deal_size: '10 000 à 50 000 €',
      ideal_client_referencement_constraints: ['Aucune contrainte de référencement connue'],
      ideal_client_current_state: ['Accessible dès maintenant'],
      real_response_level: 'Niveau management intermédiaire',
      budget_validator: 'Le décideur rencontré directement',
      access_orienteur: 'Un sponsor interne déjà identifié',
      entry_channels_dependency: ['Réseau personnel et anciens clients'],
      entry_channels_prerequisites: ['Accréditation fournisseur requise'],
      entry_channels_saturation: ['Appels sortants'],
      // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
      company_locations: ['Paris (siège)', 'Lyon'],
      // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais nombres.
      consultant_count: 42,
      annual_revenue_amount: 2_500_000,
      annual_revenue_period: 'Dernier exercice clos',
      // #2640.2 — le site de l'entreprise.
      esn_website: 'https://www.datacraft.example',
    }

    it('envoie le complément Temps-2 et le profil progressif au-delà des dix champs Temps-1', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
      const client = buildClient()

      await client.generateProfile({ userId: 'u-1', firstName: 'Théo', answers: FULL_ANSWERS })

      const [url, init] = fetchMock.mock.calls[0]!
      expect(url).toBe('http://ia.test/profiler/generate')
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        user_id: 'u-1',
        first_name: 'Théo',
        esn_name: 'DataCraft',
        consultant_size: '1-10',
        sales_team_size: 'Solo',
        expertise_areas: ['Data & Intelligence Artificielle'],
        positioning: 'Généraliste - large spectre selon les besoins client',
        staffing_model: 'Mix équilibré CDI / Freelances',
        target_sectors: ['Banque de détail & Banque privée'],
        target_company_types: ['ETI (500-5 000 salariés)'],
        geo_zones: ['National (toute la France)'],
        main_sales_pain: 'Trouver les bons comptes à cibler',
        offer_domain: 'esn_it',
        offer_domains: ['esn_it'],
        recruits_for_clients: 'no',
        workspace_profile: null,
        decision_maker_personas: ["DSI / Directeur des Systèmes d'Information"],
        avg_sales_cycle: '3 à 6 mois',
        avg_tjm: '550-700',
        client_references: ['Société Générale'],
        no_go_sectors: ['BTP & Construction'],
        user_role: 'Business Manager',
        role_tenure: '1-2 ans',
        industry_tenure: '5 ans et plus',
        individual_goal: 'Signer 3 nouveaux comptes',
        monthly_target: '8000',
        company_age: '5-10 ans',
        company_size: '10-30',
        consultants_on_mission: '8',
        consultants_in_pipe: '2',
        team_overlap: 'Non',
        ramp_up_capacity: '2 semaines',
        avg_deal_size: '50k-100k',
        target_margin: '25%',
        portfolio_size: '15',
        accounts_relationship_status: 'Actif',
        weekly_calls: '20',
        weekly_emails: '30',
        weekly_linkedin: '10',
        proactivity_level: 'Élevé',
        public_sector_practice: 'Non',
        regulated_sector_readiness: 'Oui',
        partner_relationship: 'Aucun',
        go_to_market_channels: ['Cold email'],
        sales_routine: ['Priorisation hebdo'],
        sales_blockers: ['Manque de temps'],
        tooling: ['LinkedIn Sales Navigator'],
        shared_data_scope: ['Contacts'],
        // #2058.2 / #2058.10 — `FULL_ANSWERS` les renseigne, comme `shared_data_scope`.
        contact_windows: ['Matin (avant 12h)', 'Jamais après 19h'],
        detail_level: 'Court et dense',
        // #2032.10 / #2036.9 — la fiche ci-dessus ne les renseigne pas : ADDITIF.
        role_functions_practiced: [],
        growth_target_zones: [],
        // #2034 / #2035 — lot L15.
        esn_maturity_situation: 'Activité en création',
        company_growth_goal: 'Ouvrir un nouveau territoire',
        active_clients_band: '1 à 5 clients actifs',
        revenue_recurrence: 'Un mix de récurrent et de one-shot',
        client_concentration_risk: 'Je ne sais pas encore',
        consultants_managed_by_user_band: '1 à 5 consultants',
        available_consultants_band: 'Quelques consultants disponibles en intercontrat',
        // #2035.1 / #2035.2 — non renseignées par cette fiche : ADDITIF, `null`.
        consultant_size_group_band: null,
        consultant_size_business_unit_band: null,
        service_types: ['Régie', 'Forfait'],
        service_types_proven: ['Régie'],
        service_types_desired: ['Audit'],
        reference_sectors: ['Banque de détail & Banque privée'],
        priority_sectors: ['Banque de détail & Banque privée'],
        case_study_results: ['-30% de délai de recrutement'],
        reference_accounts: [],
        client_testimonials: ['« Équipe réactive » — DSI, client X'],
        expertise_no_concrete_proof: [],
        expertise_client_reference: [],
        expertise_personal_experience: [],
        expertise_partner: [],
        expertise_talent_pool: [],
        staffing_modes: ['Sous-traitance'],
        profile_validation_methods: ['Entretien technique interne'],
        contractual_constraints: ["Durée d'engagement minimale"],
        ideal_client_size: ['500 à 5 000 salariés'],
        ideal_client_structure: ['Filiale de groupe'],
        ideal_client_maturity: ['Client en forte croissance'],
        ideal_client_territory: ['Clients basés en Île-de-France'],
        ideal_client_accessibility: 'Accessible directement (réseau ou déjà en contact)',
        ideal_client_max_sales_cycle: '1 à 3 mois',
        ideal_client_min_deal_size: '10 000 à 50 000 €',
        ideal_client_referencement_constraints: ['Aucune contrainte de référencement connue'],
        ideal_client_current_state: ['Accessible dès maintenant'],
        real_response_level: 'Niveau management intermédiaire',
        budget_validator: 'Le décideur rencontré directement',
        access_orienteur: 'Un sponsor interne déjà identifié',
        entry_channels_dependency: ['Réseau personnel et anciens clients'],
        entry_channels_prerequisites: ['Accréditation fournisseur requise'],
        entry_channels_saturation: ['Appels sortants'],
        // Lot L19 (#2048 → #2055) — la fiche ci-dessus ne les renseigne pas :
        // le corps les porte donc à leur valeur ADDITIVE, jamais inventée.
        entry_channels_used: [],
        entry_channels_period: [],
        entry_channels_measured: [],
        entry_channels_last_starts: [],
        entry_channels_time_split: [],
        activity_measures_tracked: [],
        activity_reference_period: null,
        weekly_sales_time_declared: null,
        weekly_sales_time_protected: null,
        weekly_sales_time_residual: null,
        weekly_sales_time_slots: [],
        competing_workloads: [],
        workload_variability: null,
        protected_slot_capacity: null,
        dossier_continuity_practices: [],
        dossier_continuity_breaks: [],
        tooling_crm: null,
        tooling_ats: null,
        tooling_erp: null,
        tooling_mailbox: null,
        tooling_calendar: null,
        tooling_drive: null,
        tooling_spreadsheet: null,
        tooling_enrichment: null,
        tooling_sourcing_platform: null,
        tooling_bi: null,
        tooling_personal_notes: null,
        tooling_reference: null,
        tooling_reference_data: [],
        tooling_reference_freshness: null,
        tooling_reference_confidence: null,
        tooling_reference_export: null,
        tooling_duplicates: null,
        tooling_pain: null,
        // #4971.1 — les outils maison voyagent jusqu’au profiler ; absents = `[]`.
        tooling_internal_names: [],
        sales_freins: [],
        frein_attempted: null,
        frein_stopped: null,
        frein_stopped_reason: null,
        // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
        company_locations: ['Paris (siège)', 'Lyon'],
        // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais nombres.
        consultant_count: 42,
        annual_revenue_amount: 2_500_000,
        annual_revenue_period: 'Dernier exercice clos',
        // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — `FULL_ANSWERS` ne les
        // renseigne pas, comme le bloc autorité juste au-dessus : additif,
        // dégradé en `null`.
        associates_count: null,
        recruiters_team_size: null,
        delivery_team_size: null,
        marketing_team_size: null,
        ops_team_size: null,
        team_coordination_mode: null,
        // #2007.9 — la complétude : 76 des 132 clés d'`EsnAnswers` sont
        // remplies dans `FULL_ANSWERS` (les 56 restantes — canaux, mesures,
        // temps réel, continuité, outillage, freins, et les 18 clés que la
        // vague 12 ajoute — n'y figurent pas).
        //
        // ⚠️ Ce témoin est le JUMEAU de celui de la ligne ~541. La vague 12 a
        // porté le total de 114 à 132 ; le second a été mis à jour, celui-ci
        // avait été oublié, et la CI est tombée dessus. Les deux se
        // REMESURENT ensemble — `computeAnswerCompleteness(...).totalCount`
        // suit le schéma, il ne se recopie pas d'une branche.
        //
        // 16/09/2026, absorption de `main` (PR #2364) : 132 → **158**, puis **159**
        // avec `priority_sectors` (#2041.1, ajout seulement). Les 26
        // clés de #2059 (attribution), #2046 (vivier) et #2047 (base de
        // clients). Remesuré sur `Object.keys(esnAnswersSchema.shape).length`
        // (`answers.test.ts` porte le même 158 et l'assertion qui le prouve),
        // jamais recopié.
        //
        // 16/09/2026, intégration de la vague 21 : 159 → **162** avec
        // `company_group_structure`, `rfp_deal_value` et `rfp_owner_assignment`
        // (#2015.7 / #2056.11 / #2057.10, ajout seulement). La branche avait
        // remesuré `answers.test.ts` (162) et pas ces deux jumeaux.
        //
        // 17/09/2026, lot CP2 (#2005.4) : 162 → **163** avec `company_locations`
        // (ajout seulement) — `FULL_ANSWERS` la renseigne, `answered_count`
        // suit (77 → 78).
        //
        // 18/09/2026, intégration vague H : deux branches sont parties de ce
        // même 163 SANS SE VOIR — #2035.1 / #2035.2 (`consultant_size_group_band` /
        // `consultant_size_business_unit_band`, +2) et #2053.3 / #2053.4
        // (`intercontrat_cost` / `payment_delay_visibility` / `payment_delay_band`,
        // +3). Chacune comptait juste sans l'autre ; la fusion REFAIT le
        // compte : 163 + 2 + 3 = 168. `FULL_ANSWERS` ne renseigne aucune
        // des cinq, `answered_count` restait à 78.
        //
        // 18/09/2026, point 16 (#2088.12/.13) : 168 → **171** avec
        // `consultant_count` / `annual_revenue_amount` / `annual_revenue_period`
        // (ajout seulement). `FULL_ANSWERS` renseigne les TROIS (contrairement
        // aux cinq ci-dessus) : `answered_count` suit, 78 → 81.
        //
        // Intégration vague 18/09 P : 171 → **180**, le bloc autorité et le
        // complément libre (`decisions_alone`, `decisions_to_validate`,
        // `invite_authority`, `margin_billing_authority`, `people_managed`,
        // `recruitment_accounts_authority`, `staffing_authority`,
        // `tools_access`, `uncovered_activity_note`). Ajout seulement :
        // `FULL_ANSWERS` n'en renseigne aucun, `answered_count` reste 81.
        //
        // Lot EE (18/09/2026, #2037.1/.3/.4/.5/.6/.11) : 180 → **186** avec
        // `associates_count` / `recruiters_team_size` / `delivery_team_size` /
        // `marketing_team_size` / `ops_team_size` / `team_coordination_mode`
        // (ajout seulement). `FULL_ANSWERS` n'en renseigne aucune,
        // `answered_count` reste 81.
        //
        // #2067.2 (lot H26, décision Louis du 18/09/2026) : 186 → **188** avec
        // `partners_regular_count` / `partners_occasional_count` (ajout
        // seulement). `FULL_ANSWERS` n'en renseigne aucune, `answered_count`
        // reste 81.
        //
        // #2058.2 / #2058.10 (20/09/2026) : 188 → **190** avec `contact_windows`
        // / `detail_level` — les deux derniers points qui tenaient #2058
        // ouverte. `FULL_ANSWERS` renseigne les DEUX : `answered_count` suit,
        // 81 → 83.
        //
        // #2640.2 (21/09/2026) : 190 → **191** avec `esn_website`.
        // `FULL_ANSWERS` la renseigne : `answered_count` suit, 83 → 84.
        //
        // #2045.1/.2/.4/.7 (lot B, 22/09/2026) : 191 → **195**, le réseau
        // personnel (4 champs) — ajout seulement. `FULL_ANSWERS` ne les
        // renseigne pas : `answered_count` reste 84.
        //
        // #2045.6 (lot B, 22/09/2026) : 195 → 196 avec
        // `warm_relations_count_band`, les relations chaudes transversales —
        // ajout seulement, dans la sous-étape `reseau-comptage` EXISTANTE.
        // `FULL_ANSWERS` ne la renseigne pas : `answered_count` reste 84.
        // #2039.6 (épopée #2880, feat/nuit-14-25-09) : 196 → 197 avec
        // `expertise_no_concrete_proof`, ajout seulement dans la sous-étape
        // `credibilite-preuves` EXISTANTE.
        // #2036.2 (#2847, feat/nuit-15-25-09, modèle de territoire à 7 axes) :
        // 197 → **198** avec `remote_and_travel_scope`, bloc neuf
        // `answers-territoire-remote.ts` — REMESURÉ à l'intégration, les deux
        // lots de nuit étaient partis du même 196 sans se voir. `FULL_ANSWERS`
        // ne la renseigne pas : `answered_count` reste 84.
        // Lot r4 (26/09) : 198 → 199 avec `zone_capability_status`, bloc neuf
        // `answers-territoire-capacite.ts` (#2036.8, v1 tranché sans Louis).
        // `FULL_ANSWERS` ne la renseigne pas non plus : `answered_count` reste 84.
        // #2039.2 (épopée #2880, feat/soir-s10-26-09) : 199 → 200 avec
        // `expertise_client_reference`, ajout seulement dans la sous-étape
        // `credibilite-preuves` EXISTANTE. `FULL_ANSWERS` ne la renseigne pas :
        // `answered_count` reste 84.
        // #2039.3/.4/.5 (épopée #2880, vague G lot g10) : 200 → 203 avec
        // `expertise_personal_experience`/`expertise_partner`/
        // `expertise_talent_pool`, ajout seulement dans la sous-étape
        // `credibilite-preuves` EXISTANTE. `FULL_ANSWERS` ne les renseigne
        // pas : `answered_count` reste 84.
        // #3923.a (lot M04, 09/10) : 204 → 205 avec `placed_roles`, bloc neuf
        // `answers-metiers-places.ts`. `FULL_ANSWERS` ne la renseigne pas :
        // `answered_count` reste 84.
        // Théo O onboarding-couverture (22/10) — les 26 clés neuves de la V23 : `FULL_ANSWERS` ne les renseigne pas,
        // elles dégradent en `null` / `[]` (ajout seulement) ; le total passe de 206 à 232.
        target_nature: [],
        target_size: [],
        language_capabilities: [],
        priority_expertise: [],
        skill_technos: [],
        activity_nature: [],
        data_sources: [],
        tools: [],
        delivery_frictions: [],
        recruiting_priorities: [],
        country_scope: [],
        account_access: null,
        horizon: null,
        success_target: null,
        offer_pitch: null,
        workflow_pain: null,
        autonomy: null,
        context_policy: null,
        commercial_limits: null,
        currency: null,
        scope_level: null,
        scope_unit: null,
        bench_status: null,
        geography_detail: null,
        no_go: null,
        answered_count: 84,
        total_question_count: 233, // #4971.1 : +1 (`tooling_internal_names`)
        // #2007.8 — non passé par ce test : dégrade en `[]`.
        connected_tools: [],
        // #2007.3 — non passé par ce test : dégrade en `[]`, jamais un périmètre deviné.
        business_units: [],
        // #2007.6/#2007.7/#2007.10 — non passés par ce test : dégradent en `[]`.
        answer_provenance_lines: [],
        imported_context_keys: [],
        corrected_answers_lines: [],
        // #2007.11 — non passé par ce test : dégrade en `[]`.
        skipped_question_keys: [],
        progress_callback: null,
      })
    })

    it('reste additif : un profil Temps-1 seul (rien au-delà) dégrade les champs neufs en null/liste vide, jamais en donnée inventée', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
      const client = buildClient()
      const minimalAnswers: EsnAnswers = {
        esn_name: 'DataCraft',
        consultant_size: '1-10',
        sales_team_size: 'Solo',
        expertise_areas: [],
        positioning: null,
        target_sectors: [],
        target_company_types: [],
        staffing_model: null,
        geo_zones: [],
        remote_and_travel_scope: [],
        zone_capability_status: [],
        main_sales_pain: null,
        offer_domain: null,
        offer_domains: [],
        recruits_for_clients: null,
        workspace_profile: null,
        service_types: [],
        service_types_proven: [],
        service_types_desired: [],
        reference_sectors: [],
        priority_sectors: [],
        case_study_results: [],
        reference_accounts: [],
        client_testimonials: [],
        expertise_no_concrete_proof: [],
        expertise_client_reference: [],
        expertise_personal_experience: [],
        expertise_partner: [],
        expertise_talent_pool: [],
        staffing_modes: [],
        profile_validation_methods: [],
        contractual_constraints: [],
        // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
        company_locations: [],
        // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — même règle additive :
        // un profil Temps-1 seul n'a pas répondu à ces deux questions.
        consultant_count: null,
        annual_revenue_amount: null,
        annual_revenue_period: null,
        // #2640.2 — le site de l'entreprise.
        esn_website: null,
      }

      await client.generateProfile({ userId: 'u-1', answers: minimalAnswers })

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      expect(body.user_role).toBeNull()
      expect(body.monthly_target).toBeNull()
      expect(body.sales_blockers).toEqual([])
      expect(body.decision_maker_personas).toEqual([])
      expect(body.esn_maturity_situation).toBeNull()
      expect(body.available_consultants_band).toBeNull()
      // Lot 26 — même règle additive pour les neuf champs neufs.
      expect(body.service_types).toEqual([])
      expect(body.service_types_proven).toEqual([])
      expect(body.service_types_desired).toEqual([])
      expect(body.reference_sectors).toEqual([])
      expect(body.case_study_results).toEqual([])
      expect(body.client_testimonials).toEqual([])
      expect(body.staffing_modes).toEqual([])
      expect(body.profile_validation_methods).toEqual([])
      expect(body.contractual_constraints).toEqual([])
      // Lot L17 — même règle additive pour les quinze champs du client idéal,
      // des interlocuteurs et des chemins d'accès.
      expect(body.ideal_client_size).toEqual([])
      expect(body.ideal_client_accessibility).toBeNull()
      expect(body.ideal_client_min_deal_size).toBeNull()
      expect(body.real_response_level).toBeNull()
      expect(body.access_orienteur).toBeNull()
      expect(body.entry_channels_dependency).toEqual([])
      expect(body.entry_channels_saturation).toEqual([])
      // Lot L19 — même règle pour les 37 champs de l'activité déclarée.
      expect(body.entry_channels_used).toEqual([])
      expect(body.weekly_sales_time_declared).toBeNull()
      expect(body.tooling_crm).toBeNull()
      expect(body.sales_freins).toEqual([])
      expect(body.frein_stopped_reason).toBeNull()
      // #2032.10 / #2036.9 — même règle additive.
      expect(body.role_functions_practiced).toEqual([])
      expect(body.growth_target_zones).toEqual([])
      // #2005.4 (DÉCISION Louis 17/09, lot CP2) — même règle additive.
      expect(body.company_locations).toEqual([])
      // #2058.2 / #2058.10 — même règle additive : `minimalAnswers` n'a pas
      // répondu aux moments acceptés ni au niveau de détail attendu.
      expect(body.contact_windows).toEqual([])
      expect(body.detail_level).toBeNull()
      // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — même règle additive :
      // un profil Temps-1 seul dégrade en `null`, jamais un 0 inventé.
      expect(body.consultant_count).toBeNull()
      expect(body.annual_revenue_amount).toBeNull()
      expect(body.annual_revenue_period).toBeNull()
      // #2007.6/#2007.7/#2007.10 — même règle additive : non passés par ce
      // test (résolus par l'appelant, `ProfileContextService`), dégradent en
      // `[]`.
      expect(body.answer_provenance_lines).toEqual([])
      expect(body.imported_context_keys).toEqual([])
      expect(body.corrected_answers_lines).toEqual([])
      // #2007.11 — même règle additive : non passé par ce test, dégrade en `[]`.
      expect(body.skipped_question_keys).toEqual([])
      // #2007.9 — la complétude reste calculée même sur un profil minimal :
      // `esn_name`/`consultant_size`/`sales_team_size` sont les 3 seules clés
      // remplies dans `minimalAnswers`. Le TOTAL, lui, suit `EsnAnswers` : la
      // vague 12 y ajoute 18 clés (114 → 132), puis l'absorption de `main`
      // (PR #2364) 26 de plus (132 → 158) : ce nombre se REMESURE à chaque
      // intégration, il ne se recopie pas d'une branche. Jumeau ligne ~487.
      expect(body.answered_count).toBe(3)
      // Vague 21 : 159 → 162 (filiation, économie du dossier, owner).
      // Lot CP2 (17/09/2026, #2005.4) : 162 → 163 (`company_locations`).
      // Intégration vague 18/09 H : 163 → 168, deux branches parties du même
      // 163 sans se voir — #2035.1 / #2035.2 (`consultant_size_group_band` /
      // `consultant_size_business_unit_band`, +2) et #2053.3 / #2053.4
      // (`intercontrat_cost` / `payment_delay_visibility` / `payment_delay_band`,
      // +3). La fusion REFAIT le compte : 163 + 2 + 3 = 168.
      // 18/09/2026, point 16 (#2088.12/.13) : 168 → 171 (ajout seulement,
      // `minimalAnswers` ne renseigne aucune des trois).
      // Intégration vague 18/09 P : 171 → 180, les neuf champs du bloc autorité
      // et du complément libre — ajout seulement, `minimalAnswers` n'en
      // renseigne aucun, `answered_count` reste 3.
      // Lot EE (18/09/2026, #2037.1/.3/.4/.5/.6/.11) : 180 → 186, ajout
      // seulement, `minimalAnswers` n'en renseigne aucune, `answered_count`
      // reste 3.
      // #2067.2 (lot H26, 18/09/2026) : 186 → 188, les deux nombres de
      // partenaires — ajout seulement, `answered_count` reste 3.
      // #2058.2 / #2058.10 (20/09/2026) : 188 → 190, les moments acceptés et
      // le niveau de détail attendu — ajout seulement, `answered_count` reste 3.
      // #2640.2 (21/09/2026) : 190 → 191, `esn_website` — ajout seulement,
      // `minimalAnswers` la met à `null`, `answered_count` reste 3.
      // #2045.1/.2/.4/.7 (lot B, 22/09/2026) : 191 → 195, le réseau personnel
      // (4 champs) — ajout seulement, `minimalAnswers` ne les renseigne pas,
      // `answered_count` reste 3.
      // #2045.6 (lot B, 22/09/2026) : 195 → 196, `warm_relations_count_band` —
      // même règle additive, `answered_count` reste 3.
      // #2039.6 (épopée #2880, feat/nuit-14-25-09) : 196 → 197,
      // `expertise_no_concrete_proof` — même règle additive, `answered_count`
      // reste 3.
      // #2036.2 (#2847, feat/nuit-15-25-09) : 197 → 198, `remote_and_travel_scope`
      // — même règle additive, `answered_count` reste 3.
      // Lot r4 (26/09) : 198 → 199, `zone_capability_status` (#2036.8, v1
      // tranché sans Louis) — même règle additive, `answered_count` reste 3.
      // #2039.2 (épopée #2880, feat/soir-s10-26-09) : 199 → 200,
      // `expertise_client_reference` — même règle additive, `answered_count`
      // reste 3.
      // #2039.3/.4/.5 (épopée #2880, vague G lot g10) : 200 → 203,
      // `expertise_personal_experience`/`expertise_partner`/
      // `expertise_talent_pool` — même règle additive, `answered_count` reste 3.
      // #3923.a (lot M04, 09/10) : 204 → 205, `placed_roles`.
      // #4270.1 (18/10) : 205 → 206, `workspace_profile`.
      // Théo O onboarding-couverture (22/10) : 206 → 232, les 26 clés neuves de la V23.
      // Lot J (31/10) : 232 → 233, #4971.1 `tooling_internal_names`.
      expect(body.total_question_count).toBe(233)
      // #2007.8 — même règle additive : `connectedTools` non passé dégrade en `[]`.
      expect(body.connected_tools).toEqual([])
    })

    // #2007.8 — l'état RÉEL des connecteurs atteint le moteur, pas seulement
    // la déclaration `tooling_*`. Preuve par la VALEUR, pas par la présence
    // de la clé (même discipline que #2007.5) : la liste transmise doit
    // arriver à l'octet près.
    it('#2007.8 — transmet les connecteurs réellement branchés, pas seulement déclarés', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
      const client = buildClient()
      const answers: EsnAnswers = {
        esn_name: 'DataCraft',
        consultant_size: '1-10',
        sales_team_size: 'Solo',
        expertise_areas: [],
        positioning: null,
        target_sectors: [],
        target_company_types: [],
        staffing_model: null,
        geo_zones: [],
        remote_and_travel_scope: [],
        zone_capability_status: [],
        main_sales_pain: null,
        offer_domain: null,
        offer_domains: [],
        recruits_for_clients: null,
        service_types: [],
        service_types_proven: [],
        service_types_desired: [],
        reference_sectors: [],
        priority_sectors: [],
        case_study_results: [],
        reference_accounts: [],
        client_testimonials: [],
        expertise_no_concrete_proof: [],
        expertise_client_reference: [],
        expertise_personal_experience: [],
        expertise_partner: [],
        expertise_talent_pool: [],
        staffing_modes: [],
        profile_validation_methods: [],
        contractual_constraints: [],
        company_locations: [],
        consultant_count: null,
        annual_revenue_amount: null,
        annual_revenue_period: null,
        // #2640.2 — le site de l'entreprise.
        esn_website: null,
      }

      await client.generateProfile({ userId: 'u-1', answers, connectedTools: ['Salesforce', 'HubSpot'] })

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      expect(body.connected_tools).toEqual(['Salesforce', 'HubSpot'])
    })

    // #2007.3 — le périmètre PORTÉ (BU / agence) atteint le Profileur, à
    // l'octet près, sous la forme que `bellum_profiler.py` lit.
    it('#2007.3 — transmet les BU que le membre porte au Profileur', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
      const client = buildClient()

      await client.generateProfile({
        userId: 'u-1',
        answers: { esn_name: 'DataCraft' } as unknown as EsnAnswers,
        businessUnits: [
          { name: 'Agence Lyon', kind: 'agency', territory: 'Auvergne-Rhône-Alpes', specialties: ['Data'] },
        ],
      })

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      expect(body.business_units).toEqual([
        { name: 'Agence Lyon', kind: 'agency', territory: 'Auvergne-Rhône-Alpes', specialties: ['Data'] },
      ])
    })

    // #2007.11 — les clés PASSÉES volontairement atteignent le Profileur, à
    // l'octet près, sous la forme que `bellum_profiler.py` lit.
    it('#2007.11 — transmet les clés PASSÉES au Profileur', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
      const client = buildClient()

      await client.generateProfile({
        userId: 'u-1',
        answers: { esn_name: 'DataCraft' } as unknown as EsnAnswers,
        skippedQuestionKeys: ['avg_tjm'],
      })

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      expect(body.skipped_question_keys).toEqual(['avg_tjm'])
    })

    // ADDITIF : absent dégrade en `[]`, jamais une clé passée inventée.
    it('#2007.11 — aucune clé passée ne s’invente quand le champ est absent', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { data: {} }))
      const client = buildClient()

      await client.generateProfile({ userId: 'u-1', answers: { esn_name: 'DataCraft' } as unknown as EsnAnswers })

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
      expect(body.skipped_question_keys).toEqual([])
    })
  })

  // LOT 10 — `GET /metrics/cost` (apps/ia/app/main.py) existait sans aucun
  // appelant. `costMetrics()` en est le premier : même contrat que
  // `killSwitches()` juste au-dessus (`null` quand le moteur ne répond pas,
  // l'appelant doit en faire « inconnu », jamais un total à zéro).
  describe('costMetrics', () => {
    it('lit /metrics/cost et met en forme camelCase', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(200, {
          prompts: [
            {
              prompt: 'bellum_chat',
              calls: 3,
              input_tokens: 900,
              output_tokens: 450,
              cache_read_tokens: 10,
              cache_creation_tokens: 5,
              cost_usd: 0.0123,
              model: 'claude-sonnet-5',
              unpriced_calls: 0,
            },
          ],
          total_cost_usd: 0.0123,
          truncations: {
            bellum_chat: { events: 1, wasted_output_tokens: 200, wasted_cost_usd: 0.002 },
          },
        }),
      )
      const client = buildClient()

      const result = await client.costMetrics()

      expect(fetchMock.mock.calls[0]![0]).toBe('http://ia.test/metrics/cost')
      expect(result).toEqual({
        prompts: [
          {
            prompt: 'bellum_chat',
            calls: 3,
            inputTokens: 900,
            outputTokens: 450,
            cacheReadTokens: 10,
            cacheCreationTokens: 5,
            costUsd: 0.0123,
            model: 'claude-sonnet-5',
            unpricedCalls: 0,
          },
        ],
        totalCostUsd: 0.0123,
        truncations: {
          bellum_chat: { events: 1, wastedOutputTokens: 200, wastedCostUsd: 0.002 },
        },
      })
    })

    it('rend un total à ZÉRO quand le moteur répond et n’a réellement rien dépensé', async () => {
      // Distinction centrale : un process qui vient de démarrer et n'a encore
      // rien facturé a un total VRAI de 0 — ce n'est PAS le cas « inconnu »
      // ci-dessous, et le confondre serait « attraper ce qu'on ne vise pas ».
      fetchMock.mockResolvedValue(makeResponse(200, { prompts: [], total_cost_usd: 0, truncations: {} }))
      const client = buildClient()

      const result = await client.costMetrics()

      expect(result).toEqual({ prompts: [], totalCostUsd: 0, truncations: {} })
    })

    it('rend `null` — jamais un objet à zéro — quand le moteur ne répond pas', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
      const client = buildClient()

      const result = await client.costMetrics()

      expect(result).toBeNull()
    })

    it('ignore une entrée de prompt malformée plutôt que de planter', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(200, { prompts: [null, 'garbage', { prompt: 'ok', calls: 1 }], total_cost_usd: 'NaN' }),
      )
      const client = buildClient()

      const result = await client.costMetrics()

      expect(result?.prompts).toEqual([
        {
          prompt: 'ok',
          calls: 1,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costUsd: 0,
          model: '',
          unpricedCalls: 0,
        },
      ])
      // Une chaîne n'est pas un nombre : le total tombe sur son défaut plutôt
      // que de propager une valeur non numérique jusqu'à l'écran.
      expect(result?.totalCostUsd).toBe(0)
    })
  })

  // #2915.2 — un appel COURT, dont un écran attend la réponse en direct, ne
  // doit jamais faire la queue derrière une analyse de fond qui tient un
  // socket ouvert sur `LONG_CALL_DISPATCHER` (même défaut que #2535.1,
  // corrigé alors pour `discoverRegistry`/`discoverSignals` seulement) — mesuré
  // en production le 24/09 : 15 min de retard au démarrage d'une analyse.
  // Ce test dit NON tant qu'un de ces appels reste sur le pool de fond : sans
  // `interactive: true`, `dispatcher` vaudrait le MÊME objet qu'un appel de
  // fond comme `research()`.
  describe('#2915.2 — appels courts sur le dispatcher interactif', () => {
    async function dispatcherOf(run: (client: IaClient) => Promise<unknown>): Promise<unknown> {
      fetchMock.mockReset()
      fetchMock.mockResolvedValue(makeResponse(200, {}))
      const client = buildClient()
      await run(client).catch(() => undefined)
      const init = fetchMock.mock.calls[0]![1] as { dispatcher: unknown }
      return init.dispatcher
    }

    it('research() (appel de fond) reste sur le pool par défaut — témoin', async () => {
      const dispatcher = await dispatcherOf(client =>
        client.research({ companyName: 'BNP Paribas', profileData: {}, accountId: 'a-1', userId: 'u-1' }),
      )
      const otherBackground = await dispatcherOf(client =>
        client.contacts({ companyName: 'BNP Paribas', profileData: {}, accountId: 'a-1', userId: 'u-1' }),
      )
      // Les deux appels de fond partagent le MÊME dispatcher — le témoin.
      expect(dispatcher).toBe(otherBackground)
    })

    it.each<[string, (client: IaClient) => Promise<unknown>]>([
      ['version', client => client.version()],
      ['discoverCompanies', client => client.discoverCompanies('Capgemini', 6)],
      ['prefillEsnProfile', client => client.prefillEsnProfile({ name: 'Capgemini' })],
      [
        'reformulateOnboardingAnswer',
        client =>
          client
            .reformulateOnboardingAnswer({ questionLabel: 'Q', answerText: 'A', locale: 'fr' })
            .catch(() => undefined),
      ],
      ['killSwitches', client => client.killSwitches()],
      ['costMetrics', client => client.costMetrics()],
    ])('%s passe par un dispatcher DIFFÉRENT du pool de fond', async (_name, run) => {
      const backgroundDispatcher = await dispatcherOf(client =>
        client.research({ companyName: 'BNP Paribas', profileData: {}, accountId: 'a-1', userId: 'u-1' }),
      )
      const shortCallDispatcher = await dispatcherOf(run)

      expect(shortCallDispatcher).not.toBe(backgroundDispatcher)
    })
  })

  // #2009.11 — la version STABLE d'un prompt, lue AVANT l'appel générateur
  // pour entrer dans la clé d'idempotence (`ProfileContextService.generationKey`).
  describe('promptVersion', () => {
    it('lit /config/prompt-version/:name et rend la version', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { version: 'abc123' }))
      const client = buildClient()

      const result = await client.promptVersion('profiler')

      expect(fetchMock.mock.calls[0]![0]).toBe('http://ia.test/config/prompt-version/profiler')
      expect(result).toBe('abc123')
    })

    it('rend `null` pour un nom non enregistré, jamais une valeur inventée', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { version: null }))
      const client = buildClient()

      const result = await client.promptVersion('does-not-exist')

      expect(result).toBeNull()
    })

    it('rend `null` — jamais une erreur — quand le moteur ne répond pas', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
      const client = buildClient()

      const result = await client.promptVersion('profiler')

      expect(result).toBeNull()
    })
  })

  // The graph SSE boundary. The schema itself is a discriminated union owned by
  // `@bellum/contracts` and exercised there (`graph-events.test.ts`); what these
  // tests own is the POLICY this client applies around it — which failure mode
  // each kind of bad frame gets, since that is what decides whether a bad deploy
  // costs one log line or every account's pipeline.
  describe('analyzeGraph — the event boundary', () => {
    const graphInput = { companyName: 'SNCF', profileData: {}, accountId: 'a-1', userId: 'u-1' }

    async function collect(client: IaClient): Promise<GraphEvent[]> {
      const events: GraphEvent[] = []
      for await (const ev of client.analyzeGraph(graphInput)) events.push(ev)
      return events
    }

    it('yields the events a real run emits, including judge_completed', async () => {
      // The Judge frame lands on EVERY fresh run, after the plan phase. A schema
      // that failed to model it would throw on an already-completed dossier.
      fetchMock.mockResolvedValue(
        sseResponse([
          {
            type: 'phase_completed',
            phase: 'research',
            progress: 25,
            data: { telemetry: {}, output: { research: {} } },
          },
          { type: 'judge_completed', phase: 'judge', progress: 100, data: { judge: { verdict: 'flagged' } } },
          { type: 'run_completed', phase: null, progress: 100, data: { summary: { total_cost_usd: 1 } } },
        ]),
      )

      const events = await collect(buildClient())

      expect(events.map(e => e.type)).toEqual(['phase_completed', 'judge_completed', 'run_completed'])
    })

    it('SKIPS an event type it does not know, and keeps the run going', async () => {
      // The IA and this API are separate Railway services with no deployment
      // ordering guarantee, so the IA can ship a new event type first. Throwing
      // here would throw MID-STREAM — after phases had already been persisted —
      // as an error that rides the BullMQ retry budget, so every account would
      // re-run the whole expensive pipeline straight back into the same frame.
      // An event we cannot interpret carries nothing we would have acted on.
      fetchMock.mockResolvedValue(
        sseResponse([
          {
            type: 'phase_completed',
            phase: 'research',
            progress: 25,
            data: { telemetry: {}, output: { research: {} } },
          },
          { type: 'phase_progress', phase: 'contacts', progress: 40, data: { pct: 12 } },
          { type: 'run_completed', phase: null, progress: 100, data: { summary: {} } },
        ]),
      )

      const events = await collect(buildClient())

      // The unknown frame is dropped; the terminal event still arrives, so the
      // run finalises as a success instead of being retried into oblivion.
      expect(events.map(e => e.type)).toEqual(['phase_completed', 'run_completed'])
    })

    it('THROWS on a known event whose payload is malformed, naming event and field', async () => {
      // The opposite trade: this is data the worker WILL act on. A
      // `phase_completed` with no `output` used to persist an empty dossier and
      // mark the phase done — the dossier arrives blank and nobody is told.
      fetchMock.mockResolvedValue(sseResponse([{ type: 'phase_completed', phase: 'research', progress: 25, data: {} }]))

      const err = await collect(buildClient()).catch((e: unknown) => e)

      expect((err as Error).name).toBe('GraphEventContractError')
      expect((err as Error).message).toContain('phase_completed')
      expect((err as Error).message).toContain('data.output')
    })

    it('THROWS on a failure event that names no cause', async () => {
      // The frame at the centre of the outage. Previously it parsed happily and
      // rendered as the literal string "research failed".
      fetchMock.mockResolvedValue(
        sseResponse([
          { type: 'phase_failed', phase: 'research', progress: 25, data: { error: { phase: 'research' } } },
        ]),
      )

      const err = await collect(buildClient()).catch((e: unknown) => e)

      expect((err as Error).name).toBe('GraphEventContractError')
      expect((err as Error).message).toContain('data.error.message')
    })
  })

  // 14/10/2026 — `POST /mcp/accounts/:id/ask` répondait 500 « Unexpected token 'd',
  // "data: {"ty"... is not valid JSON » : `chat()` lisait en JSON un flux SSE.
  describe('chat — consomme le flux SSE (bufferisé)', () => {
    it('rend l’enveloppe du dernier événement done, sans lire le flux comme du JSON', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          { type: 'delta', text: 'Bon' },
          { type: 'step', label: 'Lecture…' },
          { type: 'done', success: true, data: { reply: 'Bonjour !' } },
        ]),
      )

      const envelope = await buildClient().chat({ userId: 'u-1', message: 'salut' })

      expect(envelope).toEqual({ success: true, data: { reply: 'Bonjour !' } })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('rend success:false si le flux se termine sans événement done', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'delta', text: 'Bon' }]))

      const envelope = await buildClient().chat({ userId: 'u-1', message: 'salut' })

      expect(envelope).toEqual({ success: false, data: {} })
    })
  })

  // LOT STREAM (12/09/2026) — `/chat/message` diffuse maintenant en SSE.
  describe('chatStream — LOT STREAM', () => {
    async function collect(client: IaClient) {
      const events: unknown[] = []
      for await (const ev of client.chatStream({ userId: 'u-1', message: 'salut' })) events.push(ev)
      return events
    }

    it('yields delta, step and the terminal done event, in order', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          { type: 'delta', text: 'Bon' },
          { type: 'step', label: 'Lecture de ta messagerie…' },
          { type: 'delta', text: 'jour !' },
          { type: 'done', success: true, data: { reply: 'Bonjour !' } },
        ]),
      )

      const events = await collect(buildClient())

      expect(events).toEqual([
        { type: 'delta', text: 'Bon' },
        { type: 'step', label: 'Lecture de ta messagerie…' },
        { type: 'delta', text: 'jour !' },
        { type: 'done', success: true, data: { reply: 'Bonjour !' } },
      ])
    })

    it('skips a frame it does not recognise instead of throwing mid-stream', async () => {
      // Deux services, deux déploiements — le service IA peut émettre un type
      // que ce client ne connaît pas encore. Le sauter est le côté sûr de la
      // politique (même choix que `analyzeGraph` pour un `unknown_type`).
      fetchMock.mockResolvedValue(
        sseResponse([
          { type: 'delta', text: 'Bon' },
          { type: 'thinking', text: 'chaîne de raisonnement interne' },
          { type: 'done', success: true, data: { reply: 'Bon' } },
        ]),
      )

      const events = await collect(buildClient())

      expect(events).toEqual([
        { type: 'delta', text: 'Bon' },
        { type: 'done', success: true, data: { reply: 'Bon' } },
      ])
    })

    // #1958.8 — la langue de l'INTERFACE, transmise telle quelle au service IA
    // (snake_case, comme tout le reste du corps). Absente ⇒ clé absente : le
    // service IA défaut sur "fr" lui-même, `chatBody` ne devine rien ici.
    it('forwards the interface language as interface_language', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({
        userId: 'u-1',
        message: 'salut',
        interfaceLanguage: 'en',
      })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body).toMatchObject({ interface_language: 'en' })
    })

    it('omits interface_language when the caller does not know it', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body).not.toHaveProperty('interface_language')
    })

    // #1951.2 / #1951.3 — la fiche du consultant ou du besoin, RENDUE par l'API.
    // Clé omise sans portée objet : le service IA ajoute un bloc seulement
    // quand elle est là, donc le corps reste byte-identique pour tous les autres.
    it('forwards the rendered scope object as scope_object, and omits it when absent', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', scopeObject: 'Sophie Martin' })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      expect(JSON.parse((withInit as RequestInit).body as string)).toMatchObject({ scope_object: 'Sophie Martin' })

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      expect(JSON.parse((withoutInit as RequestInit).body as string)).not.toHaveProperty('scope_object')
    })

    // #2453 — le mode de contexte choisi sous le composeur. Clé omise sans mode :
    // le service IA ne retire aucune couche et le corps reste byte-identique.
    it('forwards the context mode as context_mode, and omits it when absent', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', contextMode: 'neutral' })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      expect(JSON.parse((withInit as RequestInit).body as string)).toMatchObject({ context_mode: 'neutral' })

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      expect(JSON.parse((withoutInit as RequestInit).body as string)).not.toHaveProperty('context_mode')
    })

    // #3708 — « Outils et sources » : l'exclusion voyage jusqu'au service IA
    // (plus une simple mention dans le texte). Clé omise sans exclusion.
    it('forwards excluded tool families as excluded_families, and omits them when empty', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', excludedToolFamilies: ['crm'] })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      expect(JSON.parse((withInit as RequestInit).body as string)).toMatchObject({ excluded_families: ['crm'] })

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', excludedToolFamilies: [] })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      expect(JSON.parse((withoutInit as RequestInit).body as string)).not.toHaveProperty('excluded_families')
    })

    // #3708.fournisseur — l'exclusion PAR OUTIL voyage aussi jusqu'au service IA.
    it('forwards excluded tool providers as excluded_providers, and omits them when empty', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      for await (const _ev of client.chatStream({
        userId: 'u-1',
        message: 'salut',
        excludedToolProviders: ['hubspot'],
      })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      expect(JSON.parse((withInit as RequestInit).body as string)).toMatchObject({ excluded_providers: ['hubspot'] })

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', excludedToolProviders: [] })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      expect(JSON.parse((withoutInit as RequestInit).body as string)).not.toHaveProperty('excluded_providers')
    })

    // #3768 — le geste « retravailler cette réponse » part en snake_case, et la
    // clé est omise sans geste (corps byte-identique pour tout autre tour).
    it('forwards the reply transform as reply_transform, and omits it when absent', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      const replyTransform = {
        id: 'justify' as const,
        sourceText: '1. Alpha — partielle',
        layout: 'list' as const,
        accountIds: [],
        reserves: ['La cartographie est partielle.'],
      }
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'Mieux justifier', replyTransform })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      expect(JSON.parse((withInit as RequestInit).body as string)).toMatchObject({
        reply_transform: {
          id: 'justify',
          source_text: '1. Alpha — partielle',
          layout: 'list',
          account_ids: [],
          reserves: ['La cartographie est partielle.'],
        },
      })

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      expect(JSON.parse((withoutInit as RequestInit).body as string)).not.toHaveProperty('reply_transform')
    })

    // #4397 (N1) — l'identifiant d'une suite cliquée voyage en follow_up_ref (snake_case), clé omise sinon.
    it('forwards the follow-up ref as follow_up_ref, and omits it when absent', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      const followUpRef = { talentId: '34f4c624-1111-4222-8333-444455556666' }
      for await (const _ev of client.chatStream({
        userId: 'u-1',
        message: 'Lance l’analyse du compte X',
        followUpRef,
      })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      const sent = JSON.parse((withInit as RequestInit).body as string)
      expect(sent).toMatchObject({ follow_up_ref: { talent_id: '34f4c624-1111-4222-8333-444455556666' } })
      expect(sent.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i)

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      expect(JSON.parse((withoutInit as RequestInit).body as string)).not.toHaveProperty('follow_up_ref')
    })

    // #2450.1 (reste partiel, épopée #2882) — le mode de recherche choisi sous
    // le composeur. Clé omise sans mode : le service IA garde l'heuristique
    // habituelle et le corps reste byte-identique.
    it('forwards the research mode as mode, and omits it when absent', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', mode: 'approfondi' })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      expect(JSON.parse((withInit as RequestInit).body as string)).toMatchObject({ mode: 'approfondi' })

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      expect(JSON.parse((withoutInit as RequestInit).body as string)).not.toHaveProperty('mode')
    })

    // #2259.11 / #2259.4 / #2259.13 / #2259.6 — identité et entourage, résolus
    // server-side. Clés omises quand l'appelant ne les fournit pas : le corps
    // reste byte-identique pour toute route qui ne les connaît pas.
    it('forwards last_name / workspace_role / is_account_owner / mentioned_colleague, and omits them when absent', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      for await (const _ev of client.chatStream({
        userId: 'u-1',
        message: 'salut',
        lastName: 'Bénard',
        workspaceRole: 'owner',
        isAccountOwner: true,
        mentionedColleague: 'Théo',
      })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      expect(JSON.parse((withInit as RequestInit).body as string)).toMatchObject({
        last_name: 'Bénard',
        workspace_role: 'owner',
        is_account_owner: true,
        mentioned_colleague: 'Théo',
      })

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      const body = JSON.parse((withoutInit as RequestInit).body as string)
      expect(body).not.toHaveProperty('last_name')
      expect(body).not.toHaveProperty('workspace_role')
      expect(body).not.toHaveProperty('is_account_owner')
      expect(body).not.toHaveProperty('mentioned_colleague')
    })

    // #1950.17 — le plafond agrégé de la réponse. Clé omise quand l'appelant ne
    // le fournit pas (route MCP) : le service IA n'applique alors aucun plafond.
    it('forwards the reply cost ceiling as reply_cost_ceiling, and omits it when absent', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', replyCostCeiling: 8 })) {
        // drain
      }
      const [, withInit] = fetchMock.mock.calls[0]!
      expect(JSON.parse((withInit as RequestInit).body as string)).toMatchObject({ reply_cost_ceiling: 8 })

      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }
      const [, withoutInit] = fetchMock.mock.calls[1]!
      expect(JSON.parse((withoutInit as RequestInit).body as string)).not.toHaveProperty('reply_cost_ceiling')
    })

    // #1954.7 — le FIL courant voyage jusqu'au service IA. Sans lui,
    // `rag_service.fetch_documents_by_ids` ne lit JAMAIS un document joint
    // `scope: 'conversation'` (fail closed côté IA) : le paramètre était déclaré
    // dans `ChatRequest.conversation_id` et jamais envoyé. Absent ⇒ clé absente.
    it('forwards the thread id as conversation_id', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', conversationId: 'account-a-1' })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body).toMatchObject({ conversation_id: 'account-a-1' })
    })

    it('omits conversation_id when the caller has no thread', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body).not.toHaveProperty('conversation_id')
    })

    // #1927.10 — l'état du fil repart vers le service IA sous `thread_state`, la
    // clé que `ChatRequest` DÉCLARE (pydantic avale une clé inconnue sans rien
    // dire). Absent ⇒ clé absente ⇒ corps byte-identique à celui d'avant.
    it('forwards the reloaded thread state as thread_state (#1927.10)', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      const threadState = {
        version: 1 as const,
        objects: [{ kind: 'account' as const, id: 'a-1', label: 'SNCF' }],
        focus: [],
        last_list: null,
        searches: [],
        proposals: [],
        questions: [],
        ruled_out: [],
        assumptions: [],
        // #2268.1 / #2268.5 / #2268.10
        goal: null,
        excluded: [],
        decisions: [],
        // #2268.12 / #2268.13 / #2268.15
        current_job: null,
        current_step: null,
        next_step: null,
        // #2268.7
        accepted: [],
        // #3178.1 / #3178.2
        persistent_scope: null,
        // #3187.4
        treated_entities: [],
        // #3191.3.12 (LAU-FINAL-197, épopée #3220)
        precautions: [],
        // #193.1
        facets: {},
        // #194.1 / #194.2
        correction: null,
        constraints: [],
        turns: 0,
        // #3223 (lot R17)
        last_account_verdict: null,
      }

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'et lui ?', threadState })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.thread_state).toEqual(threadState)
    })

    it('omits thread_state when the thread has none', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', threadState: null })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body).not.toHaveProperty('thread_state')
    })

    // #1928.2/.3/.5/.6 — les réglages de réponse voyagent DANS le sac
    // `user_preferences`, tels quels : le service IA les lit sous ces noms-là
    // (`app/prompts/reply_preferences.py`). Un renommage ou un filtrage ici les
    // ferait disparaître du prompt sans qu'aucun tour n'échoue.
    it('forwards the reply settings untouched inside user_preferences', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({
        userId: 'u-1',
        message: 'salut',
        userPreferences: { replyLength: 'short', replySources: 'detailed', tone: 'direct' },
      })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.user_preferences).toEqual({ replyLength: 'short', replySources: 'detailed', tone: 'direct' })
    })

    // #1962.8 — COMPATIBILITÉ DE DÉPLOIEMENT. L'API et le service IA ne partent
    // pas au même instant. Un service IA pas encore redéployé valide
    // `pinned_facts: list[str]` : y mettre des OBJETS ferait tomber en 422 CHAQUE
    // tour qui porte une mémoire. La forme historique reste donc des chaînes ; la
    // nature et l'origine voyagent sous une clé NEUVE, qu'un service ancien ignore.
    it('keeps pinned_facts as plain strings and sends nature/origin under pinned_memory', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      const pinnedFacts = [
        { fact: 'ALTEN a quitté le compte', kind: 'correction' as const, origin: 'manual' as const },
        { fact: 'Budget IT voté', kind: 'fact' as const, origin: 'copilot' as const },
      ]

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', pinnedFacts })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.pinned_facts).toEqual(['ALTEN a quitté le compte', 'Budget IT voté'])
      expect(body.pinned_memory).toEqual(pinnedFacts)
    })

    // #3892.1 (ADD-SANOFI-06) — l'étiquette de compte d'un fait épinglé
    // voyage sous une clé SNAKE_CASE (`account_name`), jamais sa forme
    // camelCase TS telle quelle — cohérent avec le reste de ce corps.
    it('sends accountName under account_name, and omits the key entirely when absent', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()
      const pinnedFacts = [
        { fact: "Délai d'accès : six semaines", kind: 'fact' as const, origin: 'manual' as const, accountName: 'BPCE' },
        { fact: 'Budget IT voté', kind: 'fact' as const, origin: 'manual' as const },
      ]

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', pinnedFacts })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.pinned_memory).toEqual([
        { fact: "Délai d'accès : six semaines", kind: 'fact', origin: 'manual', account_name: 'BPCE' },
        { fact: 'Budget IT voté', kind: 'fact', origin: 'manual' },
      ])
    })

    it('sends an empty pinned_facts and no pinned_memory when there is no memory', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.pinned_facts).toEqual([])
      expect(body).not.toHaveProperty('pinned_memory')
    })

    it('sends the same request body shape as the buffered chat() (single derivation)', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({
        userId: 'u-1',
        workspaceId: 'ws-1',
        message: 'salut',
        accountId: 'a-1',
      })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body).toMatchObject({ user_id: 'u-1', workspace_id: 'ws-1', message: 'salut', account_id: 'a-1' })
    })

    // #1954.7 — un document joint au chat ne sert qu'au FIL qui l'a déposé : le
    // service IA ne le lit que si on lui dit QUEL fil parle.
    it('#1954.7 — forwards the thread as conversation_id so the IA reads THIS thread’s attached documents', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))

      for await (const _ev of buildClient().chatStream({ userId: 'u-1', message: 'salut', conversationId: 'c-A' })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      expect(JSON.parse((init as RequestInit).body as string).conversation_id).toBe('c-A')
    })

    it('#1954.7 — omits conversation_id when no readable thread is given (key absent, never an empty string)', async () => {
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))

      for await (const _ev of buildClient().chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      expect('conversation_id' in JSON.parse((init as RequestInit).body as string)).toBe(false)
    })

    // #1960.20 — en marque blanche, Laura ne donne AUCUNE adresse Bellum. Le
    // service IA ne peut pas le savoir seul : la clé part, et seulement quand
    // c'est vrai (absente = marque du produit, corps byte-identique).
    it('#1960.20 — marks a white-label space, and omits the key for every other space', async () => {
      fetchMock
        .mockResolvedValueOnce(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
        .mockResolvedValueOnce(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', whiteLabel: true })) {
        // drain
      }
      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', whiteLabel: false })) {
        // drain
      }

      const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string))
      expect(bodies[0]).toMatchObject({ white_label: true })
      expect(bodies[1]).not.toHaveProperty('white_label')
    })

    it('#1919.15 — carries the person’s reply-feedback memory, and omits the key when there is none', async () => {
      // Clé omise quand vide : le service IA ne voit rien, le prompt reste
      // byte-identique — même discipline que `page_context`.
      const client = buildClient()
      const bodies: Array<Record<string, unknown>> = []
      for (const replyFeedback of ['- (2026-09-12) Ta réponse … jugée PAS PERTINENTE', '', null]) {
        fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
        for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut', replyFeedback })) {
          // drain
        }
        const [, init] = fetchMock.mock.calls.at(-1)!
        bodies.push(JSON.parse((init as RequestInit).body as string))
      }
      expect(bodies[0]?.['reply_feedback']).toContain('PAS PERTINENTE')
      expect(bodies[1]).not.toHaveProperty('reply_feedback')
      expect(bodies[2]).not.toHaveProperty('reply_feedback')
    })

    it('reads the cost header before the body is fully consumed (D19)', async () => {
      const response = sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }])
      Object.defineProperty(response, 'headers', {
        value: { get: (name: string) => (name === 'x-bellum-costs' ? 'anthropic:0.002' : null) },
      })
      fetchMock.mockResolvedValue(response)
      const client = buildClient()
      let seen: string | null = null

      for await (const _ev of client.chatStream(
        { userId: 'u-1', message: 'salut' },
        { responseHeaderName: 'x-bellum-costs', onResponseHeader: (_n, v) => (seen = v) },
      )) {
        // drain
      }

      expect(seen).toBe('anthropic:0.002')
    })

    it('applies a caller budget by construction, even when nobody passes a signal', async () => {
      // `maxAttempts`/`timeoutMs` existed on the old buffered `chat()` — they
      // have no meaning on `streamSse` (single attempt, no `timeoutMs`
      // option). The budget moved INTO `chatStream` itself as an
      // `AbortSignal.timeout`, so a caller that forgets it (like the old MCP
      // route once forgot `chat()`'s options) cannot end up unbounded.
      fetchMock.mockResolvedValue(sseResponse([{ type: 'done', success: true, data: { reply: 'ok' } }]))
      const client = buildClient()

      for await (const _ev of client.chatStream({ userId: 'u-1', message: 'salut' })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal)
    })

    it('never retries a chat stream (a half-consumed flux does not replay)', async () => {
      fetchMock.mockResolvedValue(makeResponse(500, 'Boom'))
      const client = buildClient()

      await expect(collect(client)).rejects.toBeInstanceOf(TechnicalError)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('converts AbortError from fetch into TechnicalError chain ending in HttpTimeoutError', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    fetchMock.mockRejectedValue(abortError)
    const client = buildClient()

    const err = await client
      .request({
        urlInfo: { template: '/phase/1/research', variables: {} },
        body: {},
        maxAttempts: 1,
      })
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(TechnicalError)
    const cause = (err as TechnicalError).cause
    expect(cause).toBeInstanceOf(HttpRetriesExhaustedError)
    expect((cause as HttpRetriesExhaustedError).cause).toBeInstanceOf(HttpTimeoutError)
  })

  // #2727 — « je tape un nom, je vois les homonymes, je choisis ».
  describe('employmentFreshness', () => {
    it('envoie l’identifiant et l’employeur de référence, et camelCase la lecture — sans nom, sans probabilité', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(200, {
          success: true,
          status: 'ok',
          state: 'left',
          organization: 'Nouvelle SA',
          left_on: '2026-09-30',
          credits: 1,
        }),
      )
      const result = await buildClient().employmentFreshness({ apolloId: 'p1', employerRef: 'Acme' })
      expect(result).toEqual({
        status: 'ok',
        state: 'left',
        organization: 'Nouvelle SA',
        leftOn: '2026-09-30',
        credits: 1,
      })
      const [, init] = fetchMock.mock.calls[0]!
      expect((init as RequestInit).body).toBe(
        JSON.stringify({ apollo_id: 'p1', linkedin_url: null, employer_ref: 'Acme' }),
      )
    })

    it('ne devine jamais : statut ou état absents ⇒ « unavailable » / « unknown »', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { success: true }))
      const result = await buildClient().employmentFreshness({ apolloId: 'p1', employerRef: 'Acme' })
      expect(result).toEqual({ status: 'unavailable', state: 'unknown', organization: null, leftOn: null, credits: 0 })
    })
  })

  describe('searchPeopleByName', () => {
    it('posts full_name/organization_name and camelCases each hit — never leaking the wire snake_case', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(200, {
          success: true,
          status: 'ok',
          hits: [
            {
              id: 'apollo-1',
              first_name: 'Marion',
              last_name: '',
              last_name_obfuscated: 'Sa***d',
              title: 'DRH',
              organization_name: 'Bedrock',
              city: 'Paris',
              country: 'France',
              has_email: true,
              has_phone: false,
            },
          ],
        }),
      )
      const client = buildClient()

      const result = await client.searchPeopleByName({ fullName: 'Marion Sagnard', organizationName: 'Bedrock' })

      expect(result).toEqual({
        status: 'ok',
        hits: [
          {
            id: 'apollo-1',
            firstName: 'Marion',
            lastNameObfuscated: 'Sa***d',
            title: 'DRH',
            organizationName: 'Bedrock',
            city: 'Paris',
            country: 'France',
            hasEmail: true,
            hasPhone: false,
          },
        ],
      })
      const [, init] = fetchMock.mock.calls[0]!
      expect((init as RequestInit).body).toBe(
        JSON.stringify({ full_name: 'Marion Sagnard', organization_name: 'Bedrock' }),
      )
    })

    it('omits organization_name when the caller searched by name alone', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { success: true, status: 'empty', hits: [] }))
      const client = buildClient()

      const result = await client.searchPeopleByName({ fullName: 'Personne Inconnue' })

      expect(result).toEqual({ status: 'empty', hits: [] })
      const [, init] = fetchMock.mock.calls[0]!
      expect((init as RequestInit).body).toBe(
        JSON.stringify({ full_name: 'Personne Inconnue', organization_name: null }),
      )
    })

    it('never guesses a status — an absent field falls back to "empty", not "ok"', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { success: true, hits: [] }))
      const client = buildClient()

      const result = await client.searchPeopleByName({ fullName: 'X' })

      expect(result.status).toBe('empty')
    })
  })

  // #4386 — la cascade multi-sources (Découvrir › Contacts › « Chercher une personne par nom »).
  describe('searchPersonByNameCascade', () => {
    it('posts cascade=true and carries last name, profile, families and the match in words', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(200, {
          success: true,
          status: 'ok',
          hits: [
            {
              id: 'web:linkedin.com/in/theo-haddad',
              first_name: 'Théo',
              last_name: 'Haddad',
              last_name_obfuscated: '',
              title: 'CEO',
              organization_name: 'BELLUM AI',
              linkedin_url: 'https://fr.linkedin.com/in/theo-haddad',
              city: '',
              country: '',
              has_email: false,
              has_phone: false,
              sources: ['legal_registry', 'web', 'not_a_family'],
              match: 'name_and_company',
            },
          ],
          sources_queried: [
            { family: 'contact_base', outcome: 'empty', count: 0 },
            { family: 'legal_registry', outcome: 'found', count: 1 },
            { family: 'web', outcome: 'found', count: 1 },
          ],
        }),
      )
      const client = buildClient()

      const result = await client.searchPersonByNameCascade({ fullName: 'Theo Haddad', organizationName: 'Bellum' })

      expect(result).toEqual({
        status: 'ok',
        hits: [
          {
            id: 'web:linkedin.com/in/theo-haddad',
            firstName: 'Théo',
            lastName: 'Haddad',
            lastNameObfuscated: '',
            title: 'CEO',
            organizationName: 'BELLUM AI',
            linkedinUrl: 'https://fr.linkedin.com/in/theo-haddad',
            city: '',
            country: '',
            hasEmail: false,
            hasPhone: false,
            // Une famille inconnue du contrat ne traverse pas : jamais un nom deviné à l'écran.
            sources: ['legal_registry', 'web'],
            match: 'name_and_company',
          },
        ],
        sourcesQueried: [
          { family: 'contact_base', outcome: 'empty', count: 0 },
          { family: 'legal_registry', outcome: 'found', count: 1 },
          { family: 'web', outcome: 'found', count: 1 },
        ],
      })
      const [, init] = fetchMock.mock.calls[0]!
      expect((init as RequestInit).body).toBe(
        JSON.stringify({ full_name: 'Theo Haddad', organization_name: 'Bellum', cascade: true }),
      )
    })

    it('an absent sources_queried is an empty list, never invented families', async () => {
      fetchMock.mockResolvedValue(makeResponse(200, { success: true, hits: [] }))
      const result = await buildClient().searchPersonByNameCascade({ fullName: 'X' })
      expect(result).toEqual({ status: 'empty', hits: [], sourcesQueried: [] })
    })
  })
})

describe('IaClient.analyzeGraph — market/country wire', () => {
  type StreamArg = { body: Record<string, unknown> }

  /** Spy on the (protected) SSE transport so we can assert the outbound body
   *  without a real stream. Yields nothing — analyzeGraph just drains it. */
  function stubStream(client: IaClient) {
    return (
      jest
        .spyOn(client as unknown as { streamSse: (args: StreamArg) => AsyncGenerator<unknown> }, 'streamSse')
        // eslint-disable-next-line require-yield
        .mockImplementation(async function* () {
          return
        })
    )
  }

  async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
    for await (const _event of gen) void _event
  }

  it('sends the country code in the graph body for a non-FR market', async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({ companyName: 'Nestlé', country: 'CH', profileData: {}, accountId: 'a', userId: 'u' }),
    )

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ country: 'CH' }) }))
  })

  // LUD.6 bis — un compte ouvert depuis Découvrir/Laura avec une zone : la requête IA la porte.
  it('LUD.6 bis — ouverture depuis BFC : la requête IA porte la zone (preferred_zone)', async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'Arquus',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        sellerHypotheses: {
          tier_label: null,
          selection_reason: null,
          addressable_issues: null,
          upcoming_it_projects: null,
          discover_origin_criteria: ['secteur : Défense', 'zone : Bourgogne-Franche-Comté'],
        },
      }),
    )

    expect(spy.mock.calls[0]![0].body).toMatchObject({ preferred_zone: ['Bourgogne-Franche-Comté'] })
  })

  it('LUD.6 bis — NON : sans zone d’ouverture, aucune clé preferred_zone (corps byte-identique, espace IT)', async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'Arquus',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        sellerHypotheses: {
          tier_label: null,
          selection_reason: null,
          addressable_issues: null,
          upcoming_it_projects: null,
          discover_origin_criteria: ['secteur : Défense'],
        },
      }),
    )
    await drain(client.analyzeGraph({ companyName: 'SNCF', profileData: {}, accountId: 'a', userId: 'u' }))

    expect(spy.mock.calls[0]![0].body).not.toHaveProperty('preferred_zone')
    expect(spy.mock.calls[1]![0].body).not.toHaveProperty('preferred_zone')
  })

  it('omits country entirely for the FR default (byte-identical French body)', async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(client.analyzeGraph({ companyName: 'SNCF', profileData: {}, accountId: 'a', userId: 'u' }))

    const { body } = spy.mock.calls[0]![0]
    expect(body).not.toHaveProperty('country')
    expect(body).toMatchObject({ company_name: 'SNCF', siren: null, scope_mode: null })
  })

  // #4070 — les faits du compte (socle #4069) voyagent jusqu'à l'IA. Le wire n'a AUCUN champ de
  // provenance ni de poids : `kind`, `label`, `date`, `age_days` — et rien d'autre ne sort.
  it('#4070 — envoie les faits du compte, les interlocuteurs connus, l’analyse précédente, les motifs de perte', async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'SNCF',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
        knownContacts: [{ name: 'Claire Martin', role: 'DSI', relation: 'crm', lastSeen: null }],
        previousAnalysis: 'Analyse du 2026-06-18',
        lostDealRex: 'Perte du 2024-06-01 — motif déclaré : prix.',
      }),
    )

    const { body } = spy.mock.calls[0]![0]
    expect(body).toMatchObject({
      account_facts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', age_days: 863 }],
      known_contacts: [{ name: 'Claire Martin', role: 'DSI', relation: 'crm', last_seen: null }],
      previous_analysis: 'Analyse du 2026-06-18',
      lost_deal_rex: 'Perte du 2024-06-01 — motif déclaré : prix.',
    })
    const fact = (body.account_facts as Array<Record<string, unknown>>)[0]!
    expect(Object.keys(fact).sort()).toEqual(['age_days', 'date', 'kind', 'label'])
  })

  it('#4070 — NON : sans intrant, aucune des quatre clés (corps byte-identique)', async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'SNCF',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        accountFacts: [],
        knownContacts: [],
      }),
    )

    const { body } = spy.mock.calls[0]![0]
    for (const key of ['account_facts', 'known_contacts', 'previous_analysis', 'lost_deal_rex']) {
      expect(body).not.toHaveProperty(key)
    }
  })

  // #2451.1 — le mode de contexte du dossier voyage jusqu'au plan ; absent en
  // « Mon activité », le corps reste byte-identique.
  it('envoie context_mode seulement quand le dossier a un mode, jamais sinon', async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'SNCF',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        contextMode: 'neutral',
      }),
    )
    await drain(client.analyzeGraph({ companyName: 'SNCF', profileData: {}, accountId: 'a', userId: 'u' }))

    expect(spy.mock.calls[0]![0].body).toMatchObject({ context_mode: 'neutral' })
    expect(spy.mock.calls[1]![0].body).not.toHaveProperty('context_mode')
  })

  it("envoie la mémoire du graphe d'organigramme quand le compte a déjà été corrigé", async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'TF1',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        orgGraphVersion: 3,
        orgRejectedItems: [{ sourceId: 'p-jean-dupont', reason: 'signalé parti' }],
      }),
    )

    const { body } = spy.mock.calls[0]![0]
    expect(body).toMatchObject({
      org_graph_version: 3,
      org_rejected_items: [{ sourceId: 'p-jean-dupont', reason: 'signalé parti' }],
    })
  })

  it('omet la mémoire du graphe à ses valeurs neutres (compte jamais corrigé → wire inchangé)', async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'TF1',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        orgGraphVersion: 1,
        orgRejectedItems: [],
      }),
    )

    const { body } = spy.mock.calls[0]![0]
    expect(body).not.toHaveProperty('org_graph_version')
    expect(body).not.toHaveProperty('org_rejected_items')
  })

  // #1631.3/.4, #1606.2 (lot 14) — l'axe CHEMIN : AUCUN appelant ne
  // transmettait ce compte à l'IA, l'axe restait non mesuré en production.
  it("envoie l'axe chemin (compte de parcours + ESN dominante) quand la mémoire marché l'a résolu", async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'BNP Paribas',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        marketPathsObserved: 9,
        marketTopEsn: 'ALTEN',
      }),
    )

    const { body } = spy.mock.calls[0]![0]
    expect(body).toMatchObject({ market_paths_observed: 9, market_top_esn: 'ALTEN' })
  })

  it("omet l'axe chemin sans couverture — wire byte-identique pour un compte que la mémoire marché n'a pas encore vu", async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(client.analyzeGraph({ companyName: 'Société Inconnue', profileData: {}, accountId: 'a', userId: 'u' }))

    const { body } = spy.mock.calls[0]![0]
    expect(body).not.toHaveProperty('market_paths_observed')
    expect(body).not.toHaveProperty('market_top_esn')
  })

  it("envoie le compte de parcours SANS nom d'ESN — l'axe reste vrai en désignant « des sociétés partenaires »", async () => {
    const client = buildClient()
    const spy = stubStream(client)

    await drain(
      client.analyzeGraph({
        companyName: 'BNP Paribas',
        profileData: {},
        accountId: 'a',
        userId: 'u',
        marketPathsObserved: 4,
      }),
    )

    const { body } = spy.mock.calls[0]![0]
    expect(body).toMatchObject({ market_paths_observed: 4 })
    expect(body).not.toHaveProperty('market_top_esn')
  })
})
