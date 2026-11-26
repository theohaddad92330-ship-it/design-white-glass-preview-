import { type EsnAnswers, esnAnswersToProfileData } from '@bellum/contracts'
import { isFailure, isSuccess, success, failure } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { IaClient } from '../ia/ia.client'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { AnalysisPersistenceService } from './analysis.persistence'
import { OrgGraphVersionService } from '../org-graph/org-graph.service'
import { BATCH_LANE_EXTRA_MS, PHASE_TIMEOUT_MS } from './analysis.constants'
import { AnalysisFactsInputsService } from './analysis-facts-inputs.service'

const esnProfileStub = () =>
  ({
    getAnswers: jest.fn().mockResolvedValue({}),
    resolveProfileData: jest.fn().mockResolvedValue({}),
    // Profil vendeur résolu server-side ; `{}` = run profile-neutral (l'IA retombe
    // alors sur son défaut, prompts inchangés).
  }) as unknown as EsnProfileReader

type ServiceMock<T> = { [K in keyof T]: jest.Mock }

function buildService(opts: {
  accountFound?: boolean
  researchData?: Record<string, unknown>
  researchThrows?: Error
}) {
  const account = {
    id: 'acc-1',
    user_id: 'u-1',
    // #2671 — porté jusqu'à `AccountsService.refreshResearch` pour scoper ses
    // deux lectures internes ; présent ici pour que ce test le voie voyager.
    workspace_id: 'ws-1',
    company_name: 'Société Générale',
    raw_analysis: { sector: 'Banque' },
  } as unknown as AccountEntity

  const accounts = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.accountFound === false ? failure({ code: 'not_found', message: 'gone' }) : success(account),
      ),
    refreshResearch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ServiceMock<Pick<AccountsService, 'findOne' | 'refreshResearch'>>

  const contacts = { findByAccount: jest.fn() } as unknown as ServiceMock<Pick<ContactsService, 'findByAccount'>>

  const ia = {
    research: opts.researchThrows
      ? jest.fn().mockRejectedValue(opts.researchThrows)
      : jest.fn().mockResolvedValue({ data: opts.researchData ?? { sector: 'Banque', siren: '552120222' } }),
  } as unknown as ServiceMock<Pick<IaClient, 'research'>>

  const persistence = {
    saveResearch: jest.fn().mockResolvedValue(undefined),
    refreshOpportunityDomains: jest.fn().mockResolvedValue(undefined),
    seedJobRecruiterContacts: jest.fn().mockResolvedValue(undefined),
  } as unknown as ServiceMock<
    Pick<AnalysisPersistenceService, 'saveResearch' | 'refreshOpportunityDomains' | 'seedJobRecruiterContacts'>
  >

  const service = new AnalysisOnDemandService(
    accounts as unknown as AccountsService,
    contacts as unknown as ContactsService,
    ia as unknown as IaClient,
    persistence as unknown as AnalysisPersistenceService,
    esnProfileStub(),
  )
  return { service, accounts, ia, persistence, account }
}

/**
 * Lot 762 P4 — l'ACTUALISATION fait ce que fait l'analyse : `historical_needs` est réécrit après la recherche
 * (avant, il restait périmé) et les offres relues redeviennent des besoins PROPOSÉS.
 */
describe('AnalysisOnDemandService.refreshResearch — parité avec l’analyse (lot 762 P4)', () => {
  const layers = {
    historicalSignals: [],
    historicalJobOffers: [{ label: 'Architecte SAP', date: '2024-02-10', windowDays: 180 }],
    historicalCount: 1,
  }

  function withFollowups(opts: { layer?: unknown } = {}) {
    const built = buildService({})
    const p = built.persistence as unknown as Record<string, jest.Mock>
    p['readSignalLayers'] = jest.fn().mockResolvedValue(opts.layer ?? layers)
    p['saveHistoricalNeeds'] = jest.fn().mockResolvedValue(undefined)
    p['readJobSignals'] = jest.fn().mockResolvedValue([{ title: 'Architecte SAP' }])
    const needProposals = { record: jest.fn().mockResolvedValue(1) }
    const service = new AnalysisOnDemandService(
      built.accounts as unknown as AccountsService,
      { findByAccount: jest.fn() } as unknown as ContactsService,
      built.ia as unknown as IaClient,
      built.persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      ...(Array.from({ length: 13 }, () => undefined) as []),
      needProposals as never,
    )
    return { ...built, service, p, needProposals }
  }

  it('historical_needs est RÉÉCRIT après la recherche persistée', async () => {
    const { service, p, accounts } = withFollowups()
    await service.refreshResearch('acc-1', 'u-1')
    expect(p['saveHistoricalNeeds']).toHaveBeenCalledTimes(1)
    const [id, block] = p['saveHistoricalNeeds']!.mock.calls[0] as [string, { total: number }]
    expect(id).toBe('acc-1')
    expect(block.total).toBe(1)
    expect(p['saveHistoricalNeeds']!.mock.invocationCallOrder[0]).toBeGreaterThan(
      accounts.refreshResearch.mock.invocationCallOrder[0]!,
    )
  })

  it('les offres relues redeviennent des besoins PROPOSÉS (espace du compte)', async () => {
    const { service, needProposals } = withFollowups()
    await service.refreshResearch('acc-1', 'u-1')
    expect(needProposals.record).toHaveBeenCalledWith('ws-1', 'acc-1', [{ title: 'Architecte SAP' }])
  })

  it('sait dire NON : couche absente → rien n’est écrit ; recherche sans donnée → rien n’est relu', async () => {
    const absent = withFollowups({ layer: { historicalSignals: [], historicalJobOffers: [], historicalCount: null } })
    await absent.service.refreshResearch('acc-1', 'u-1')
    expect(absent.p['saveHistoricalNeeds']).not.toHaveBeenCalled()

    const none = withFollowups()
    none.ia.research.mockResolvedValue({})
    await none.service.refreshResearch('acc-1', 'u-1')
    expect(none.p['readSignalLayers']).not.toHaveBeenCalled()
    expect(none.needProposals.record).not.toHaveBeenCalled()
  })

  it('un échec du chemin partagé ne fait pas échouer l’actualisation (best-effort)', async () => {
    const { service, p } = withFollowups()
    p['readSignalLayers']!.mockRejectedValue(new Error('db down'))
    const result = await service.refreshResearch('acc-1', 'u-1')
    expect(isSuccess(result)).toBe(true)
  })
})

/**
 * #3978 (11/10/2026) — le rattrapage des pains/enjeux. Ils sont produits par la
 * PHASE 1 (`bellum_strategy` tourne dans `phase1_research`), datés par
 * `signals_collected_at` : leur rejeu CIBLÉ est celui du segment `signals`
 * (`refreshResearch`). Ce chemin ne repassait jamais sur les pistes — le domaine
 * reclassé restait dans `raw_analysis`, aucune piste ne le recevait.
 */
describe('AnalysisOnDemandService.refreshResearch — le domaine reclassé atteint les pistes (#3978)', () => {
  it('APRÈS la recherche persistée, remplit le domaine des pistes existantes du compte', async () => {
    const { service, accounts, persistence } = buildService({})
    await service.refreshResearch('acc-1', 'u-1')
    expect(persistence.refreshOpportunityDomains).toHaveBeenCalledWith('acc-1')
    const persisted = accounts.refreshResearch.mock.invocationCallOrder[0] ?? Infinity
    const filled = persistence.refreshOpportunityDomains.mock.invocationCallOrder[0] ?? -Infinity
    expect(filled).toBeGreaterThan(persisted)
  })

  // LOT (15/10) DATA-A point 2 — seule la veille demande les nouveautés du jour.
  it('la veille (watch) passe watchRefresh à la recherche ; « Actualiser » ne le passe pas', async () => {
    const watch = buildService({})
    await watch.service.refreshResearch('acc-1', 'u-1', { watch: true })
    expect(watch.ia.research.mock.calls[0]![0]).toMatchObject({ watchRefresh: true })
    const manual = buildService({})
    await manual.service.refreshResearch('acc-1', 'u-1')
    expect(manual.ia.research.mock.calls[0]![0]).not.toHaveProperty('watchRefresh')
  })

  // VC.3 (18/10) — la collecte d'une relecture sert la veille des AUTRES espaces (tampon
  // communautaire côté IA) : un espace de démonstration n'y contribue jamais, il n'atteint pas l'IA.
  it('VC.3 — la veille d’un espace de démonstration n’appelle pas l’IA : la démo ne nourrit pas la communauté', async () => {
    const accounts = { findOne: jest.fn(), refreshResearch: jest.fn() }
    const ia = { research: jest.fn() }
    const workspaceContext = { isDemoWorkspace: jest.fn().mockResolvedValue(true) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      { findByAccount: jest.fn() } as unknown as ContactsService,
      ia as unknown as IaClient,
      {} as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined, // accountFeedback
      workspaceContext as unknown as ConstructorParameters<typeof AnalysisOnDemandService>[6],
    )

    const result = await service.refreshResearch('acc-1', 'u-1', { watch: true, llmLane: 'batch' })

    expect(isFailure(result)).toBe(true)
    expect(ia.research).not.toHaveBeenCalled()
    expect(accounts.refreshResearch).not.toHaveBeenCalled()
  })

  it('sait dire NON : rien ne se remplit quand la recherche n’a rien rendu, ni sur un compte introuvable', async () => {
    const empty = buildService({})
    empty.ia.research.mockResolvedValueOnce({})
    await empty.service.refreshResearch('acc-1', 'u-1')
    expect(empty.persistence.refreshOpportunityDomains).not.toHaveBeenCalled()

    const ghost = buildService({ accountFound: false })
    await ghost.service.refreshResearch('ghost', 'u-1')
    expect(ghost.persistence.refreshOpportunityDomains).not.toHaveBeenCalled()
  })

  it('un échec du remplissage ne fait pas échouer un rejeu déjà persisté', async () => {
    const { service, persistence } = buildService({})
    persistence.refreshOpportunityDomains.mockRejectedValueOnce(new Error('boom'))
    const result = await service.refreshResearch('acc-1', 'u-1')
    expect(isSuccess(result)).toBe(true)
  })
})

/**
 * SIG-B (11/10/2026) — « Actualiser » et le rafraîchissement de la veille
 * repassent par la phase 1 : les recruteurs nommés par les offres de CE run
 * passent par la même porte contacts que l'analyse complète.
 */
describe('AnalysisOnDemandService.refreshResearch — recruteurs prouvés par une offre (SIG-B)', () => {
  it('sème les recruteurs de la recherche rafraîchie, après sa persistance', async () => {
    const research = {
      sector: 'Banque',
      jobRecruiters: [{ fullName: 'Claire Martin', jobPosting: { title: 'Dev', url: 'https://x/1' } }],
    }
    const { service, accounts, persistence } = buildService({ researchData: research })
    await service.refreshResearch('acc-1', 'u-1')
    expect(persistence.seedJobRecruiterContacts).toHaveBeenCalledWith('acc-1', 'u-1', research)
    const persisted = accounts.refreshResearch.mock.invocationCallOrder[0] ?? Infinity
    expect(persistence.seedJobRecruiterContacts.mock.invocationCallOrder[0]).toBeGreaterThan(persisted)
  })

  it('un échec de la semence ne fait pas échouer un rejeu déjà persisté', async () => {
    const { service, persistence } = buildService({})
    persistence.seedJobRecruiterContacts.mockRejectedValueOnce(new Error('boom'))
    expect(isSuccess(await service.refreshResearch('acc-1', 'u-1'))).toBe(true)
  })
})

describe('AnalysisOnDemandService.refreshResearch', () => {
  it('re-runs ONLY Phase 1 and re-persists the fresh research (bumping refreshed_at)', async () => {
    const { service, ia, accounts } = buildService({ researchData: { sector: 'Banque', siren: '552120222' } })

    const result = await service.refreshResearch('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    // Exactly one IA call — the research phase. No contacts/classify/plan.
    expect(ia.research).toHaveBeenCalledTimes(1)
    expect(ia.research).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: 'Société Générale', accountId: 'acc-1', userId: 'u-1' }),
      // Minutes-long phase budget + single attempt (no 30s timeout, no triple-bill).
      { timeoutMs: PHASE_TIMEOUT_MS.research, maxAttempts: 1 },
    )
    // Re-persisted via refreshResearch (applyResearch + markCompleted bumps updated_at).
    // #2671 — le `workspace_id` du compte déjà lu (scopé user) voyage jusqu'ici.
    expect(accounts.refreshResearch).toHaveBeenCalledWith('acc-1', { sector: 'Banque', siren: '552120222' }, 'ws-1')
  })

  it('returns not_found when the account is missing or owned by someone else', async () => {
    const { service, ia, accounts } = buildService({ accountFound: false })

    const result = await service.refreshResearch('ghost', 'u-1')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    expect(ia.research).not.toHaveBeenCalled()
    expect(accounts.refreshResearch).not.toHaveBeenCalled()
  })

  it('returns ia_failed when the research call throws', async () => {
    const { service, accounts } = buildService({ researchThrows: new Error('IA down') })

    const result = await service.refreshResearch('acc-1', 'u-1')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('ia_failed')
    expect(accounts.refreshResearch).not.toHaveBeenCalled()
  })

  it('does not persist when the IA returns no data body', async () => {
    const { service, ia, accounts } = buildService({})
    ia.research.mockResolvedValueOnce({}) // no `data` key
    const result = await service.refreshResearch('acc-1', 'u-1')
    expect(isSuccess(result)).toBe(true)
    expect(accounts.refreshResearch).not.toHaveBeenCalled()
  })
})

/**
 * #4070.1/.4 — le chemin « Actualiser » (research seule — `refreshResearch`,
 * `researchSites`, `generateAttackAngle` partagent tous `runResearch`) repartait
 * sans l'historique du compte : seul le graphe complet (lancement + reprise) le
 * portait. Même lecteur UNIQUE que le lancement (`AnalysisFactsInputsService`).
 */
describe('AnalysisOnDemandService.refreshResearch — les faits du compte (#4070.1/.4)', () => {
  const withWorkspace = {
    id: 'acc-1',
    user_id: 'u-1',
    workspace_id: 'ws-1',
    company_name: 'Société Générale',
    raw_analysis: { sector: 'Banque' },
  } as unknown as AccountEntity

  it('envoie les faits du compte et l’analyse précédente', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(withWorkspace)), refreshResearch: jest.fn() }
    const contacts = { findByAccount: jest.fn() }
    const ia = { research: jest.fn().mockResolvedValue({ data: { sector: 'Banque' } }) }
    const persistence = {
      saveResearch: jest.fn(),
      refreshOpportunityDomains: jest.fn().mockResolvedValue(undefined),
      seedJobRecruiterContacts: jest.fn().mockResolvedValue(undefined),
    }
    const factsInputs = {
      accountFacts: jest.fn().mockResolvedValue({
        accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
      }),
      previousAnalysis: jest.fn().mockResolvedValue('Analyse du 2026-06-18'),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined, // accountFeedback
      undefined, // workspaceContext
      undefined, // crmRead
      undefined, // signalHistory
      undefined, // orgGraph
      undefined, // runs
      undefined, // credits
      undefined, // orgRebuildQueue
      undefined, // marketMemory
      undefined, // relationAxis
      undefined, // sellerHypothesesReader
      factsInputs as unknown as AnalysisFactsInputsService,
    )

    await service.refreshResearch('acc-1', 'u-1')

    expect(factsInputs.accountFacts).toHaveBeenCalledWith({ workspaceId: 'ws-1', accountId: 'acc-1', userId: 'u-1' })
    expect(ia.research).toHaveBeenCalledWith(
      expect.objectContaining({
        accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
        previousAnalysis: 'Analyse du 2026-06-18',
      }),
      expect.anything(),
    )
  })

  it('NON : sans espace sur le compte ou sans lecteur, aucune des deux clés', async () => {
    const { service, ia } = buildService({})
    await service.refreshResearch('acc-1', 'u-1')
    const [body] = ia.research.mock.calls[0]!
    expect(body).not.toHaveProperty('accountFacts')
    expect(body).not.toHaveProperty('previousAnalysis')
  })
})

/**
 * #1631.3/.4, #1606.2 (lot 14) — l'axe CHEMIN sur le chemin « Actualiser » :
 * AUCUN appelant ne transmettait `market_paths_observed`/`market_top_esn` à
 * l'IA avant ce lot, l'axe restait non mesuré en production quelle que soit
 * la couverture réelle de la mémoire marché sur ce compte.
 */
describe('AnalysisOnDemandService.refreshResearch — axe CHEMIN (lot 14)', () => {
  const axisAccount = {
    id: 'acc-1',
    user_id: 'u-1',
    company_name: 'BNP Paribas',
    website: 'https://bnpparibas.com',
    registry_country: 'FR',
    raw_analysis: {},
  } as unknown as AccountEntity

  it('transmet le compte de parcours et l’ESN dominante quand `MarketMemoryService` les résout', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(axisAccount)), refreshResearch: jest.fn() }
    const ia = { research: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { saveResearch: jest.fn() }
    const marketMemory = { pathAxisFor: jest.fn().mockResolvedValue({ paths: 9, topEsn: 'ALTEN' }) }
    const service = buildOnDemand({ accounts, contacts: {}, ia, persistence, marketMemory })

    await service.refreshResearch('acc-1', 'u-1')

    expect(marketMemory.pathAxisFor).toHaveBeenCalledWith({
      ref: 'acc-1',
      name: 'BNP Paribas',
      website: 'https://bnpparibas.com',
      country: 'FR',
    })
    expect(ia.research).toHaveBeenCalledWith(
      expect.objectContaining({ marketPathsObserved: 9, marketTopEsn: 'ALTEN' }),
      expect.anything(),
    )
  })

  it('sans `MarketMemoryService` (specs à constructeur nu) — requête byte-identique', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(axisAccount)), refreshResearch: jest.fn() }
    const ia = { research: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { saveResearch: jest.fn() }
    const service = buildOnDemand({ accounts, contacts: {}, ia, persistence })

    await service.refreshResearch('acc-1', 'u-1')

    const [body] = ia.research.mock.calls[0]!
    expect(body).not.toHaveProperty('marketPathsObserved')
    expect(body).not.toHaveProperty('marketTopEsn')
  })

  it('sous le seuil transverse (`pathAxisFor` rend `null`) — clés omises, jamais un `0`', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(axisAccount)), refreshResearch: jest.fn() }
    const ia = { research: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { saveResearch: jest.fn() }
    const marketMemory = { pathAxisFor: jest.fn().mockResolvedValue(null) }
    const service = buildOnDemand({ accounts, contacts: {}, ia, persistence, marketMemory })

    await service.refreshResearch('acc-1', 'u-1')

    const [body] = ia.research.mock.calls[0]!
    expect(body).not.toHaveProperty('marketPathsObserved')
    expect(body).not.toHaveProperty('marketTopEsn')
  })
})

describe('AnalysisOnDemandService.researchSites', () => {
  it('re-runs Phase 1 and returns { matched, total } counted from the discovered sites', async () => {
    const { service, ia, accounts } = buildService({
      researchData: {
        sector: 'Banque',
        sitesFrance: [
          { city: 'Paris', region: 'Île-de-France' },
          { region: 'Occitanie' }, // located by region only
          { city: '   ' }, // blank → not located, but still a site
          {}, // no location → not located
        ],
      },
    })

    const result = await service.researchSites('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output).toEqual({ matched: 2, total: 4 })
    // Same single Phase-1 path as refreshResearch: one research call, re-persist.
    expect(ia.research).toHaveBeenCalledTimes(1)
    expect(ia.research).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: 'Société Générale', accountId: 'acc-1', userId: 'u-1' }),
      { timeoutMs: PHASE_TIMEOUT_MS.research, maxAttempts: 1 },
    )
    expect(accounts.refreshResearch).toHaveBeenCalledTimes(1)
  })

  it('returns { matched: 0, total: 0 } when the research finds no sites', async () => {
    const { service } = buildService({ researchData: { sector: 'Banque' } }) // no sitesFrance
    const result = await service.researchSites('acc-1', 'u-1')
    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output).toEqual({ matched: 0, total: 0 })
  })

  it('returns not_found when the account is missing or owned by someone else', async () => {
    const { service, ia } = buildService({ accountFound: false })
    const result = await service.researchSites('ghost', 'u-1')
    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    expect(ia.research).not.toHaveBeenCalled()
  })

  it('returns ia_failed when the research call throws', async () => {
    const { service, accounts } = buildService({ researchThrows: new Error('IA down') })
    const result = await service.researchSites('acc-1', 'u-1')
    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('ia_failed')
    expect(accounts.refreshResearch).not.toHaveBeenCalled()
  })
})

const account = {
  id: 'acc-1',
  user_id: 'u-1',
  company_name: 'Société Générale',
  status: 'completed',
  raw_analysis: { sector: 'Banque' },
} as unknown as AccountEntity

/** Le service avec ses 5 dépendances requises + la file de reconstruction du
 *  graphe (13ᵉ argument optionnel) et `MarketMemoryService` (14ᵉ, lot 14) —
 *  l'énumérer à la main dans chaque test rendrait la position illisible et la
 *  casserait au prochain ajout. */
function buildOnDemand(deps: {
  accounts: unknown
  contacts: unknown
  ia: unknown
  persistence: unknown
  queue?: unknown
  marketMemory?: unknown
}): AnalysisOnDemandService {
  return new AnalysisOnDemandService(
    deps.accounts as AccountsService,
    deps.contacts as ContactsService,
    deps.ia as IaClient,
    deps.persistence as AnalysisPersistenceService,
    esnProfileStub(),
    undefined, // accountFeedback
    undefined, // workspaceContext
    undefined, // crmRead
    undefined, // signalHistory
    undefined, // orgGraph
    undefined, // runs
    undefined, // credits
    deps.queue as ConstructorParameters<typeof AnalysisOnDemandService>[12],
    deps.marketMemory as ConstructorParameters<typeof AnalysisOnDemandService>[13],
  )
}

describe('AnalysisOnDemandService.enrichContacts', () => {
  // C.2 (Cédric 20/10) — « Agrandir la recherche » partait SANS ancre d'organisation.
  // Les ancres lues dans `raw_analysis.apolloEnrichment` doivent partir avec l'appel ;
  // absentes, les champs sont OMIS (jamais inventés).
  describe('ancre d’organisation (C.2)', () => {
    function build(rawAnalysis: unknown, iaResponse: unknown = { data: { contacts: [] } }) {
      const accounts = { findOne: jest.fn().mockResolvedValue(success({ ...account, raw_analysis: rawAnalysis })) }
      const ia = { contacts: jest.fn().mockResolvedValue(iaResponse) }
      const persistence = {
        saveContacts: jest.fn().mockResolvedValue(0),
        saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
      }
      const service = new AnalysisOnDemandService(
        accounts as unknown as AccountsService,
        { findByAccount: jest.fn() } as unknown as ContactsService,
        ia as unknown as IaClient,
        persistence as unknown as AnalysisPersistenceService,
        esnProfileStub(),
      )
      return { service, ia }
    }

    it('envoie organizationIds / organizationDomains lus dans apolloEnrichment', async () => {
      const { service, ia } = build({ apolloEnrichment: { organizationId: 'org-1', domain: 'safran-group.com' } })
      await service.enrichContacts('acc-1', 'u-1')
      expect(ia.contacts).toHaveBeenCalledWith(
        expect.objectContaining({ organizationIds: ['org-1'], organizationDomains: ['safran-group.com'] }),
        expect.anything(),
      )
    })

    it('omet les champs quand raw_analysis n’a aucune ancre', async () => {
      const { service, ia } = build({ apolloEnrichment: {} })
      await service.enrichContacts('acc-1', 'u-1')
      const input = ia.contacts.mock.calls[0]![0] as Record<string, unknown>
      expect('organizationIds' in input).toBe(false)
      expect('organizationDomains' in input).toBe(false)
    })

    it('rend orgAnchorSource="none" quand l’IA dit qu’elle a cherché sans ancre', async () => {
      const { service } = build({}, { data: { contacts: [], orgAnchorSource: 'none' } })
      const result = await service.enrichContacts('acc-1', 'u-1')
      expect(isFailure(result)).toBe(false)
      if (!isFailure(result)) expect(result.output.orgAnchorSource).toBe('none')
    })

    it('n’invente pas orgAnchorSource quand l’IA ne le dit pas', async () => {
      const { service } = build({})
      const result = await service.enrichContacts('acc-1', 'u-1')
      if (!isFailure(result)) expect('orgAnchorSource' in result.output).toBe(false)
    })
  })

  it('calls Phase-2 with the contacts phase budget and a single attempt', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(undefined),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    await service.enrichContacts('acc-1', 'u-1')

    expect(ia.contacts).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1', userId: 'u-1' }), {
      timeoutMs: PHASE_TIMEOUT_MS.contacts,
      maxAttempts: 1,
    })
  })

  /**
   * #AF (compagnon du lot « rattrapage ciblé par segment », 18/09/2026) —
   * AUCUN APPEL RÉSEAU EN DÉMO.
   *
   * `SegmentCatchupService.runCatchup` (segment-catchup.service.ts) appelle
   * `enrichContacts` pour CHAQUE compte concerné, sans filtrer les espaces de
   * démonstration en amont — c'est `demoGuard` (ligne ~125) qui doit refuser
   * AVANT tout appel IA. Un dossier de démo est figé (curated), et un
   * rattrapage qui l'écraserait avec une recherche Apollo sur une entreprise
   * fictive serait exactement le défaut que la doctrine interdit.
   */
  it('un espace de démonstration refuse SANS appeler l’IA — aucun appel réseau en démo', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = { saveContacts: jest.fn(), saveContactsOutOfScope: jest.fn() }
    const workspaceContext = { isDemoWorkspace: jest.fn().mockResolvedValue(true) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined, // accountFeedback
      workspaceContext as unknown as ConstructorParameters<typeof AnalysisOnDemandService>[6],
    )

    const result = await service.enrichContacts('acc-1', 'u-1')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('precondition_failed')
    expect(ia.contacts).not.toHaveBeenCalled()
    expect(persistence.saveContacts).not.toHaveBeenCalled()
  })

  it('compte les contacts RÉELLEMENT entrés au dossier, pas ceux annoncés par l’IA', async () => {
    // « 2 contacts identifiés » alors que la liste ne bouge pas : c'est ce que
    // voyait le commercial. Un contact déjà connu est fusionné dans sa ligne, une
    // identité insuffisante est refusée à la porte — le nombre qui compte est
    // celui des lignes créées.
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn().mockResolvedValue([]) }
    const ia = {
      contacts: jest.fn().mockResolvedValue({
        data: { contacts: [{ fullName: 'Jane Doe' }, { fullName: 'John Roe' }, { fullName: 'Deja Vu' }] },
      }),
    }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(1), // 3 trouvés, 1 seul nouveau
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichContacts('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output).toMatchObject({ count: 1, identified: 3 })
  })

  it('met la reconstruction du graphe EN FILE quand des contacts sont réellement entrés', async () => {
    // C'était le chaînon manquant : la table des contacts se remplissait pendant
    // que l'organigramme continuait d'afficher « Contact(s) à vérifier » au même
    // endroit. La reconstruction est enfilée, pas attendue — la tenir dans la
    // requête du bouton additionnerait deux budgets de phase sur un clic.
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = {
      contacts: jest.fn().mockResolvedValue({ data: { contacts: [{ fullName: 'Jane Doe' }] } }),
      classify: jest.fn(),
    }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(1),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const queue = { add: jest.fn().mockResolvedValue({ id: 'org-rebuild-acc-1' }) }
    const service = buildOnDemand({ accounts, contacts, ia, persistence, queue })

    const result = await service.enrichContacts('acc-1', 'u-1')

    // La phase 3 ne tourne PAS dans la requête : c'est tout l'intérêt.
    expect(ia.classify).not.toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalledWith(
      'rebuild',
      { accountId: 'acc-1', userId: 'u-1' },
      // Un job par compte : deux recherches coup sur coup ne paient pas deux
      // reconstructions du même graphe.
      expect.objectContaining({ jobId: 'org-rebuild-acc-1', attempts: 1 }),
    )
    if (isSuccess(result)) expect(result.output.organigramRebuild).toBe('queued')
  })

  it('n’enfile rien quand aucun contact n’est entré — on ne paie pas un graphe inchangé', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn().mockResolvedValue({ data: { contacts: [{ fullName: 'Deja Vu' }] } }) }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(0),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const queue = { add: jest.fn() }
    const service = buildOnDemand({ accounts, contacts, ia, persistence, queue })

    const result = await service.enrichContacts('acc-1', 'u-1')

    expect(queue.add).not.toHaveBeenCalled()
    if (isSuccess(result)) expect(result.output).toEqual({ count: 0, identified: 1, organigramRebuild: 'skipped' })
  })

  it('garde les contacts quand la file est indisponible — et le DIT', async () => {
    // Les contacts sont déjà persistés : une file en panne ne doit ni les faire
    // perdre, ni laisser croire que la carte va se mettre à jour toute seule.
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn().mockResolvedValue({ data: { contacts: [{ fullName: 'Jane Doe' }] } }) }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(1),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const queue = { add: jest.fn().mockRejectedValue(new Error('redis down')) }
    const service = buildOnDemand({ accounts, contacts, ia, persistence, queue })

    const result = await service.enrichContacts('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output).toEqual({ count: 1, identified: 1, organigramRebuild: 'unavailable' })
  })

  it('rend l’état de la reconstruction — et n’appelle jamais « idle » une panne', async () => {
    // `idle` se lit « c'est fini, rien ne bouge » côté écran : le dire quand
    // Redis est illisible ferait cesser le suivi sur une carte qui, elle, va
    // changer. On préfère un refus explicite.
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const job = { getState: jest.fn().mockResolvedValue('waiting') }
    const queue = { getJob: jest.fn().mockResolvedValue(job) }
    const service = buildOnDemand({ accounts, contacts: {}, ia: {}, persistence: {}, queue })

    const queued = await service.orgRebuildState('acc-1', 'u-1')
    expect(queue.getJob).toHaveBeenCalledWith('org-rebuild-acc-1')
    if (isSuccess(queued)) expect(queued.output.state).toBe('queued')

    job.getState.mockResolvedValue('completed')
    const done = await service.orgRebuildState('acc-1', 'u-1')
    if (isSuccess(done)) expect(done.output.state).toBe('completed')

    // Jamais lancée (ou déjà expirée de Redis) : ce n'est pas un échec.
    queue.getJob.mockResolvedValue(undefined)
    const idle = await service.orgRebuildState('acc-1', 'u-1')
    if (isSuccess(idle)) expect(idle.output.state).toBe('idle')

    queue.getJob.mockRejectedValue(new Error('redis down'))
    expect(isFailure(await service.orgRebuildState('acc-1', 'u-1'))).toBe(true)
  })

  it('ne rend l’état qu’au propriétaire du compte', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(failure({ code: 'not_found', message: 'gone' })) }
    const queue = { getJob: jest.fn() }
    const service = buildOnDemand({ accounts, contacts: {}, ia: {}, persistence: {}, queue })

    expect(isFailure(await service.orgRebuildState('acc-1', 'autre-user'))).toBe(true)
    expect(queue.getJob).not.toHaveBeenCalled()
  })

  it('threads the S6 re-run scope through to Phase 2 (persona/geo/entity)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(undefined),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const scope = { titles: ['RSSI'], geographies: ['France'], entity: 'Boursorama' }
    await service.enrichContacts('acc-1', 'u-1', scope)

    expect(ia.contacts).toHaveBeenCalledWith(expect.objectContaining({ scope }), expect.anything())
  })

  // #2532.2 bis — retour BOUYGUES CONSTRUCTION (19/09/2026) : le RÉSULTAT d'une
  // recherche par thème doit voyager jusqu'à l'écran, pas seulement le compteur
  // global de contacts.
  it('#2532.2 bis — transmet le themeSearch rendu par l’IA jusqu’à l’écran', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = {
      contacts: jest.fn().mockResolvedValue({
        data: {
          contacts: [{ fullName: 'Léo Petit' }],
          themeSearch: {
            theme: 'Coordinateur de chantier',
            titles: ['Chef de Chantier', 'Conducteur de Travaux'],
            matchedCount: 1,
            matchedNames: ['Léo Petit'],
            outOfThemeCount: 2,
            presetMatched: true,
          },
        },
      }),
    }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(1),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichContacts('acc-1', 'u-1', { theme: 'Coordinateur de chantier' })

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) {
      expect(result.output.themeSearch).toEqual({
        theme: 'Coordinateur de chantier',
        titles: ['Chef de Chantier', 'Conducteur de Travaux'],
        matchedCount: 1,
        matchedNames: ['Léo Petit'],
        outOfThemeCount: 2,
        presetMatched: true,
      })
    }
  })

  // #2532.2 (21/09/2026) — un thème SANS preset connu (aucune des 10
  // familles de contact_themes.py) doit rester HONNÊTE côté écran : jamais
  // un `presetMatched` deviné à `true` quand l'IA ne l'affirme pas, jamais un
  // silence qui laisserait croire à une expansion sectorielle.
  it('#2532.2 — presetMatched reste false quand l’IA ne l’affirme pas (JSON absent ou invalide)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = {
      contacts: jest.fn().mockResolvedValue({
        data: {
          contacts: [{ fullName: 'Awa Diallo' }],
          themeSearch: {
            theme: 'Coordinateur pédagogique',
            titles: ['Coordinateur pédagogique', 'Coordinatrice pédagogique'],
            matchedCount: 0,
            matchedNames: [],
            outOfThemeCount: 1,
            // presetMatched absent du JSON externe : ne doit jamais devenir `true`.
          },
        },
      }),
    }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(1),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichContacts('acc-1', 'u-1', { theme: 'Coordinateur pédagogique' })

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output.themeSearch?.presetMatched).toBe(false)
  })

  it('#2532.2 bis — pas de themeSearch sur une recherche non thématisée, jamais un compteur inventé', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn().mockResolvedValue({ data: { contacts: [{ fullName: 'Jane Doe' }] } }) }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(1),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichContacts('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output.themeSearch).toBeUndefined()
  })

  it('relance une case famille × niveau de la matrice de couverture (annexe organigramme §6)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(undefined),
      // `enrichContacts` reporte aussi les écartés hors périmètre (#713) : sans
      // ce mock, la suite tombe sur un stub incomplet, pas sur un vrai défaut.
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    await service.enrichContacts('acc-1', 'u-1', { family: 'cyber', level: 'n1' })

    expect(ia.contacts).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { family: 'cyber', level: 'n1' } }),
      expect.anything(),
    )
  })

  it('REFUSE — zéro appel IA — une recherche ciblée sur une entité exclue du périmètre (Théo p8)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn() }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(undefined),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const runs = { getScopeSelection: jest.fn().mockResolvedValue({ excluded_entities: ['TF1 PUB'] }) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      runs as never,
    )

    const result = await service.enrichContacts('acc-1', 'u-1', { entity: 'TF1 PUB SA' })

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('precondition_failed')
    // La collecte n'est jamais partie : ni appel Apollo/LLM, ni persistance.
    expect(ia.contacts).not.toHaveBeenCalled()
    expect(persistence.saveContacts).not.toHaveBeenCalled()
  })

  it('laisse passer une recherche ciblée hors des exclusions (byte-identique)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { contacts: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveContacts: jest.fn().mockResolvedValue(undefined),
      saveContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
    }
    const runs = { getScopeSelection: jest.fn().mockResolvedValue({ excluded_entities: ['TF1 PUB'] }) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      runs as never,
    )

    const result = await service.enrichContacts('acc-1', 'u-1', { entity: 'Newen' })

    expect(isSuccess(result)).toBe(true)
    expect(ia.contacts).toHaveBeenCalledTimes(1)
  })
})

describe('AnalysisOnDemandService.generateAttackAngle', () => {
  const angleAccount = {
    id: 'acc-1',
    user_id: 'u-1',
    company_name: 'Société Générale',
    status: 'completed',
    raw_analysis: { sector: 'Banque' },
  } as unknown as AccountEntity

  function build(researchData: Record<string, unknown>, appendResult: Record<string, unknown> | null) {
    const accounts = {
      findOne: jest.fn().mockResolvedValue(success(angleAccount)),
      refreshResearch: jest.fn().mockResolvedValue(undefined),
      appendUserAttackAngle: jest.fn().mockResolvedValue(appendResult),
    }
    const contacts = { findByAccount: jest.fn() }
    const ia = { research: jest.fn().mockResolvedValue({ data: researchData }) }
    const persistence = { saveResearch: jest.fn() }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )
    return { service, accounts, ia }
  }

  it('relance la phase 1 et ACCUMULE l’angle recommandé frais dans le dossier', async () => {
    const fresh = {
      sector: 'Banque',
      angles: [
        {
          title: 'Modernisation cœur bancaire',
          description: '',
          strategy: 'Attaquer le legacy',
          entry_contact_persona: 'DSI',
        },
      ],
    }
    // Après append, l'angle figure dans user_attack_angles (compté +1).
    const { service, accounts, ia } = build(fresh, {
      raw_analysis: { user_attack_angles: [{ title: 'Modernisation cœur bancaire' }] },
    })

    const result = await service.generateAttackAngle('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) {
      expect(result.output.angle.title).toBe('Modernisation cœur bancaire')
      expect(result.output.angle.entry_point).toBe('DSI')
      expect(result.output.angle.description).toBe('Attaquer le legacy')
      expect(result.output.added).toBe(true)
    }
    // La recherche fraîche a bien été re-persistée (rien de gaspillé) puis l'angle ajouté.
    expect(ia.research).toHaveBeenCalledTimes(1)
    expect(accounts.refreshResearch).toHaveBeenCalledTimes(1)
    expect(accounts.appendUserAttackAngle).toHaveBeenCalledWith(
      'acc-1',
      'u-1',
      expect.objectContaining({ title: 'Modernisation cœur bancaire', entry_point: 'DSI', recommended: false }),
    )
  })

  it('échoue proprement quand l’IA ne remonte aucun angle (jamais inventé)', async () => {
    const { service, accounts } = build({ sector: 'Banque', angles: [] }, null)

    const result = await service.generateAttackAngle('acc-1', 'u-1')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('ia_failed')
    expect(accounts.appendUserAttackAngle).not.toHaveBeenCalled()
  })

  it('signale added=false quand l’angle était déjà présent (dédup)', async () => {
    const fresh = {
      sector: 'Banque',
      // Déjà présent avant l'append : le compte reste à 1 occurrence (dédup SQL).
      user_attack_angles: [{ title: 'Refonte data' }],
      angles: [{ title: 'Refonte data', description: 'x', strategy: '', entry_contact_persona: '' }],
    }
    const { service } = build(fresh, { raw_analysis: { user_attack_angles: [{ title: 'Refonte data' }] } })

    const result = await service.generateAttackAngle('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output.added).toBe(false)
  })
})

describe('AnalysisOnDemandService.recomputeOrgPath', () => {
  const account = { id: 'acc-1', company_name: 'TF1' } as never

  it('réordonne le chemin sans aucun appel IA ni recherche', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const ia = { contacts: jest.fn(), classify: jest.fn(), research: jest.fn(), plan: jest.fn() }
    const orgGraph = { recomputePath: jest.fn().mockResolvedValue({ graphVersion: 4, steps: 3 }) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      {} as unknown as ContactsService,
      ia as unknown as IaClient,
      {} as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined,
      undefined,
      undefined,
      undefined,
      orgGraph as never,
    )

    const result = await service.recomputeOrgPath('acc-1', 'u-1')

    expect(result).toEqual(success({ graphVersion: 4, steps: 3 }))
    expect(orgGraph.recomputePath).toHaveBeenCalledWith('acc-1')
    // Le point de la feature : aucune phase IA n'est relancée.
    expect(ia.contacts).not.toHaveBeenCalled()
    expect(ia.classify).not.toHaveBeenCalled()
    expect(ia.research).not.toHaveBeenCalled()
  })

  it("refuse explicitement quand il n'y a rien à réordonner (jamais un faux succès)", async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const orgGraph = { recomputePath: jest.fn().mockResolvedValue(null) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      {} as unknown as ContactsService,
      {} as unknown as IaClient,
      {} as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined,
      undefined,
      undefined,
      undefined,
      orgGraph as never,
    )

    const result = await service.recomputeOrgPath('acc-1', 'u-1')

    expect(isFailure(result)).toBe(true)
    expect(isFailure(result) && result.problem.code).toBe('precondition_failed')
  })
})

describe('AnalysisOnDemandService.replan', () => {
  it('re-runs Phase 4 with the strategy scope, reusing stored research + contacts', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest
        .fn()
        .mockResolvedValue([
          { full_name: 'Ivan', title: 'CTO', entity: 'ITIM', decision_role: 'technical', priority: 1 },
        ]),
    }
    const ia = { plan: jest.fn().mockResolvedValue({ data: { actionPlan: {} } }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const esnProfile = {
      getAnswers: jest.fn().mockResolvedValue({
        esn_name: 'Louis Consulting',
        expertise_areas: [],
        target_sectors: [],
        target_company_types: [],
        geo_zones: [],
      }),
      resolveProfileData: jest.fn().mockResolvedValue(
        esnAnswersToProfileData({
          esn_name: 'Louis Consulting',
          expertise_areas: [],
          target_sectors: [],
          target_company_types: [],
          geo_zones: [],
        } as unknown as EsnAnswers),
      ),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfile as unknown as EsnProfileReader,
    )

    const strategy = { angle: 'Cyber NIS2', entryMode: 'top_down' as const, focusEntity: 'Boursorama' }
    const result = await service.replan('acc-1', 'u-1', strategy)

    expect(isSuccess(result)).toBe(true)
    // The chosen strategy is threaded through to Phase 4; research + contacts are
    // reused (no re-run of phase 1/2).
    expect(ia.plan).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1', userId: 'u-1', strategyScope: strategy }),
      { timeoutMs: PHASE_TIMEOUT_MS.plan, maxAttempts: 1 },
    )
    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1') // profil re-dérivé, portefeuille compris
    expect(persistence.savePlan).toHaveBeenCalledWith('acc-1', 'u-1', { actionPlan: {} })
  })

  // #4070.2/.4 — le re-plan à la demande (« changer de stratégie ») repartait sans
  // l'historique du compte : seul le graphe complet (lancement + reprise) le portait.
  // Même lecteur UNIQUE que le lancement (`AnalysisFactsInputsService`).
  it('#4070.2/.4 — envoie les faits du compte, les motifs de perte et l’analyse précédente', async () => {
    const withWorkspace = { ...account, workspace_id: 'ws-1' }
    const accounts = { findOne: jest.fn().mockResolvedValue(success(withWorkspace)) }
    const contacts = { findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Ivan', title: 'CTO' }]) }
    const ia = { plan: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
    const factsInputs = {
      accountFacts: jest.fn().mockResolvedValue({
        accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
        lostDealRex: 'Perte du 2024-06-01 — motif déclaré : prix.',
      }),
      previousAnalysis: jest.fn().mockResolvedValue('Analyse du 2026-06-18'),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfile as unknown as EsnProfileReader,
      undefined, // accountFeedback
      undefined, // workspaceContext
      undefined, // crmRead
      undefined, // signalHistory
      undefined, // orgGraph
      undefined, // runs
      undefined, // credits
      undefined, // orgRebuildQueue
      undefined, // marketMemory
      undefined, // relationAxis
      undefined, // sellerHypothesesReader
      factsInputs as unknown as AnalysisFactsInputsService,
    )

    await service.replan('acc-1', 'u-1')

    expect(factsInputs.accountFacts).toHaveBeenCalledWith({ workspaceId: 'ws-1', accountId: 'acc-1', userId: 'u-1' })
    expect(ia.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
        lostDealRex: 'Perte du 2024-06-01 — motif déclaré : prix.',
        previousAnalysis: 'Analyse du 2026-06-18',
      }),
      expect.anything(),
    )
  })

  it('#4070.2/.4 — NON : sans espace sur le compte ou sans lecteur, aucune des trois clés', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) } // pas de workspace_id
    const contacts = { findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Ivan', title: 'CTO' }]) }
    const ia = { plan: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfile as unknown as EsnProfileReader,
    )

    await service.replan('acc-1', 'u-1')

    const input = ia.plan.mock.calls[0]![0]
    expect(input).not.toHaveProperty('accountFacts')
    expect(input).not.toHaveProperty('lostDealRex')
    expect(input).not.toHaveProperty('previousAnalysis')
  })

  // #219.6 (#3231, lot X50) — la déclaration « client interne » vit sur la
  // colonne du compte, pas dans `raw_analysis` : le replan doit la porter, sinon
  // le plan lit un compte sans déclaration alors que la fiche en porte une.
  it('replan porte la déclaration « client interne » du compte dans accountData', async () => {
    const declared = { ...account, declared_internal_client_mode: 'internal_service' }
    const accounts = { findOne: jest.fn().mockResolvedValue(success(declared)) }
    const contacts = { findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Ivan', title: 'CTO' }]) }
    const ia = { plan: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfile as unknown as EsnProfileReader,
    )
    await service.replan('acc-1', 'u-1')
    const [input] = ia.plan.mock.calls[0]!
    expect(input.accountData.declared_internal_client_mode).toBe('internal_service')

    ia.plan.mockClear()
    accounts.findOne.mockResolvedValue(success({ ...account, declared_internal_client_mode: null }))
    await service.replan('acc-1', 'u-1')
    expect(ia.plan.mock.calls[0]![0].accountData).not.toHaveProperty('declared_internal_client_mode')
  })

  // #219.6 (J05) — les quatre rôles nommés à la main suivent la déclaration ; un rôle vide est OMIS.
  it('replan porte les rôles nommés de la direction interne, et omet ceux qui ne le sont pas', async () => {
    const declared = {
      ...account,
      declared_internal_client_mode: 'internal_service',
      declared_internal_sponsor: 'Direction Digital France',
      declared_internal_users: null,
      declared_legal_entity: 'SNCF Voyageurs',
      declared_end_client: '',
    }
    const accounts = { findOne: jest.fn().mockResolvedValue(success(declared)) }
    const contacts = { findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Ivan', title: 'CTO' }]) }
    const ia = { plan: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfile as unknown as EsnProfileReader,
    )
    await service.replan('acc-1', 'u-1')
    const data = ia.plan.mock.calls[0]![0].accountData
    expect(data.declared_internal_sponsor).toBe('Direction Digital France')
    expect(data.declared_legal_entity).toBe('SNCF Voyageurs')
    expect(data).not.toHaveProperty('declared_internal_users')
    expect(data).not.toHaveProperty('declared_end_client')
  })

  // #219.8 (#3231, lot X50) — la relation personne↔entreprise DÉCLARÉE rejoint
  // les contacts du plan (aspect « plan de compte ») ; non déclarée = aucune clé.
  it('replan porte la relation déclarée de chaque contact, sans clé quand elle ne l’est pas', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([
        { full_name: 'Camille', title: 'DSI', declared_person_company_relation: 'employee_former' },
        { full_name: 'Alix', title: 'CTO', declared_person_company_relation: null },
      ]),
    }
    const ia = { plan: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue({}) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfile as unknown as EsnProfileReader,
    )
    await service.replan('acc-1', 'u-1')
    const sent = ia.plan.mock.calls[0]![0].contacts
    expect(sent[0].declaredPersonCompanyRelation).toBe('employee_former')
    expect(sent[1]).not.toHaveProperty('declaredPersonCompanyRelation')
  })

  it('refuses to re-plan an account that has no completed analysis (no fictional plan)', async () => {
    const pending = { ...account, status: 'analyzing' }
    const accounts = { findOne: jest.fn().mockResolvedValue(success(pending)) }
    const contacts = { findByAccount: jest.fn().mockResolvedValue([]) }
    const ia = { plan: jest.fn() }
    const persistence = { savePlan: jest.fn() }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.replan('acc-1', 'u-1')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('precondition_failed')
    expect(ia.plan).not.toHaveBeenCalled() // no LLM call, no force-complete
    expect(persistence.savePlan).not.toHaveBeenCalled()
  })
})

describe('AnalysisOnDemandService.enrichOrganigram', () => {
  it('calls Phase-3 with the classify phase budget and a single attempt', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Jane Doe', title: 'CTO', source: 'apollo' }]),
    }
    const ia = { classify: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    await service.enrichOrganigram('acc-1', 'u-1')

    expect(ia.classify).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1' }), {
      timeoutMs: PHASE_TIMEOUT_MS.classify,
      maxAttempts: 1,
    })
  })

  // SIMON-FIX S.18 — recette Simon 20/10 : 976 contacts avant l'actualisation, « 879 classés sur 1046 »
  // après. `findByAccount` rend aussi les contacts ÉCARTÉS (périmètre, homonymes) : le dénominateur du
  // toast les comptait, l'écran non. UNE source de compte : les contacts écartés ne sont ni classés ni comptés.
  it('SIMON-FIX S.18 — un contact écarté n’est ni envoyé à la classification ni compté dans le total', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([
        { id: 'c1', full_name: 'Jane Doe', title: 'CTO', source: 'apollo', excluded_at: null },
        {
          id: 'c2',
          full_name: 'Ravi Kumar',
          title: 'CIO',
          source: 'apollo',
          excluded_at: new Date('2026-10-19T08:00:00Z'),
        },
      ]),
    }
    const ia = {
      classify: jest.fn().mockResolvedValue({ data: { contacts: [{ fullName: 'Jane Doe' }] } }),
    }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(false),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichOrganigram('acc-1', 'u-1')

    const sent = (ia.classify.mock.calls[0][0] as { contacts: { fullName: string }[] }).contacts
    expect(sent.map(seed => seed.fullName)).toEqual(['Jane Doe'])
    expect(isFailure(result)).toBe(false)
    if (!isFailure(result)) expect(result.output.total).toBe(1)
  })

  it('tells Phase-3 who is SELLING — the target is not the seller profile', async () => {
    // Sans ce profil, le bloc « PROFIL ESN » des prompts système décrivait le compte
    // analysé (profileData = son raw_analysis) et le boost vendeur du /100 notait
    // contre un profil sans expertise déclarée (annexe méthodo p3-4).
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Jane Doe', title: 'RSSI', source: 'apollo' }]),
    }
    const ia = { classify: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(undefined),
    }
    const seller = { companyName: 'Louis Consulting', offers: ['cybersécurité'] }
    const esnProfile = {
      getAnswers: jest.fn(),
      resolveProfileData: jest.fn().mockResolvedValue(seller),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfile as unknown as EsnProfileReader,
    )

    await service.enrichOrganigram('acc-1', 'u-1')

    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('u-1')
    const payload = ia.classify.mock.calls[0][0] as { esnProfile: unknown; profileData: unknown }
    expect(payload.esnProfile).toEqual(seller)
    // Le compte analysé reste la matière du user prompt — il n'usurpe plus le vendeur.
    expect(payload.profileData).toEqual(account.raw_analysis ?? {})
  })

  it('persiste le graphe reconstruit dans raw_analysis.org', async () => {
    // Sans cette écriture, la phase 3 à la demande classait les contacts mais
    // laissait la carte d'influence sur le graphe du run initial : les zones
    // blanches restaient ouvertes et les contacts trouvés depuis n'y figuraient
    // jamais, quel que soit le nombre de recherches ciblées lancées.
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Jane Doe', title: 'CTO', source: 'apollo' }]),
    }
    const orgGraphPayload = { organigramme: [{ entity: 'ACME' }], orgGraph: { graphVersion: 2, people: [] } }
    const ia = {
      classify: jest.fn().mockResolvedValue({ data: { contacts: [], org_graph: orgGraphPayload } }),
    }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    await service.enrichOrganigram('acc-1', 'u-1')

    // Un run COMPLET ne nomme aucune personne touchée : `saveOrgChart` reste un
    // remplacement, comme avant la fusion par delta. C'est la vague CIBLÉE qui
    // fusionne (voir `enrichOrganigramWave`).
    expect(persistence.saveOrgChart).toHaveBeenCalledWith('acc-1', orgGraphPayload, { touchedPersonIds: [] })
  })

  it('repart de la mémoire du graphe — un contact écarté ne peut pas revenir', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Jane Doe', title: 'CTO', source: 'apollo' }]),
    }
    const ia = { classify: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(undefined),
    }
    const rejectedItems = [{ sourceId: 'p-jean-dupont', reason: 'signalé parti' }]
    const orgGraph = { memoryFor: jest.fn().mockResolvedValue({ graphVersion: 4, rejectedItems }) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined,
      undefined,
      undefined,
      undefined,
      orgGraph as unknown as OrgGraphVersionService,
    )

    await service.enrichOrganigram('acc-1', 'u-1')

    const payload = ia.classify.mock.calls[0][0] as { orgGraphVersion?: number; orgRejectedItems?: unknown }
    expect(payload.orgGraphVersion).toBe(4)
    expect(payload.orgRejectedItems).toEqual(rejectedItems)
  })

  // #2755 — Louis (beta, 23/09) : « il n'y avait pas d'organigramme alors que
  // c'est obligatoire », après un clic « Enrichir la carte ». `saveOrgChart`
  // no-op silencieusement quand l'IA n'assemble aucun graphe cette fois — le
  // seul moyen pour l'appelant (le toast, l'écran) de le SAVOIR au lieu de
  // dire « organigramme mis à jour » sur un onglet resté vide.
  it("#2755 — signale orgGraphUpdated=false quand la phase 3 classe des contacts mais n'assemble AUCUN graphe", async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Jane Doe', title: 'CTO', source: 'apollo' }]),
    }
    const ia = { classify: jest.fn().mockResolvedValue({ data: { contacts: [{ fullName: 'Jane Doe' }] } }) }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(false),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichOrganigram('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) {
      expect(result.output.matched).toBe(1)
      expect(result.output.orgGraphUpdated).toBe(false)
    }
  })

  it('#2755 — signale orgGraphUpdated=true quand un graphe a réellement été écrit', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Jane Doe', title: 'CTO', source: 'apollo' }]),
    }
    const ia = {
      classify: jest.fn().mockResolvedValue({ data: { contacts: [], org_graph: { orgGraph: { people: [] } } } }),
    }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(true),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichOrganigram('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output.orgGraphUpdated).toBe(true)
  })
})

describe('AnalysisOnDemandService.enrichOrganigramWave', () => {
  it('ne classe QUE les contactIds demandés — jamais tout le compte (§11 : pas de full rerun)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([
        { id: 'c1', full_name: 'Jane Doe', title: 'CTO', source: 'apollo' },
        { id: 'c2', full_name: 'John Roe', title: 'RSSI', source: 'apollo' },
        { id: 'c3', full_name: 'Jim Poe', title: 'DAF', source: 'apollo' },
      ]),
    }
    const ia = { classify: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichOrganigramWave('acc-1', 'u-1', ['c1', 'c3'])

    expect(isSuccess(result)).toBe(true)
    const payload = ia.classify.mock.calls[0][0] as { contacts: Array<{ fullName: string }> }
    expect(payload.contacts.map(c => c.fullName).sort()).toEqual(['Jane Doe', 'Jim Poe'])
    if (isSuccess(result)) expect(result.output).toEqual({ matched: 0, total: 2 })
    // Et le graphe de la vague est FUSIONNÉ, pas écrit tel quel : sans ces ids,
    // un lot de 2 remplacerait le graphe entier du compte.
    expect(persistence.saveOrgChart).toHaveBeenCalledWith('acc-1', undefined, {
      touchedPersonIds: ['p-jane-doe', 'p-jim-poe'],
    })
  })

  it('refuse un lot vide — aucun appel IA sur zéro contact', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = { findByAccount: jest.fn().mockResolvedValue([{ id: 'c1', full_name: 'Jane Doe' }]) }
    const ia = { classify: jest.fn() }
    const persistence = { saveEnriched: jest.fn(), saveOrgChart: jest.fn() }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichOrganigramWave('acc-1', 'u-1', ['nobody-here'])

    expect(isFailure(result)).toBe(true)
    expect(ia.classify).not.toHaveBeenCalled()
  })

  it('refuse un compte introuvable, comme enrichOrganigram', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(failure({ code: 'not_found', message: 'gone' })) }
    const contacts = { findByAccount: jest.fn() }
    const ia = { classify: jest.fn() }
    const persistence = { saveEnriched: jest.fn(), saveOrgChart: jest.fn() }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.enrichOrganigramWave('acc-x', 'u-1', ['c1'])

    expect(isFailure(result)).toBe(true)
    expect(contacts.findByAccount).not.toHaveBeenCalled()
  })
})

describe('AnalysisOnDemandService — mémoire de corrections (feedback loop A2)', () => {
  const directives = "- [contact] « Jean Dupont » signalé OBSOLÈTE par l'utilisateur (2026-07-10)"

  function feedbackStub(value: string) {
    return { directivesFor: jest.fn().mockResolvedValue(value) }
  }

  // replan passe par esnAnswersToProfileData, qui exige les champs tableaux.
  const answeredProfileStub = () =>
    ({
      getAnswers: jest.fn().mockResolvedValue({
        esn_name: 'Louis Consulting',
        expertise_areas: [],
        target_sectors: [],
        target_company_types: [],
        geo_zones: [],
      }),
      resolveProfileData: jest.fn().mockResolvedValue(
        esnAnswersToProfileData({
          esn_name: 'Louis Consulting',
          expertise_areas: [],
          target_sectors: [],
          target_company_types: [],
          geo_zones: [],
        } as unknown as EsnAnswers),
      ),
    }) as unknown as EsnProfileReader

  it('replan reçoit les directives du compte (refresh stratégie du MÊME compte)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Ivan', title: 'CTO', priority: 1 }]),
    }
    const ia = { plan: jest.fn().mockResolvedValue({ data: { actionPlan: {} } }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const feedback = feedbackStub(directives)
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      answeredProfileStub(),
      feedback as never,
    )

    await service.replan('acc-1', 'u-1')

    expect(feedback.directivesFor).toHaveBeenCalledWith({
      accountId: 'acc-1',
      workspaceId: null,
      companyName: 'Société Générale',
    })
    expect(ia.plan).toHaveBeenCalledWith(expect.objectContaining({ accountFeedback: directives }), expect.anything())
  })

  it('enrichOrganigram reçoit les directives (« contact parti » conditionne la re-classification)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Jane Doe', title: 'CTO', source: 'apollo' }]),
    }
    const ia = { classify: jest.fn().mockResolvedValue({ data: { contacts: [] } }) }
    const persistence = {
      saveEnriched: jest.fn().mockResolvedValue(undefined),
      saveOrgChart: jest.fn().mockResolvedValue(undefined),
    }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      feedbackStub(directives) as never,
    )

    await service.enrichOrganigram('acc-1', 'u-1')

    expect(ia.classify).toHaveBeenCalledWith(
      expect.objectContaining({ accountFeedback: directives }),
      expect.anything(),
    )
  })

  it('sans feedback (directives vides), le payload IA reste inchangé (accountFeedback undefined)', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Ivan', title: 'CTO', priority: 1 }]),
    }
    const ia = { plan: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      answeredProfileStub(),
      feedbackStub('') as never,
    )

    await service.replan('acc-1', 'u-1')

    const [input] = ia.plan.mock.calls[0]!
    expect(input.accountFeedback).toBeUndefined()
  })

  it('sans service mémoire branché (constructeur nu), replan fonctionne comme avant', async () => {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(account)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Ivan', title: 'CTO', priority: 1 }]),
    }
    const ia = { plan: jest.fn().mockResolvedValue({ data: {} }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      answeredProfileStub(),
    )

    const result = await service.replan('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    const [input] = ia.plan.mock.calls[0]!
    expect(input.accountFeedback).toBeUndefined()
  })
})

describe('AnalysisOnDemandService — couche zéro CRM / prospection inversée (annexe méthodo p7-p9)', () => {
  const crmSummary = 'CRM HubSpot consulté pour « Société Générale » :\n- 3 contact(s) déjà dans votre CRM'
  const reverseProspects = [{ fullName: 'Claire Dupont', title: 'Architecte', currentCompany: 'Sopra' }]

  // replan passe par esnAnswersToProfileData, qui exige les champs tableaux.
  const answeredProfileStub = () =>
    ({
      getAnswers: jest.fn().mockResolvedValue({
        esn_name: 'Louis Consulting',
        expertise_areas: [],
        target_sectors: [],
        target_company_types: [],
        geo_zones: [],
      }),
      resolveProfileData: jest.fn().mockResolvedValue(
        esnAnswersToProfileData({
          esn_name: 'Louis Consulting',
          expertise_areas: [],
          target_sectors: [],
          target_company_types: [],
          geo_zones: [],
        } as unknown as EsnAnswers),
      ),
    }) as unknown as EsnProfileReader

  function crmStub(summary: string | undefined) {
    return { describeAccountHistory: jest.fn().mockResolvedValue(summary) }
  }

  function buildReplan(
    crm?: { describeAccountHistory: jest.Mock },
    accountRow: AccountEntity = account,
    relationAxis?: { relationSignalsFor: jest.Mock },
  ) {
    const accounts = { findOne: jest.fn().mockResolvedValue(success(accountRow)) }
    const contacts = {
      findByAccount: jest.fn().mockResolvedValue([{ full_name: 'Ivan', title: 'CTO', priority: 1 }]),
    }
    const ia = { plan: jest.fn().mockResolvedValue({ data: { actionPlan: {} } }) }
    const persistence = { savePlan: jest.fn().mockResolvedValue(undefined) }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      ia as unknown as IaClient,
      persistence as unknown as AnalysisPersistenceService,
      answeredProfileStub(),
      undefined,
      undefined,
      crm as never,
      undefined, // signalHistory
      undefined, // orgGraph
      undefined, // runs
      undefined, // credits
      undefined, // orgRebuildQueue
      undefined, // marketMemory
      relationAxis as never,
    )
    return { service, ia }
  }

  it("replan envoie l'historique CRM au plan (plus d'approche froide sur un compte connu)", async () => {
    const crm = crmStub(crmSummary)
    const { service, ia } = buildReplan(crm)

    await service.replan('acc-1', 'u-1')

    expect(crm.describeAccountHistory).toHaveBeenCalledWith('u-1', {
      companyName: 'Société Générale',
      website: null,
      siren: null,
    })
    expect(ia.plan).toHaveBeenCalledWith(expect.objectContaining({ crmPresence: crmSummary }), expect.anything())
  })

  it("replan relit la prospection inversée déjà persistée (un replan n'efface pas l'angle chaud)", async () => {
    const withReverse = {
      ...account,
      raw_analysis: { sector: 'Banque', plan: { reverseProspects } },
    } as unknown as AccountEntity
    const { service, ia } = buildReplan(crmStub(undefined), withReverse)

    await service.replan('acc-1', 'u-1')

    expect(ia.plan).toHaveBeenCalledWith(expect.objectContaining({ reverseProspects }), expect.anything())
  })

  // #3278 (recette prod 14/10) — seule « filiale » sortait : « Changer de stratégie »
  // n'envoyait AUCUN signal de route au plan, qui relisait le SalesContext persisté.
  it('replan envoie au plan les signaux de route relus en base (veille, talent, événement, inbound, signal d’achat)', async () => {
    const relationAxis = {
      relationSignalsFor: jest.fn().mockResolvedValue({
        routeSignals: { event_community: true },
        declaredSignalPresent: true,
        consultantHistory: 'former',
        declaredPartners: ['Alten'],
      }),
    }
    const { service, ia } = buildReplan(crmStub(undefined), account, relationAxis)

    await service.replan('acc-1', 'u-1')

    expect(ia.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        routeSignals: { event_community: true },
        declaredSignalPresent: true,
        consultantHistory: 'former',
        declaredPartners: ['Alten'],
      }),
      expect.anything(),
    )
  })

  it('replan sans aucun signal en base : aucune clé de route dans le payload plan', async () => {
    const { service, ia } = buildReplan(crmStub(undefined), account, {
      relationSignalsFor: jest.fn().mockResolvedValue({}),
    })

    await service.replan('acc-1', 'u-1')

    const [input] = ia.plan.mock.calls[0]!
    expect(input.routeSignals).toBeUndefined()
    expect(input.declaredSignalPresent).toBeUndefined()
  })

  it('sans CRM connecté (aucun match) et sans historique, le payload plan est inchangé', async () => {
    const { service, ia } = buildReplan(crmStub(undefined))

    await service.replan('acc-1', 'u-1')

    const [input] = ia.plan.mock.calls[0]!
    expect(input.crmPresence).toBeUndefined()
    expect(input.reverseProspects).toBeUndefined()
  })

  it('sans service CRM branché (constructeur nu), replan fonctionne comme avant', async () => {
    const { service, ia } = buildReplan(undefined)

    const result = await service.replan('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    const [input] = ia.plan.mock.calls[0]!
    expect(input.crmPresence).toBeUndefined()
  })

  it("un « Actualiser » (phase 1) renvoie aussi l'historique — sinon le compte retomberait « froid »", async () => {
    const accounts = {
      findOne: jest.fn().mockResolvedValue(success(account)),
      refreshResearch: jest.fn().mockResolvedValue(undefined),
    }
    const ia = { research: jest.fn().mockResolvedValue({ data: { sector: 'Banque' } }) }
    const crm = crmStub(crmSummary)
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      { findByAccount: jest.fn() } as unknown as ContactsService,
      ia as unknown as IaClient,
      { saveResearch: jest.fn() } as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined,
      undefined,
      crm as never,
    )

    await service.refreshResearch('acc-1', 'u-1')

    expect(ia.research).toHaveBeenCalledWith(expect.objectContaining({ crmPresence: crmSummary }), expect.anything())
  })
})

describe('AnalysisOnDemandService.verifyOrgRelation', () => {
  const account = { id: 'acc-1', company_name: 'TF1' } as never
  const edge = { fromId: 'p-marc', toId: 'p-claire', type: 'reports_to' as const }
  const target = { company: 'TF1', website: 'https://tf1.fr', fromName: 'Marc Oliveira', toName: 'Claire Basset' }

  function build(orgGraph: unknown, ia: unknown, credits?: unknown) {
    return new AnalysisOnDemandService(
      { findOne: jest.fn().mockResolvedValue(success(account)) } as unknown as AccountsService,
      {} as unknown as ContactsService,
      ia as unknown as IaClient,
      {} as unknown as AnalysisPersistenceService,
      esnProfileStub(),
      undefined,
      undefined,
      undefined,
      undefined,
      orgGraph as never,
      undefined,
      credits as never,
    )
  }

  /** Un double de crédits qui accepte tout — on vérifie QUAND il est appelé. */
  function creditsStub() {
    return { consumeAnalysisSlot: jest.fn().mockResolvedValue({ ok: true, used: 1, limit: 100 }) }
  }

  it('le débit vient APRÈS la preuve : trouvée et appliquée ⇒ 1 crédit (§9, P1-03)', async () => {
    const orgGraph = {
      relationToVerify: jest.fn().mockResolvedValue(target),
      applyRelationVerification: jest.fn().mockResolvedValue({ graphVersion: 5, verified: true, confidence: 92 }),
    }
    const sources = [{ id: 's-0', kind: 'official_site', grounding: 'A', date: '2026-07-23' }]
    const ia = { verifyRelation: jest.fn().mockResolvedValue({ verified: true, confidence: 92, sources }) }
    const credits = creditsStub()

    await build(orgGraph, ia, credits).verifyOrgRelation('acc-1', 'u-1', edge)

    expect(credits.consumeAnalysisSlot).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ accountId: 'acc-1', cost: 1 }),
    )
  })

  it('sans preuve, la recherche a tourné mais rien n’est débité', async () => {
    // Facturer serait faire payer une QUESTION et non une réponse — le reproche
    // déjà corrigé sur l'enrichissement.
    const orgGraph = { relationToVerify: jest.fn().mockResolvedValue(target), applyRelationVerification: jest.fn() }
    const ia = { verifyRelation: jest.fn().mockResolvedValue({ verified: false, confidence: null, sources: [] }) }
    const credits = creditsStub()

    const result = await build(orgGraph, ia, credits).verifyOrgRelation('acc-1', 'u-1', edge)

    expect(credits.consumeAnalysisSlot).not.toHaveBeenCalled()
    expect(isSuccess(result)).toBe(true)
  })

  it('un débit raté ne défait pas une vérification acquise', async () => {
    // Le déséquilibre penche du bon côté : on perd un crédit, jamais une preuve.
    const orgGraph = {
      relationToVerify: jest.fn().mockResolvedValue(target),
      applyRelationVerification: jest.fn().mockResolvedValue({ graphVersion: 5, verified: true, confidence: 92 }),
    }
    const ia = {
      verifyRelation: jest.fn().mockResolvedValue({ verified: true, confidence: 92, sources: [{ id: 's' }] }),
    }
    const credits = { consumeAnalysisSlot: jest.fn().mockRejectedValue(new Error('pg down')) }

    const result = await build(orgGraph, ia, credits).verifyOrgRelation('acc-1', 'u-1', edge)
    expect(isSuccess(result)).toBe(true)
  })

  it('écrit le verdict sur le lien quand la preuve existe', async () => {
    const orgGraph = {
      relationToVerify: jest.fn().mockResolvedValue(target),
      applyRelationVerification: jest.fn().mockResolvedValue({ graphVersion: 5, verified: true, confidence: 92 }),
    }
    const sources = [{ id: 's-verify-0', kind: 'official_site', grounding: 'A', date: '2026-07-23' }]
    const ia = { verifyRelation: jest.fn().mockResolvedValue({ verified: true, confidence: 92, sources }) }

    const result = await build(orgGraph, ia).verifyOrgRelation('acc-1', 'u-1', edge)

    expect(result).toEqual(success({ found: true, graphVersion: 5, verified: true, confidence: 92 }))
    // Les NOMS envoyés à la recherche viennent du graphe stocké, pas du client.
    expect(ia.verifyRelation).toHaveBeenCalledWith({
      company: 'TF1',
      fromName: 'Marc Oliveira',
      toName: 'Claire Basset',
      website: 'https://tf1.fr',
    })
  })

  it('sans preuve, ne touche pas au graphe et ne se présente pas comme une erreur', async () => {
    const orgGraph = {
      relationToVerify: jest.fn().mockResolvedValue(target),
      applyRelationVerification: jest.fn(),
    }
    const ia = { verifyRelation: jest.fn().mockResolvedValue({ verified: false, confidence: null, sources: [] }) }

    const result = await build(orgGraph, ia).verifyOrgRelation('acc-1', 'u-1', edge)

    expect(result).toEqual(success({ found: false, verified: false, confidence: null, graphVersion: null }))
    expect(orgGraph.applyRelationVerification).not.toHaveBeenCalled()
  })

  it('refuse un lien introuvable ou déjà vérifié, sans appeler la recherche', async () => {
    const orgGraph = { relationToVerify: jest.fn().mockResolvedValue(null), applyRelationVerification: jest.fn() }
    const ia = { verifyRelation: jest.fn() }

    const result = await build(orgGraph, ia).verifyOrgRelation('acc-1', 'u-1', edge)

    expect(isSuccess(result)).toBe(false)
    expect(ia.verifyRelation).not.toHaveBeenCalled()
  })
})

/**
 * LOT (15/10) DATA-C — le refresh NOCTURNE de la veille passe en voie « lot »
 * (Message Batches côté IA, moitié prix) : il le demande par `llmLane`, et son
 * budget réseau s'allonge de ce que le lot peut attendre avant le repli
 * synchrone. Le bouton « Actualiser » (sans option) reste à l'octet près.
 */
describe('AnalysisOnDemandService.refreshResearch — voie « lot » du nocturne (DATA-C)', () => {
  it('sans option : budget phase 1, aucune voie', async () => {
    const { service, ia } = buildService({})
    await service.refreshResearch('acc-1', 'u-1')
    expect(ia.research.mock.calls[0]?.[1]).toEqual({ timeoutMs: PHASE_TIMEOUT_MS.research, maxAttempts: 1 })
  })

  it('voie lot : en-tête demandé et budget allongé de BATCH_LANE_EXTRA_MS', async () => {
    const { service, ia } = buildService({})
    await service.refreshResearch('acc-1', 'u-1', { llmLane: 'batch' })
    expect(ia.research.mock.calls[0]?.[1]).toEqual({
      timeoutMs: PHASE_TIMEOUT_MS.research + BATCH_LANE_EXTRA_MS,
      maxAttempts: 1,
      llmLane: 'batch',
    })
  })
})

// #4687 — le rejeu CIBLÉ du segment relit l'historique interne avec l'ESPACE DU COMPTE ; un « Actualiser » ne le relit pas.
describe('AnalysisOnDemandService.refreshResearch — historique interne du rejeu ciblé (#4687)', () => {
  function withHistory(describeInternalHistory: jest.Mock) {
    const ctx = buildService({})
    Object.assign(ctx.service, { internalHistorySource: { describeInternalHistory } })
    return ctx
  }

  it('relit l’historique avec le workspace_id du COMPTE et l’envoie à la recherche', async () => {
    const describeInternalHistory = jest.fn().mockResolvedValue('ATS (BoondManager) :\n- Affaire : Refonte SI')
    const { service, ia } = withHistory(describeInternalHistory)
    await service.refreshResearch('acc-1', 'u-1', { internalHistory: true })
    expect(describeInternalHistory).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ accountId: 'acc-1', workspaceId: 'ws-1' }),
    )
    expect(ia.research.mock.calls[0]![0]).toMatchObject({
      internalHistory: 'ATS (BoondManager) :\n- Affaire : Refonte SI',
    })
  })

  it('REFUS : sans l’option, l’historique n’est PAS relu (aucun appel Drive, e-mail ni ATS)', async () => {
    const describeInternalHistory = jest.fn().mockResolvedValue('x')
    const { service, ia } = withHistory(describeInternalHistory)
    await service.refreshResearch('acc-1', 'u-1')
    expect(describeInternalHistory).not.toHaveBeenCalled()
    expect(ia.research.mock.calls[0]![0]).not.toHaveProperty('internalHistory')
  })

  it('une lecture d’historique qui explose ne fait pas échouer le rejeu : la clé est omise', async () => {
    const { service, ia } = withHistory(jest.fn().mockRejectedValue(new Error('ATS down')))
    const result = await service.refreshResearch('acc-1', 'u-1', { internalHistory: true })
    expect(isSuccess(result)).toBe(true)
    expect(ia.research.mock.calls[0]![0]).not.toHaveProperty('internalHistory')
  })

  it('un historique vide (aucune trouvaille) n’envoie aucune clé', async () => {
    const { service, ia } = withHistory(jest.fn().mockResolvedValue(undefined))
    await service.refreshResearch('acc-1', 'u-1', { internalHistory: true })
    expect(ia.research.mock.calls[0]![0]).not.toHaveProperty('internalHistory')
  })
})
