import type { ConfigService } from '@nestjs/config'
import { HttpException, Logger } from '@nestjs/common'
import { HttpError, HttpTimeoutError, TechnicalError } from '@bellum/errors'
import type { DiscoverCandidate, DiscoverResponse } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ChatContextService } from './chat-context.service'
import type { ChatMessagesService } from './chat-messages.service'
import type { ChatThreadDocumentsService } from './chat-thread-documents.service'
import type { DiscoverPortfolioService } from './discover-portfolio.service'
import { IaProxyController } from './ia-proxy.controller'
import type { DiscoverRegistryDto, DiscoverSignalsDto } from './dto/ia-proxy.dto'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'

/**
 * Découvrir v2 côté API (`agent_docs/discover-v2-contract.md`). Le proxy a trois
 * responsabilités, toutes vérifiées ici :
 *
 *  1. **résoudre le profil ESN server-side** — le front n'envoie que des
 *     critères, jamais un profil (sinon « personnalisé » est un mensonge) ;
 *  2. **résoudre l'état portefeuille** — la seule chose que l'IA ne peut pas
 *     savoir, et ce qui évite de reproposer un compte déjà détenu ;
 *  3. **ne pas retenter** — registre + une passe Claude : un retry triple la
 *     dépense LLM pour rien.
 *
 * Et il ne doit JAMAIS avaler `degraded[]` : une source HS doit remonter
 * jusqu'à l'écran.
 */
describe('IaProxyController — Découvrir v2', () => {
  const user = { userId: 'u-1' } as CurrentUserPayload
  const PROFILE = { companyName: 'MonESN', sectors: ['Banque'] }

  const candidate = (siren: string, overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate =>
    ({
      name: 'ACME',
      siren,
      nafCode: '62.02A',
      sector: 'Conseil informatique',
      city: 'Lyon',
      department: '69',
      headcountRange: '100 à 199 salariés',
      creationDate: '2005-03-14',
      score: 62,
      scoreFactors: [{ label: 'NAF 62.02A exact', points: 30, evidence: 'code NAF registre 62.02A' }],
      signals: [],
      angle: null,
      suggestedRoles: [],
      portfolioState: 'new',
      accountId: null,
      sources: [{ name: 'pappers', fetchedAt: '2026-07-19T10:00:00Z' }],
      ...overrides,
    }) as DiscoverCandidate

  function build(
    response: DiscoverResponse,
    workspaceDefault: 'my_activity' | 'one_off_mission' | 'neutral' = 'my_activity',
  ) {
    const ia = {
      discoverRegistry: jest.fn().mockResolvedValue(response),
      discoverSignals: jest.fn().mockResolvedValue(response),
    } as unknown as jest.Mocked<Pick<IaClient, 'discoverRegistry' | 'discoverSignals'>>
    const esnProfile = {
      resolveProfileData: jest.fn().mockResolvedValue(PROFILE),
    } as unknown as jest.Mocked<Pick<EsnProfileReader, 'resolveProfileData'>>
    const portfolio = {
      resolve: jest.fn().mockResolvedValue(response.candidates.map(() => ({ portfolioState: 'new', accountId: null }))),
      // #2166.11 — no-op par défaut (aucune référence comparable) : chaque test
      // qui veut vérifier le câblage la fait mentir explicitement.
      resolveSimilarityHeadlines: jest.fn().mockResolvedValue(response.candidates.map(() => undefined)),
      // #3819.1 — no-op par défaut (aucun besoin connu) — même règle.
      resolveKnownNeeds: jest.fn().mockResolvedValue(response.candidates.map(() => undefined)),
      // #4068 — no-op par défaut (aucun besoin connu à montrer) — même règle.
      resolveKnownNeedFacts: jest.fn().mockResolvedValue(response.candidates.map(() => undefined)),
    } as unknown as jest.Mocked<
      Pick<
        DiscoverPortfolioService,
        'resolve' | 'resolveSimilarityHeadlines' | 'resolveKnownNeeds' | 'resolveKnownNeedFacts'
      >
    >
    const controller = new IaProxyController(
      ia as unknown as IaClient,
      {} as unknown as ChatMessagesService,
      { isDemoWorkspace: jest.fn().mockResolvedValue(false) } as unknown as WorkspaceContextService,
      esnProfile as unknown as EsnProfileReader,
      {} as unknown as ChatContextService,
      portfolio as unknown as DiscoverPortfolioService,
      { get: () => 0 } as unknown as ConfigService,
      { list: jest.fn().mockResolvedValue([]) } as unknown as ToolRegistryService,
      {} as ChatThreadDocumentsService,
    )
    // #2165.28 / #2165.30 — `discoverMarketMemory` est le tout DERNIER paramètre
    // `@Optional()` du contrôleur (30e position) : l'affecter par position
    // décalerait toutes les suites qui construisent ce contrôleur avant lui.
    // Cette assignation directe (le champ est `private readonly` en TypeScript
    // seulement, pas au runtime) est le même patron que
    // `ia-proxy.controller.spec.ts:618`. Par défaut : identité, aucun candidat
    // écarté — ce que le service neuf fait déjà en no-op.
    const discoverMarketMemory = {
      applyFilters: jest.fn().mockImplementation(async (candidates: unknown[]) => ({ candidates, degraded: [] })),
      annotateObservedStacks: jest.fn().mockImplementation(async (candidates: unknown[]) => candidates),
    }
    ;(controller as unknown as { discoverMarketMemory: unknown }).discoverMarketMemory = discoverMarketMemory
    ;(controller as unknown as { lauraMode: unknown }).lauraMode = {
      resolveForUser: jest.fn().mockResolvedValue(workspaceDefault),
    }
    return { ia, esnProfile, portfolio, discoverMarketMemory, controller }
  }

  const empty: DiscoverResponse = { candidates: [], query: {}, degraded: [] }

  // ── Profil résolu server-side ─────────────────────────────────────────────

  it('resolves the ESN profile server-side and forwards the structured filters', async () => {
    const { ia, esnProfile, controller } = build(empty)
    await controller.discoverRegistry(user, {
      filters: { nafCode: '62.02A', department: '69' },
      limit: 20,
    } as DiscoverRegistryDto)

    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1')
    expect(ia.discoverRegistry).toHaveBeenCalledWith(
      // #4419.7 — l'appelant voyage jusqu'au moteur, qui relit l'identité dans SON espace.
      { filters: { nafCode: '62.02A', department: '69' }, limit: 20, profileData: PROFILE, userId: 'u-1' },
      expect.anything(),
    )
  })

  // #4433 — « revenir au strict » voyage jusqu'au moteur ; absent, l'élargissement par paliers reste permis.
  it('#4433 transmet `strictCriteria` au moteur, et seulement quand le geste l’a posé', async () => {
    const { ia, controller } = build(empty)
    await controller.discoverRegistry(user, { filters: {}, strictCriteria: true } as DiscoverRegistryDto)
    expect(ia.discoverRegistry).toHaveBeenLastCalledWith(
      expect.objectContaining({ strictCriteria: true }),
      expect.anything(),
    )
    await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)
    expect(ia.discoverRegistry.mock.calls.at(-1)?.[0]).not.toHaveProperty('strictCriteria', true)
  })

  // #4433 — craft rule n°9 : en salle, « React » s'élargit au voisin fictif, étiqueté ; strict, il ne s'élargit pas.
  it('#4433 démo : la recherche par compétence s’élargit en salle, et « revenir au strict » le retire', async () => {
    const { ia, controller } = build(empty)
    ;(controller as unknown as { workspaceContext: Record<string, unknown> }).workspaceContext.isDemoWorkspace = jest
      .fn()
      .mockResolvedValue(true)
    const widened = await controller.discoverRegistry(user, { filters: { keywords: ['React'] } } as DiscoverRegistryDto)
    expect(widened.candidates.some(c => c.widenedBy?.code === 'javascript')).toBe(true)
    expect(widened.query.widening).toBeDefined()
    const strict = await controller.discoverRegistry(user, {
      filters: { keywords: ['React'] },
      strictCriteria: true,
    } as DiscoverRegistryDto)
    expect(strict.candidates.some(c => c.widenedBy)).toBe(false)
    expect(ia.discoverRegistry).not.toHaveBeenCalled()
  })

  // #4067 (reste) — l'IA reçoit les SIREN que l'espace connaît, pour ne pas les couper à `limit`.
  it('transmet à l’IA les SIREN dont l’espace détient un fait (jamais un champ du client)', async () => {
    const { ia, controller } = build(empty)
    const spaceFactSirens = jest.fn().mockResolvedValue(['552081317'])
    ;(controller as unknown as { workspaceContext: Record<string, unknown> }).workspaceContext.resolveActiveWorkspace =
      jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    // #4792 — la lecture des SIREN résout le périmètre de BU (fail-closed) et lit aussi la base.
    ;(controller as unknown as { businessUnits: unknown }).businessUnits = {
      scopeFor: jest.fn().mockResolvedValue(null),
    }
    ;(controller as unknown as { discoverSources: unknown }).discoverSources = {
      spaceFactSirens,
      baseAccountSirens: jest.fn().mockResolvedValue([]),
      collect: jest.fn().mockResolvedValue([]),
    }
    await controller.discoverRegistry(user, { filters: {}, limit: 20 } as DiscoverRegistryDto)
    expect(spaceFactSirens).toHaveBeenCalledWith(expect.any(String), expect.any(Number))
    expect(ia.discoverRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ spaceSirens: ['552081317'] }),
      expect.anything(),
    )
  })

  // #4793.1 (Louis 31/10) — la base COMMUNE fabrique des candidats, transmis au moteur.
  it('#4793.1 transmet à l’IA les candidats de la base commune, lus sans aucun espace', async () => {
    const { ia, controller } = build(empty)
    const commonBaseCandidates = jest
      .fn()
      .mockResolvedValue([{ siren: '700000001', name: 'BASE', observedNeed: { label: 'Java', date: '2025-03-12' } }])
    ;(controller as unknown as { discoverSources: unknown }).discoverSources = {
      spaceFactSirens: jest.fn().mockResolvedValue([]),
      baseAccountSirens: jest.fn().mockResolvedValue([]),
      commonBaseCandidates,
      collect: jest.fn().mockResolvedValue([]),
    }
    await controller.discoverRegistry(user, { filters: { keywords: ['Java'] }, limit: 100 } as DiscoverRegistryDto)
    // La borne est le volume demandé ; la lecture ne reçoit que les critères — ni l'utilisateur, ni l'espace.
    expect(commonBaseCandidates).toHaveBeenCalledWith({ keywords: ['Java'] }, 100)
    expect(ia.discoverRegistry).toHaveBeenCalledWith(
      expect.objectContaining({
        commonBaseCandidates: [
          { siren: '700000001', name: 'BASE', observedNeed: { label: 'Java', date: '2025-03-12' } },
        ],
      }),
      expect.anything(),
    )
  })

  // #4791.3 — DROITS : l'espace B lance la même recherche que l'espace A → rien du CRM / portefeuille de A.
  it('#4791.3 espace B, même recherche : aucun compte ni champ issu de l’espace A', async () => {
    const { ia, controller } = build(empty)
    const byUser: Record<string, string> = { 'u-a': 'ws-a', 'u-b': 'ws-b' }
    ;(controller as unknown as { workspaceContext: Record<string, unknown> }).workspaceContext.resolveActiveWorkspace =
      jest.fn(async (userId: string) => ({ workspaceId: byUser[userId] }))
    ;(controller as unknown as { businessUnits: unknown }).businessUnits = {
      scopeFor: jest.fn().mockResolvedValue(null),
    }
    const common = [{ siren: '700000001', name: 'BASE COMMUNE' }]
    ;(controller as unknown as { discoverSources: unknown }).discoverSources = {
      // Le CRM / les faits de l'espace A ne sont lus que POUR l'espace A.
      spaceFactSirens: jest.fn(async (workspaceId: string) => (workspaceId === 'ws-a' ? ['552081317'] : [])),
      baseAccountSirens: jest.fn(async (workspaceId: string) => (workspaceId === 'ws-a' ? ['443061841'] : [])),
      commonBaseCandidates: jest.fn().mockResolvedValue(common),
      collect: jest.fn().mockResolvedValue([]),
    }
    const dto = { filters: { keywords: ['Java'], city: 'Lille' }, limit: 25 } as DiscoverRegistryDto
    await controller.discoverRegistry({ ...user, userId: 'u-a' }, dto)
    await controller.discoverRegistry({ ...user, userId: 'u-b' }, dto)
    const [sentA, sentB] = ia.discoverRegistry.mock.calls.map(call => call[0] as Record<string, unknown>)
    expect(sentA.spaceSirens).toEqual(expect.arrayContaining(['552081317', '443061841']))
    // B reçoit la MÊME base commune, et rien de A : ni SIREN protégé, ni espace, ni champ de portefeuille.
    expect(sentB).not.toHaveProperty('spaceSirens')
    expect(sentB.commonBaseCandidates).toEqual(common)
    expect(sentB.spaceKey).toBe('ws-b')
    expect(JSON.stringify(sentB)).not.toMatch(/ws-a|552081317|443061841/)
  })

  // #4430 (Louis 21/10) — l'espace actif est le seul sésame des offres FRAÎCHES (plafond quotidien par espace).
  it('#4430 transmet à l’IA l’espace actif (jamais un champ du client)', async () => {
    const { ia, controller } = build(empty)
    ;(controller as unknown as { workspaceContext: Record<string, unknown> }).workspaceContext.resolveActiveWorkspace =
      jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    await controller.discoverRegistry(user, { filters: {}, limit: 20, spaceKey: 'ws-pirate' } as DiscoverRegistryDto)
    expect(ia.discoverRegistry).toHaveBeenCalledWith(expect.objectContaining({ spaceKey: 'ws-1' }), expect.anything())
  })

  it('#4430 sans espace résolu, aucun spaceKey ne part (l’IA reste au cache seul)', async () => {
    const { ia, controller } = build(empty)
    ;(controller as unknown as { workspaceContext: Record<string, unknown> }).workspaceContext.resolveActiveWorkspace =
      jest.fn().mockRejectedValue(new Error('db down'))
    await controller.discoverRegistry(user, { filters: {}, limit: 20 } as DiscoverRegistryDto)
    const sent = ia.discoverRegistry.mock.calls[0][0] as Record<string, unknown>
    expect(sent).not.toHaveProperty('spaceKey')
  })

  it('#4067 mode Signaux : l’IA reçoit aussi les SIREN de l’espace', async () => {
    const { ia, controller } = build(empty)
    ;(controller as unknown as { workspaceContext: Record<string, unknown> }).workspaceContext.resolveActiveWorkspace =
      jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    ;(controller as unknown as { businessUnits: unknown }).businessUnits = {
      scopeFor: jest.fn().mockResolvedValue(null),
    }
    ;(controller as unknown as { discoverSources: unknown }).discoverSources = {
      spaceFactSirens: jest.fn().mockResolvedValue(['552081317']),
      baseAccountSirens: jest.fn().mockResolvedValue([]),
      collect: jest.fn().mockResolvedValue([]),
    }
    await controller.discoverSignals(user, { sinceDays: 30, limit: 20 } as DiscoverSignalsDto)
    expect(ia.discoverSignals).toHaveBeenCalledWith(
      expect.objectContaining({ spaceSirens: ['552081317'] }),
      expect.anything(),
    )
  })

  it('une lecture d’espace en échec n’empêche pas Découvrir (aucun spaceSirens)', async () => {
    const { ia, controller } = build(empty)
    ;(controller as unknown as { workspaceContext: Record<string, unknown> }).workspaceContext.resolveActiveWorkspace =
      jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    ;(controller as unknown as { discoverSources: unknown }).discoverSources = {
      spaceFactSirens: jest.fn().mockRejectedValue(new Error('db down')),
      collect: jest.fn().mockResolvedValue([]),
    }
    await controller.discoverRegistry(user, { filters: {}, limit: 20 } as DiscoverRegistryDto)
    const sent = ia.discoverRegistry.mock.calls[0][0] as Record<string, unknown>
    expect(sent).not.toHaveProperty('spaceSirens')
  })

  // #2454.10 — « Neutre » : le profil habituel est IGNORÉ, jamais réinjecté en
  // silence. Le profil n'est même pas lu : rien à oublier de retirer ensuite.
  it('contextMode « neutral » : aucun profil ne part vers le moteur (registre)', async () => {
    const { ia, esnProfile, controller } = build(empty)
    await controller.discoverRegistry(user, {
      filters: { nafCode: '62.02A' },
      limit: 20,
      contextMode: 'neutral',
    } as DiscoverRegistryDto)
    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    expect(ia.discoverRegistry).toHaveBeenCalledWith(
      { filters: { nafCode: '62.02A' }, limit: 20, profileData: {}, userId: 'u-1' },
      expect.anything(),
    )
  })

  it('contextMode « neutral » : aucun profil, et le mode ne voyage pas comme un filtre (signaux)', async () => {
    const { ia, esnProfile, controller } = build(empty)
    await controller.discoverSignals(user, { sinceDays: 30, contextMode: 'neutral' } as DiscoverSignalsDto)
    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    expect(ia.discoverSignals).toHaveBeenCalledWith(
      { filters: { sinceDays: 30 }, profileData: {}, declaredPartnerSirens: [] },
      expect.anything(),
    )
  })

  // #3551 — le bouton « hors de ma cible » voyage en mode Signaux, mais le moteur réel
  // (aucun filtre de cible côté signaux) ne reçoit jamais ce réglage comme un critère.
  it('#3551 includeOutOfTarget ne voyage pas comme un filtre vers le moteur de signaux', async () => {
    const { ia, controller } = build(empty)
    await controller.discoverSignals(user, { sinceDays: 30, includeOutOfTarget: true } as DiscoverSignalsDto)
    expect(ia.discoverSignals).toHaveBeenCalledWith(
      { filters: { sinceDays: 30 }, profileData: PROFILE, declaredPartnerSirens: [] },
      expect.anything(),
    )
  })

  // #2451.1 — Découvrir lit le mode côté serveur ; un appel SANS mode prend le
  // défaut de l'espace. Chaque mode dit NON à sa manière.
  it("sans mode dans l'appel, défaut d'espace « Neutre » : le profil n'est pas lu", async () => {
    const { ia, esnProfile, controller } = build(empty, 'neutral')
    await controller.discoverSignals(user, { sinceDays: 30 } as DiscoverSignalsDto)
    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    expect(ia.discoverSignals).toHaveBeenCalledWith(
      { filters: { sinceDays: 30 }, profileData: {}, declaredPartnerSirens: [] },
      expect.anything(),
    )
  })

  it('contextMode « one_off_mission » : le profil habituel est écarté (registre)', async () => {
    const { ia, esnProfile, controller } = build(empty)
    await controller.discoverRegistry(user, {
      filters: { nafCode: '62.02A' },
      limit: 20,
      contextMode: 'one_off_mission',
    } as DiscoverRegistryDto)
    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    expect(ia.discoverRegistry).toHaveBeenCalledWith(
      { filters: { nafCode: '62.02A' }, limit: 20, profileData: {}, userId: 'u-1' },
      expect.anything(),
    )
  })

  it("un mode explicite « Mon activité » gagne sur un défaut d'espace « Neutre »", async () => {
    const { ia, controller } = build(empty, 'neutral')
    await controller.discoverSignals(user, { sinceDays: 30, contextMode: 'my_activity' } as DiscoverSignalsDto)
    expect(ia.discoverSignals).toHaveBeenCalledWith(
      { filters: { sinceDays: 30 }, profileData: PROFILE, declaredPartnerSirens: [] },
      expect.anything(),
    )
  })

  it('contextMode « my_activity » : le profil résolu part, comme avant', async () => {
    const { ia, controller } = build(empty)
    await controller.discoverSignals(user, { sinceDays: 30, contextMode: 'my_activity' } as DiscoverSignalsDto)
    expect(ia.discoverSignals).toHaveBeenCalledWith(
      { filters: { sinceDays: 30 }, profileData: PROFILE, declaredPartnerSirens: [] },
      expect.anything(),
    )
  })

  it('never retries — registry + one Claude pass, a retry triples the LLM spend', async () => {
    const { ia, controller } = build(empty)
    await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)
    // #4517.2 (Louis 31/10) — couperet ~60 s au-dessus du budget IA de ~55 s, toujours UN seul essai.
    expect(ia.discoverRegistry).toHaveBeenCalledWith(expect.anything(), { maxAttempts: 1, timeoutMs: 60_000 })
  })

  it('tolerates a request with no filters at all', async () => {
    const { ia, controller } = build(empty)
    await controller.discoverRegistry(user, {} as DiscoverRegistryDto)
    expect(ia.discoverRegistry).toHaveBeenCalledWith(expect.objectContaining({ filters: {} }), expect.anything())
  })

  // ── État portefeuille ─────────────────────────────────────────────────────

  it('stamps each candidate with its portfolio state, resolved from the caller accounts', async () => {
    const response: DiscoverResponse = {
      candidates: [candidate('552081317'), candidate('444556677')],
      query: {},
      degraded: [],
    }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([
      { portfolioState: 'customer', accountId: 'acc-1' },
      { portfolioState: 'new', accountId: null },
    ])

    const result = await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

    expect(portfolio.resolve).toHaveBeenCalledWith('u-1', response.candidates)
    expect(result.candidates[0]).toMatchObject({ portfolioState: 'customer', accountId: 'acc-1' })
    expect(result.candidates[1]).toMatchObject({ portfolioState: 'new', accountId: null })
  })

  it('keeps the registry facts and the computed score untouched while stamping', async () => {
    // The proxy enriches, it does not rewrite: the score stays the IA's
    // deterministic one and the SIREN stays the registry's.
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'watched', accountId: 'acc-9' }])

    const [result] = (await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)).candidates

    expect(result.siren).toBe('552081317')
    expect(result.score).toBe(62)
    expect(result.scoreFactors).toHaveLength(1)
    expect(result.portfolioState).toBe('watched')
  })

  // ── #2166.11 (épopée #2806) — référence comparable ──────────────────────────

  it('appelle resolveSimilarityHeadlines APRÈS resolve, avec les candidats déjà tranchés portfolioState', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'new', accountId: null }])

    await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

    expect(portfolio.resolveSimilarityHeadlines).toHaveBeenCalledWith(
      'u-1',
      expect.arrayContaining([expect.objectContaining({ siren: '552081317', portfolioState: 'new' })]),
    )
  })

  it('pose similarityHeadline sur le candidat que le service a apparié', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'new', accountId: null }])
    portfolio.resolveSimilarityHeadlines.mockResolvedValue([{ kind: 'sector', referenceAccount: 'Decathlon' }])

    const [result] = (await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)).candidates

    expect(result.similarityHeadline).toEqual({ kind: 'sector', referenceAccount: 'Decathlon' })
  })

  it("ne pose aucune clé similarityHeadline quand rien n'a été apparié — jamais deviné", async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'new', accountId: null }])
    portfolio.resolveSimilarityHeadlines.mockResolvedValue([undefined])

    const [result] = (await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)).candidates

    expect(result).not.toHaveProperty('similarityHeadline')
  })

  it('câble aussi /discover/signals', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'new', accountId: null }])
    portfolio.resolveSimilarityHeadlines.mockResolvedValue([{ kind: 'sector', referenceAccount: 'Decathlon' }])

    const [result] = (await controller.discoverSignals(user, { sinceDays: 30 } as DiscoverSignalsDto)).candidates

    expect(result.similarityHeadline).toEqual({ kind: 'sector', referenceAccount: 'Decathlon' })
  })

  // #3819.1 — « besoins connus ».
  it('pose knownNeedsCount sur le candidat qu’un compte possédé porte, APRÈS la résolution portefeuille', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'customer', accountId: 'acc-1' }])
    portfolio.resolveKnownNeeds.mockResolvedValue([3])

    const [result] = (await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)).candidates

    expect(result.knownNeedsCount).toBe(3)
    expect(portfolio.resolveKnownNeeds).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ accountId: 'acc-1' })]),
    )
  })

  it('ne pose aucune clé knownNeedsCount pour un candidat neuf — jamais un 0 deviné', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'new', accountId: null }])
    portfolio.resolveKnownNeeds.mockResolvedValue([undefined])

    const [result] = (await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)).candidates

    expect(result).not.toHaveProperty('knownNeedsCount')
  })

  it('#4068 — pose aussi les besoins connus EUX-MÊMES (la carte en montre au moins un), jamais une liste devinée', async () => {
    const response: DiscoverResponse = {
      candidates: [candidate('552081317'), candidate('552081318')],
      query: {},
      degraded: [],
    }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([
      { portfolioState: 'customer', accountId: 'acc-1' },
      { portfolioState: 'new', accountId: null },
    ])
    portfolio.resolveKnownNeeds.mockResolvedValue([1, undefined])
    portfolio.resolveKnownNeedFacts.mockResolvedValue([[{ label: 'Refonte du MES', date: '2026-09-01' }], undefined])

    const [owned, fresh] = (await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)).candidates

    expect(owned?.knownNeeds).toEqual([{ label: 'Refonte du MES', date: '2026-09-01' }])
    expect(fresh).not.toHaveProperty('knownNeeds')
  })

  it('câble aussi knownNeedsCount sur /discover/signals', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'customer', accountId: 'acc-1' }])
    portfolio.resolveKnownNeeds.mockResolvedValue([0])

    const [result] = (await controller.discoverSignals(user, { sinceDays: 30 } as DiscoverSignalsDto)).candidates

    expect(result.knownNeedsCount).toBe(0)
  })

  // ── degraded[] jamais avalé ───────────────────────────────────────────────

  it('surfaces degraded sources untouched — a dead source is said, never masked', async () => {
    const degraded = [{ source: 'pappers', reason: 'missing_api_key' }]
    const { controller } = build({ candidates: [], query: { department: '69' }, degraded })

    const result = await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

    expect(result.degraded).toEqual(degraded)
    expect(result.candidates).toEqual([])
    expect(result.query).toEqual({ department: '69' })
  })

  // #4361.2 — « Exclure les sociétés cotées » : le critère part tel quel au moteur, et le compteur
  // (retirées / cotation non établie) revient jusqu'à l'écran, jamais avalé par le proxy.
  it('#4361.2 — transmet excludeListed au moteur et rend son compteur listingFilter intact', async () => {
    const listingFilter = { applied: true, excludedCount: 2, unknownCount: 9, sourceAvailable: true }
    const { ia, controller } = build({ candidates: [], query: {}, degraded: [], listingFilter })

    const result = await controller.discoverRegistry(user, {
      filters: { headcountMin: 250, headcountMax: 4999, excludeListed: true },
    } as DiscoverRegistryDto)

    expect(ia.discoverRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { headcountMin: 250, headcountMax: 4999, excludeListed: true } }),
      expect.anything(),
    )
    expect(result.listingFilter).toEqual(listingFilter)
  })

  it('does not invent candidates when the IA returns none', async () => {
    const { controller } = build({ candidates: [], query: {}, degraded: [{ source: 'claude', reason: '529' }] })
    const result = await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)
    expect(result.candidates).toHaveLength(0)
  })

  // ── /discover/signals ─────────────────────────────────────────────────────

  // ⚠️ Ce test passe le DTO DIRECTEMENT au contrôleur : il ne traverse donc pas
  // le pipe zod, et il ne peut PAS voir un champ retiré par le schéma. C'est
  // exactement ce qui s'est produit — `sources`, `keywords` et `sectors`
  // n'étaient pas déclarés à `discoverSignalsRequestSchema`, le pipe les
  // retirait, et ce test restait vert en transmettant un `signalTypes` que
  // personne n'envoie. La garde qui MORD vit là où le schéma vit :
  // `packages/contracts/src/schemas/discover-signals-request.test.ts`.
  it('proxies the signals route with the same profile + no-retry discipline', async () => {
    const { ia, esnProfile, controller } = build(empty)
    const dto = {
      sources: ['tender'],
      keywords: 'java',
      sectors: ['industry'],
      department: '69',
      sinceDays: 180,
    } as unknown as DiscoverSignalsDto

    await controller.discoverSignals(user, dto)

    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1')
    expect(ia.discoverSignals).toHaveBeenCalledWith(
      { filters: dto, profileData: PROFILE, declaredPartnerSirens: [] },
      // #4796 — UN run long : 90 s de moisson + 25 s de résolution côté IA, 125 s ici (et non 45 s).
      { maxAttempts: 1, timeoutMs: 125_000 },
    )
  })

  // #3757 (reste) — les SIREN déclarés partenaires par l'espace actif partent
  // vers l'IA, pour que Découvrir nomme un fait plutôt qu'une hypothèse NAF.
  it('#3757 (reste) forwards the workspace’s declared partner SIRENs', async () => {
    const { ia, controller } = build(empty)
    const partnerPipeline = { declaredSirens: jest.fn().mockResolvedValue(['326820065']) }
    const workspaceContext = {
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    }
    // Même patron que `discoverMarketMemory`/`lauraMode` ci-dessus : affectation
    // directe, le champ n'est `private readonly` qu'au typage.
    ;(controller as unknown as { partnerPipeline: unknown }).partnerPipeline = partnerPipeline
    ;(controller as unknown as { workspaceContext: unknown }).workspaceContext = workspaceContext

    await controller.discoverSignals(user, { sinceDays: 30 } as DiscoverSignalsDto)

    expect(partnerPipeline.declaredSirens).toHaveBeenCalledWith('ws-1')
    expect(ia.discoverSignals).toHaveBeenCalledWith(
      { filters: { sinceDays: 30 }, profileData: PROFILE, declaredPartnerSirens: ['326820065'] },
      expect.anything(),
    )
  })

  it('#3757 (reste) une lecture des SIREN déclarés en échec ne bloque pas la recherche', async () => {
    const { ia, controller } = build(empty)
    const partnerPipeline = { declaredSirens: jest.fn().mockRejectedValue(new Error('db down')) }
    const workspaceContext = {
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    }
    ;(controller as unknown as { partnerPipeline: unknown }).partnerPipeline = partnerPipeline
    ;(controller as unknown as { workspaceContext: unknown }).workspaceContext = workspaceContext
    ;(controller as unknown as { logger: unknown }).logger = { warn: jest.fn(), error: jest.fn() }

    await controller.discoverSignals(user, { sinceDays: 30 } as DiscoverSignalsDto)

    expect(ia.discoverSignals).toHaveBeenCalledWith(
      { filters: { sinceDays: 30 }, profileData: PROFILE, declaredPartnerSirens: [] },
      expect.anything(),
    )
  })

  it('stamps portfolio state on signal-sourced candidates too', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { portfolio, controller } = build(response)
    portfolio.resolve.mockResolvedValue([{ portfolioState: 'analyzed', accountId: 'acc-3' }])

    const result = await controller.discoverSignals(user, {} as DiscoverSignalsDto)

    expect(result.candidates[0].portfolioState).toBe('analyzed')
    expect(result.candidates[0].accountId).toBe('acc-3')
  })

  // ── le score doit SURVIVRE au fil complet IA → API → navigateur ───────────
  //
  // Classe de bug déjà vécue dans ce repo (`registry_id` vs `registryId`) : un
  // champ produit côté IA disparaît en route et l'UI rend une valeur par défaut
  // silencieuse. Le proxy N'APPLIQUE PAS de parsing zod sur cette réponse (il
  // étale les objets), donc les clés inconnues passent — ces tests verrouillent
  // ce fait plutôt que de le supposer.

  it('forwards the scoring metadata verbatim — scoreMax and scoreUnmeasured included', async () => {
    const scored = candidate('552081317', {
      score: 45,
      scoreMax: 75,
      scoreUnmeasured: ['age'],
      dataConfidence: 80,
    } as Partial<DiscoverCandidate>)
    const { controller } = build({ candidates: [scored], query: {}, degraded: [] })

    const [result] = (await controller.discoverSignals(user, {} as DiscoverSignalsDto)).candidates

    expect(result.score).toBe(45)
    expect(result.scoreMax).toBe(75)
    expect(result.scoreUnmeasured).toEqual(['age'])
    expect(result.dataConfidence).toBe(80)
  })

  it('never turns an unavailable score into a zero on the way through', async () => {
    // « Non mesuré » et « mesuré à zéro » sont deux affirmations opposées. Le
    // proxy enrichit, il ne comble pas : un `null` doit rester `null` jusqu'au
    // navigateur, qui l'affichera « score indisponible ».
    const unscored = candidate('552081317', {
      score: null,
      scoreMax: null,
      scoreUnmeasured: ['activity', 'geography', 'headcount', 'signals', 'age'],
      scoreFactors: [],
    } as unknown as Partial<DiscoverCandidate>)
    const { controller } = build({ candidates: [unscored], query: {}, degraded: [] })

    const [result] = (await controller.discoverSignals(user, {} as DiscoverSignalsDto)).candidates

    expect(result.score).toBeNull()
    expect(result.score).not.toBe(0)
    expect(result.scoreUnmeasured).toHaveLength(5)
  })

  // ── #2496 — un échec IA rend une erreur CLAIRE et TYPÉE, jamais un 500 nu ──
  //
  // Reproduit le 17/09/2026 : « Ta cible » applique tous les secteurs de l'ICP
  // d'un coup (rail unifié → un `nafCode` croisant plusieurs secteurs), et
  // l'écran affichait « La recherche a échoué — le service n'a pas pu être
  // joint » pour un `500 {"statusCode":500,"message":"Internal server error"}`
  // générique. `IaClient.discoverRegistry`/`discoverSignals` lèvent une
  // `TechnicalError` (`@bellum/errors`) pour TOUT échec IA — validation
  // refusée (422), panne amont (5xx) ou timeout — et le contrôleur laissait
  // filer jusqu'au filtre générique, qui répond `Internal server error` pour
  // toute exception qui n'est pas une `HttpException`, perdant le statut et le
  // corps RÉELS de la réponse IA.
  describe('un échec IA devient une erreur claire, typée, et journalisée (#2496)', () => {
    it('un 422 IA (critères refusés) devient un 422 API — jamais 500', async () => {
      const { ia, controller } = build(empty)
      const cause = new HttpError(
        422,
        '{"detail":"naf_code must look like 62, 62.02 or 62.02A"}',
        false,
        'ia:discover/registry',
      )
      ia.discoverRegistry.mockRejectedValue(new TechnicalError('HTTP request failed', { cause }))
      const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      const promise = controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

      await expect(promise).rejects.toBeInstanceOf(HttpException)
      await promise.catch((error: HttpException) => {
        expect(error.getStatus()).toBe(422)
        expect(JSON.stringify(error.getResponse())).not.toMatch(/Internal server error/)
      })
      expect(logError).toHaveBeenCalled()
    })

    it('un timeout IA (recherche trop longue) devient un 503 — jamais 500', async () => {
      const { ia, controller } = build(empty)
      const cause = new HttpTimeoutError(45_000, 'ia:discover/registry')
      ia.discoverRegistry.mockRejectedValue(new TechnicalError('HTTP request failed', { cause }))
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      const promise = controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

      await expect(promise).rejects.toBeInstanceOf(HttpException)
      await promise.catch((error: HttpException) => {
        expect(error.getStatus()).toBe(503)
      })
    })

    it('une panne amont IA (5xx) devient un 503 — jamais 500', async () => {
      const { ia, controller } = build(empty)
      const cause = new HttpError(500, 'boom', true, 'ia:discover/registry')
      ia.discoverRegistry.mockRejectedValue(new TechnicalError('HTTP request failed', { cause }))
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      const promise = controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

      await expect(promise).rejects.toBeInstanceOf(HttpException)
      await promise.catch((error: HttpException) => {
        expect(error.getStatus()).toBe(503)
      })
    })

    it('même correctif pour /discover/signals', async () => {
      const { ia, controller } = build(empty)
      const cause = new HttpError(422, 'bad filters', false, 'ia:discover/signals')
      ia.discoverSignals.mockRejectedValue(new TechnicalError('HTTP request failed', { cause }))
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      const promise = controller.discoverSignals(user, {} as DiscoverSignalsDto)

      await expect(promise).rejects.toBeInstanceOf(HttpException)
      await promise.catch((error: HttpException) => {
        expect(error.getStatus()).toBe(422)
      })
    })

    it('le journal porte le statut IA réel, jamais les critères de recherche (pas de donnée personnelle)', async () => {
      const { ia, controller } = build(empty)
      const cause = new HttpError(422, 'bad filters', false, 'ia:discover/registry')
      ia.discoverRegistry.mockRejectedValue(new TechnicalError('HTTP request failed', { cause }))
      const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      await controller
        .discoverRegistry(user, { filters: { freetext: 'Jean Dupont acme' } } as DiscoverRegistryDto)
        .catch(() => undefined)

      const logged = JSON.stringify(logError.mock.calls)
      expect(logged).toMatch(/invalid_filters/)
      expect(logged).not.toMatch(/Jean Dupont/)
    })
  })

  // ── #2165.28 / #2165.30 — filtres serveur mémoire marché ─────────────────

  it('runs the market-memory filters BEFORE resolving portfolio state, with the request filters', async () => {
    const response: DiscoverResponse = {
      candidates: [candidate('552081317'), candidate('444556677')],
      query: {},
      degraded: [],
    }
    const { discoverMarketMemory, portfolio, controller } = build(response)
    discoverMarketMemory.applyFilters.mockResolvedValue({
      candidates: [response.candidates[0]],
      degraded: [{ source: 'market-memory', reason: 'market_memory_unmeasured', kind: 'unmeasured', count: 1 }],
    })

    const result = await controller.discoverRegistry(user, {
      filters: { externalRecourseObserved: true },
    } as DiscoverRegistryDto)

    expect(discoverMarketMemory.applyFilters).toHaveBeenCalledWith(response.candidates, {
      externalRecourseObserved: true,
    })
    // Un seul candidat survit au filtre : le portefeuille n'en résout qu'un.
    expect(portfolio.resolve).toHaveBeenCalledWith('u-1', [response.candidates[0]])
    expect(result.candidates).toHaveLength(1)
    expect(result.degraded).toEqual([
      { source: 'market-memory', reason: 'market_memory_unmeasured', kind: 'unmeasured', count: 1 },
    ])
  })

  it('#3408 — la pile observée de la mémoire marché voyage jusqu’à la réponse, SANS aucun filtre demandé', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { discoverMarketMemory, controller } = build(response)
    discoverMarketMemory.annotateObservedStacks.mockImplementation(async (candidates: DiscoverResponse['candidates']) =>
      candidates.map(c => ({ ...c, technologiesObserved: ['Python'] })),
    )

    const result = await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

    expect(discoverMarketMemory.annotateObservedStacks).toHaveBeenCalledTimes(1)
    expect(result.candidates[0]?.technologiesObserved).toEqual(['Python'])
  })

  it('appends market-memory degraded entries to the ones already on the response — never overwritten', async () => {
    const response: DiscoverResponse = {
      candidates: [candidate('552081317')],
      query: {},
      degraded: [{ source: 'pappers', reason: 'missing_api_key' }],
    }
    const { discoverMarketMemory, controller } = build(response)
    discoverMarketMemory.applyFilters.mockResolvedValue({
      candidates: response.candidates,
      degraded: [{ source: 'market-memory', reason: 'market_memory_unmeasured', kind: 'unmeasured', count: 1 }],
    })

    const result = await controller.discoverSignals(user, { externalRecourseObserved: true } as DiscoverSignalsDto)

    expect(result.degraded).toEqual([
      { source: 'pappers', reason: 'missing_api_key' },
      { source: 'market-memory', reason: 'market_memory_unmeasured', kind: 'unmeasured', count: 1 },
    ])
  })

  it('is a no-op when the market-memory service is not mounted — results stay untouched', async () => {
    const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
    const { controller } = build(response)
    ;(controller as unknown as { discoverMarketMemory: unknown }).discoverMarketMemory = undefined

    const result = await controller.discoverRegistry(user, {
      filters: { externalRecourseObserved: true },
    } as DiscoverRegistryDto)

    expect(result.candidates).toHaveLength(1)
  })

  // #2875/#2402.1 (vague F/G 27/09) — l'émetteur `ao_publie` : `discover_signals.py`
  // ne connaît ni l'espace ni le compte suivi, c'est ICI (une fois croisé avec
  // le portefeuille) que le signal BOAMP devient un `TriggerEvent` canonique.
  describe('#2875/#2402.1 — le déclencheur canonique « ao_publie »', () => {
    function withTriggers(response: DiscoverResponse) {
      const built = build(response)
      const triggers = { recordOnceByDedupeKey: jest.fn().mockResolvedValue(undefined) }
      ;(built.controller as unknown as { triggers: unknown }).triggers = triggers
      ;(
        built.controller as unknown as { workspaceContext: { resolveActiveWorkspace: jest.Mock } }
      ).workspaceContext.resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' })
      return { ...built, triggers }
    }

    it('persiste ao_publie pour un candidat DÉJÀ POSSÉDÉ qui porte un signal BOAMP (tender)', async () => {
      const response: DiscoverResponse = {
        candidates: [
          candidate('552081317', {
            signals: [{ type: 'tender', label: 'AO IT publié — BOAMP', date: '2026-09-20' }],
          }),
        ],
        query: {},
        degraded: [],
      }
      const { portfolio, triggers, controller } = withTriggers(response)
      portfolio.resolve.mockResolvedValue([{ portfolioState: 'analyzed', accountId: 'acc-1' }])

      await controller.discoverSignals(user, {} as DiscoverSignalsDto)

      expect(triggers.recordOnceByDedupeKey).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ao_publie',
          source: 'discover',
          object: { subjectType: 'account', subjectId: 'acc-1' },
          scope: { workspaceId: 'ws-1', ownerId: null },
        }),
        'ia-proxy/discover-signals',
      )
    })

    it('ne persiste RIEN pour un candidat NEUF — Découvrir montre des prospects, pas des comptes suivis', async () => {
      const response: DiscoverResponse = {
        candidates: [
          candidate('552081317', {
            signals: [{ type: 'tender', label: 'AO IT publié — BOAMP', date: '2026-09-20' }],
          }),
        ],
        query: {},
        degraded: [],
      }
      const { portfolio, triggers, controller } = withTriggers(response)
      portfolio.resolve.mockResolvedValue([{ portfolioState: 'new', accountId: null }])

      await controller.discoverSignals(user, {} as DiscoverSignalsDto)

      expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
    })

    it('ne persiste RIEN pour un compte possédé SANS signal tender (hiring seul)', async () => {
      const response: DiscoverResponse = {
        candidates: [
          candidate('552081317', { signals: [{ type: 'hiring', label: '5 postes ouverts', date: '2026-09-20' }] }),
        ],
        query: {},
        degraded: [],
      }
      const { portfolio, triggers, controller } = withTriggers(response)
      portfolio.resolve.mockResolvedValue([{ portfolioState: 'analyzed', accountId: 'acc-1' }])

      await controller.discoverSignals(user, {} as DiscoverSignalsDto)

      expect(triggers.recordOnceByDedupeKey).not.toHaveBeenCalled()
    })
  })

  // #3671.2bis — « Mauvaise entreprise » : un SIREN déclaré par CET espace ne
  // se rattache plus aux recherches suivantes (registre comme signaux).
  describe('#3671.2bis — exclusion des SIREN « Mauvaise entreprise »', () => {
    function withFeedback(response: DiscoverResponse, excludedSirens: jest.Mock) {
      const built = build(response)
      ;(built.controller as unknown as { discoverFeedback: unknown }).discoverFeedback = {
        excludedSirens,
      }
      ;(
        built.controller as unknown as { workspaceContext: { resolveActiveWorkspace: jest.Mock } }
      ).workspaceContext.resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' })
      return built
    }

    it('retire du registre un candidat dont le SIREN a été déclaré « Mauvaise entreprise »', async () => {
      const response: DiscoverResponse = {
        candidates: [candidate('552081317'), candidate('111111111')],
        query: {},
        degraded: [],
      }
      const excludedSirens = jest.fn().mockResolvedValue(new Set(['552081317']))
      const { controller } = withFeedback(response, excludedSirens)

      const result = await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

      expect(excludedSirens).toHaveBeenCalledWith('ws-1')
      expect(result.candidates.map(c => c.siren)).toEqual(['111111111'])
    })

    it('retire des signaux un candidat dont le SIREN a été déclaré « Mauvaise entreprise »', async () => {
      const response: DiscoverResponse = {
        candidates: [candidate('552081317'), candidate('111111111')],
        query: {},
        degraded: [],
      }
      const excludedSirens = jest.fn().mockResolvedValue(new Set(['552081317']))
      const { controller } = withFeedback(response, excludedSirens)

      const result = await controller.discoverSignals(user, {} as DiscoverSignalsDto)

      expect(result.candidates.map(c => c.siren)).toEqual(['111111111'])
    })

    it('aucun SIREN exclu : la liste ne bouge pas, aucune lecture de workspace gaspillée au-delà de l’appel', async () => {
      const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
      const excludedSirens = jest.fn().mockResolvedValue(new Set())
      const { controller } = withFeedback(response, excludedSirens)

      const result = await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

      expect(result.candidates).toHaveLength(1)
    })

    it('est un no-op quand le module de retours Découvrir n’est pas monté', async () => {
      const response: DiscoverResponse = { candidates: [candidate('552081317')], query: {}, degraded: [] }
      const { controller } = build(response)
      ;(controller as unknown as { discoverFeedback: unknown }).discoverFeedback = undefined

      const result = await controller.discoverRegistry(user, { filters: {} } as DiscoverRegistryDto)

      expect(result.candidates).toHaveLength(1)
    })
  })
})
