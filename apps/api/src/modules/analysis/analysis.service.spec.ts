import { Test } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { type EsnAnswers, type LayerVersions, esnAnswersToProfileData } from '@bellum/contracts'
import { failure, isFailure, isSuccess, success } from '@bellum/utils'
import { ChannelPerformanceReaderService } from './channel-performance-reader.service'
import { AnalysisService } from './analysis.service'
import { AccountFeedbackService } from '../account-feedback/account-feedback.service'
import { AnalysisCancellationService } from './analysis-cancellation.service'
import { AnalysisCheckpointReader } from './analysis-checkpoint.reader'
import { AnalysisPersistenceService } from './analysis.persistence'
import { AnalysisRunsService } from './analysis-runs.service'
import { JOB_TIMEOUT_MS } from './analysis.constants'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { CreditsService, resolveAnalysisCost } from '../credits/credits.service'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmReadService } from '../crm/crm-read.service'
import { AnalysisFactsInputsService } from './analysis-facts-inputs.service'
import { WorkspaceMarketService } from '../workspace/workspace-market.service'
import { MARKET_PATH_AXIS_SOURCE } from './market-path-axis-source'
import { AnalysisAttachmentBinderService } from './analysis-attachment-binder.service'
import { RelationAxisReaderService } from './relation-axis-reader.service'
import { SellerHypothesesReader, type SellerHypothesesForRun } from './seller-hypotheses.reader'
import type { AccountEntity } from '../../database/entities/account.entity'

type SlotResult = { ok: boolean; used: number; limit: number }

/** Nest DI needs CreditsService wherever AnalysisService is built. Defaults to a
 *  free slot available so the happy path proceeds; override to test the cap. */
function creditsProvider(slot: SlotResult = { ok: true, used: 1, limit: 3 }, outstandingDebit = true) {
  return {
    provide: CreditsService,
    useValue: {
      consumeAnalysisSlot: jest.fn().mockResolvedValue(slot),
      refundAnalysisSlot: jest.fn().mockResolvedValue(undefined),
      attachAnalysisDebit: jest.fn().mockResolvedValue(undefined),
      // Par défaut le run en cours est encore payé : reprendre est gratuit.
      hasOutstandingAnalysisDebit: jest.fn().mockResolvedValue(outstandingDebit),
    },
  }
}

/** A fully-unanswered questionnaire → derives to a profile-neutral `{}`. */
const EMPTY_ANSWERS: EsnAnswers = {
  esn_name: null,
  consultant_size: null,
  sales_team_size: null,
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
  // Ajoutée par `1aa0f95e` avec le champ du questionnaire, et oubliée ici : le
  // type l'exige, donc la suite `api` était ROUGE sur `main`. `null` est bien
  // la valeur d'un questionnaire sans réponse — c'est tout ce que cette
  // fixture prétend représenter.
  recruits_for_clients: null,
  // Lot 26 — champs additifs, non pertinents pour ce test.
  service_types: [],
  service_types_proven: [],
  service_types_desired: [],
  reference_sectors: [],
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
  priority_sectors: [],
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
  company_locations: [],
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais nombres.
  consultant_count: null,
  annual_revenue_amount: null,
  annual_revenue_period: null,
  // #2640.2 — le site de l'entreprise.
  esn_website: null,
}

/** Nest DI needs the provider present wherever AnalysisService is built. */
function esnProfileProvider(answers: EsnAnswers = EMPTY_ANSWERS, layerVersions?: LayerVersions | Error) {
  // `resolveProfileData` dérive des MÊMES réponses : le mock reste une seule
  // vérité, et un test qui règle les réponses règle aussi le profil résolu.
  return {
    provide: EsnProfileReader,
    useValue: {
      getAnswers: jest.fn().mockResolvedValue(answers),
      resolveProfileData: jest.fn(async () => esnAnswersToProfileData(answers)),
      // #2005.11 — absent par défaut, comme `getProfileVersions` : le service
      // doit tenir sans lui.
      ...(layerVersions === undefined
        ? {}
        : {
            getLayerVersions: jest.fn(async () => {
              if (layerVersions instanceof Error) throw layerVersions
              return layerVersions
            }),
          }),
    },
  }
}

type RunsMock = {
  recordStart: jest.Mock<Promise<string | null>, [unknown]>
  completeLatest: jest.Mock<Promise<void>, [string, unknown]>
  listForAccount: jest.Mock<Promise<unknown[]>, [string]>
  // Snapshot du profil vendeur par run (reproductibilité d'un resume) : le
  // service les appelle sur les DEUX chemins `start` et `resume`, donc un stub
  // qui les omet fait échouer des tests qui ne parlent pas de facturation.
  recordSellerContext: jest.Mock<Promise<void>, [string, unknown]>
  recordProfileProvenance: jest.Mock<Promise<void>, [string, unknown]>
  getSellerContext: jest.Mock<Promise<Record<string, unknown> | null>, [string]>
  // Frontière du run courant : c'est elle qui empêche `getStatus` de lire les
  // points de contrôle du run PRÉCÉDENT (le `jobId` est déterministe).
  latestStartedAt: jest.Mock<Promise<Date | null>, [string]>
}

/** Append-only run history (Théo P0) — mocked so `start`/`cancelByUser` can log
 *  a run without a DB. Defaults to inert; tests pass their own to assert calls. */
function runsServiceMock(): RunsMock {
  return {
    recordStart: jest.fn<Promise<string | null>, [unknown]>().mockResolvedValue(null),
    completeLatest: jest.fn<Promise<void>, [string, unknown]>().mockResolvedValue(undefined),
    listForAccount: jest.fn<Promise<unknown[]>, [string]>().mockResolvedValue([]),
    recordSellerContext: jest.fn<Promise<void>, [string, unknown]>().mockResolvedValue(undefined),
    recordProfileProvenance: jest.fn<Promise<void>, [string, unknown]>().mockResolvedValue(undefined),
    // `null` = aucun snapshot pour ce compte → le service retombe sur le profil
    // courant, exactement comme un run antérieur à la colonne.
    getSellerContext: jest.fn<Promise<Record<string, unknown> | null>, [string]>().mockResolvedValue(null),
    // Un run en cours, démarré il y a une heure : le défaut « il y a bien un
    // run courant », pour que les tests de position lisent les checkpoints.
    latestStartedAt: jest.fn<Promise<Date | null>, [string]>().mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000)),
  }
}

interface JobAddData {
  accountId: string
  userId: string
  companyName: string
  /** L'ancre d'identité de la collecte (GA-96) — sur une relance, celle du dossier. */
  siren?: string
  country?: string
  profileData: Record<string, unknown>
  userContext?: string
  accountFeedback?: string
  /** Couche zéro CRM (annexe méthodo p8) — absent sans CRM connecté / sans match. */
  crmPresence?: string
  internalHistory?: string
  /** #4070 — les faits du compte et ce qui en découle (absents = job byte-identique). */
  accountFacts?: Array<{ kind: string; label: string; date: string; ageDays: number }>
  knownContacts?: Array<{ name: string; role: string | null; relation: 'crm' | 'mission'; lastSeen: string | null }>
  previousAnalysis?: string
  lostDealRex?: string
  /** #3753.3 — le ciblage de l'ESN sur ce compte (hypothèses du vendeur). */
  sellerHypotheses?: SellerHypothesesForRun
  /** #2451.1 — le mode de contexte du run, absent sur le chemin historique. */
  contextMode?: string
  // Axe CHEMIN (#1631.3/.4, lot 14) — voir `analysis.service.ts`.
  marketPathsObserved?: number
  marketTopEsn?: string
  // Axe RELATION (#2298.4, lot 19/09) — voir `analysis.service.ts`.
  relationMissionsCount?: number
  relationLastMeetingAt?: string
  relationLastEmailAt?: string
  relationHumanCorrection?: string
  declaredPartners?: string[]
  consultantHistory?: 'present' | 'former'
  declaredSignalPresent?: boolean
  correlationId?: string
}

interface JobAddOpts {
  jobId: string
  attempts?: number
  backoff?: { type: string; delay: number }
}

type JobAddFn = (name: string, data: JobAddData, opts: JobAddOpts) => Promise<{ id: string }>

interface StateHolder {
  getState: jest.Mock<Promise<string>, []>
  remove: jest.Mock<Promise<void>, []>
  data: { accountId: string }
  id: string
  /** Quand le worker a pris le job. Absent = jamais démarré (en file). */
  processedOn?: number | null
}

type GetJobFn = (jobId: string) => Promise<StateHolder | undefined>

interface QueueMock {
  add: jest.Mock<Promise<{ id: string }>, Parameters<JobAddFn>>
  getJob: jest.Mock<Promise<StateHolder | undefined>, Parameters<GetJobFn>>
}

async function buildService(
  queue: QueueMock,
  opts: {
    findAnalyzingByUserAndCompany?: AccountEntity | null
    findCompletedByUserAndCompany?: AccountEntity | null
    /** Dossiers d'exemple de l'espace démo, pour le rejeu quand la saisie ne
     *  correspond à aucun d'eux. */
    demoDossiers?: AccountEntity[]
    /** Compte error/canceled réutilisable à la relance (bug « 7× Decathlon »).
     *  Défaut null = pas de doublon à réutiliser, `create()` s'applique. */
    findReusableFailedByUserAndCompany?: AccountEntity | null
    answers?: EsnAnswers
    slot?: SlotResult
    runs?: RunsMock
    persistence?: { recordAnalysisStarted: jest.Mock }
    /** Directives de correction (feedback loop A2) que le service résoudrait
     *  pour ce compte. Absent = provider absent (mémoire non branchée). */
    feedbackDirectives?: string
    /** Demo mode C1 : valeur renvoyée par `isDemoWorkspace`. Absent = provider
     *  absent (chemin réel inchangé, comme les unit specs historiques). */
    isDemoWorkspace?: boolean
    /** Couche zéro CRM (annexe méthodo p8) : relevé renvoyé par
     *  `describeAccountHistory`. Absent = provider absent (aucun CRM branché). */
    crmHistory?: string | undefined
    /** Marqueur explicite : provider CRM branché mais sans match (→ undefined). */
    crmConnected?: boolean
    /** Axe CHEMIN (#1631.3/.4, lot 14) : ce que `MarketMemoryService.pathAxisFor`
     *  rendrait. Absent = provider absent (mémoire marché non branchée) ; `null` =
     *  provider branché mais sans couverture (ou sous le seuil transverse). */
    marketPathAxis?: { paths: number; topEsn: string | null } | null
    /** Axe RELATION (#2298.4, lot 19/09) : ce que `RelationAxisReaderService.relationSignalsFor`
     *  rendrait. Absent = provider absent (aucune source branchée). */
    relationSignals?: {
      missionsCount?: number
      lastMeetingAt?: string
      lastEmailAt?: string
      declaredPartners?: string[]
      consultantHistory?: 'present' | 'former'
      declaredSignalPresent?: boolean
    }
    /** Mémoire de relation du compte (`account.relationship_memory.relation`) —
     *  la correction humaine de l'axe RELATION. Absent = pas de correction posée. */
    relationHumanCorrection?: string
    /** #2005.11 — ce que `getLayerVersions` rendrait (ou jetterait). Absent = méthode absente. */
    layerVersions?: LayerVersions | Error
    /** #2163.76 — laisse un test inspecter les appels du mock `CreditsService`
     *  (`consumeAnalysisSlot`/`refundAnalysisSlot`) sans dupliquer tout le
     *  câblage Nest de cette fonction. */
    onCredits?: (credits: ReturnType<typeof creditsProvider>['useValue']) => void
    /** #3212.3 (épopée #3235), lot E7 — `accounts.updated_at` du compte fraîchement
     *  créé. Absent = mock historique sans cette colonne (le service doit alors
     *  timbrer `accountContextVersion: null`, jamais une date devinée). */
    accountUpdatedAt?: Date
    /** #3753.3 — ce que `SellerHypothesesReader.forAccount` rendrait (`null` = compte hors liste).
     *  Absent = lecteur absent (chemin historique). */
    sellerHypotheses?: SellerHypothesesForRun | null
    /** #3623 — le rattacheur des pièces jointes. Absent = provider absent (specs historiques). */
    attachmentBinder?: { bindToAccount: jest.Mock }
    /** #4070 — les lectures du lancement (faits, interlocuteurs de missions, analyse précédente).
     *  Absent = lecteur absent (specs historiques, job byte-identique). */
    factsInputs?: {
      accountFacts?: { accountFacts?: unknown[]; lostDealRex?: string }
      missionContacts?: unknown[]
      previousAnalysis?: string
    }
    /** #4070 — compte créé SANS espace (legacy) : rien ne doit être lu. */
    accountWithoutWorkspace?: boolean
    /** #4070.3 — les contacts que le CRM connaît chez ce groupe (`knownContacts`). */
    crmKnownContacts?: Array<{ name: string | null; jobTitle: string | null }>
    /** #4070 — laisse un test inspecter les appels du lecteur de faits. */
    onFactsInputs?: (mock: { accountFacts: jest.Mock; missionContacts: jest.Mock; previousAnalysis: jest.Mock }) => void
  } = {},
): Promise<AnalysisService> {
  let nextId = 1
  const accountsService = {
    create: jest.fn().mockImplementation(async () =>
      success({
        id: `acc-${nextId++}`,
        status: 'analyzing',
        // Correction humaine de l'axe RELATION (#2298.4) — lue directement sur
        // le compte, jamais via un service à part.
        ...(opts.relationHumanCorrection !== undefined
          ? { relationship_memory: { relation: opts.relationHumanCorrection } }
          : {}),
        ...(opts.accountUpdatedAt !== undefined ? { updated_at: opts.accountUpdatedAt } : {}),
        ...(opts.sellerHypotheses !== undefined || (opts.factsInputs !== undefined && !opts.accountWithoutWorkspace)
          ? { workspace_id: 'ws-1' }
          : {}),
      } as AccountEntity),
    ),
    findOne: jest.fn(),
    findAnalyzingByUserAndCompany: jest.fn().mockResolvedValue(opts.findAnalyzingByUserAndCompany ?? null),
    findCompletedByUserAndCompany: jest.fn().mockResolvedValue(opts.findCompletedByUserAndCompany ?? null),
    listCompletedForDemoReplay: jest.fn().mockResolvedValue(opts.demoDossiers ?? []),
    findReusableFailedByUserAndCompany: jest.fn().mockResolvedValue(opts.findReusableFailedByUserAndCompany ?? null),
    findSameCompanyAccount: jest.fn().mockResolvedValue(null),
    reuseForRelaunch: jest.fn().mockResolvedValue(undefined),
    markErrored: jest.fn().mockResolvedValue(undefined),
    // Transition gardée `analyzing` → `error` : `true` = cet appelant a gagné la
    // course (et c'est donc lui qui rembourse). Défaut gagnant — les specs qui
    // testent la course la surchargent explicitement.
    markInterrupted: jest.fn().mockResolvedValue(true),
  } as unknown as AccountsService
  const contactsService = {
    findByAccount: jest.fn().mockResolvedValue([]),
  } as unknown as ContactsService
  const cancellation = {
    register: jest.fn().mockReturnValue(new AbortController().signal),
    unregister: jest.fn(),
    cancel: jest.fn().mockReturnValue(false),
  } as unknown as AnalysisCancellationService
  const credits = creditsProvider(opts.slot)
  opts.onCredits?.(credits.useValue)
  const moduleRef = await Test.createTestingModule({
    providers: [
      AnalysisService,
      { provide: getQueueToken('analysis'), useValue: queue },
      { provide: AccountsService, useValue: accountsService },
      { provide: ContactsService, useValue: contactsService },
      { provide: AnalysisCancellationService, useValue: cancellation },
      esnProfileProvider(opts.answers, opts.layerVersions),
      credits,
      { provide: AnalysisRunsService, useValue: opts.runs ?? runsServiceMock() },
      {
        provide: AnalysisPersistenceService,
        useValue: opts.persistence ?? { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
      },
      ...(opts.feedbackDirectives !== undefined
        ? [
            {
              provide: AccountFeedbackService,
              useValue: { directivesFor: jest.fn().mockResolvedValue(opts.feedbackDirectives) },
            },
          ]
        : []),
      ...(opts.isDemoWorkspace !== undefined
        ? [
            {
              provide: WorkspaceContextService,
              useValue: { isDemoWorkspace: jest.fn().mockResolvedValue(opts.isDemoWorkspace) },
            },
          ]
        : []),
      ...(opts.crmHistory !== undefined || opts.crmConnected
        ? [
            {
              provide: CrmReadService,
              useValue: {
                describeAccountHistory: jest.fn().mockResolvedValue(opts.crmHistory),
                knownContacts: jest.fn().mockResolvedValue(opts.crmKnownContacts ?? []),
              },
            },
          ]
        : []),
      ...(opts.factsInputs !== undefined
        ? [
            {
              provide: AnalysisFactsInputsService,
              useValue: factsInputsMock(opts),
            },
          ]
        : []),
      ...(opts.marketPathAxis !== undefined
        ? [
            {
              provide: MARKET_PATH_AXIS_SOURCE,
              useValue: { pathAxisFor: jest.fn().mockResolvedValue(opts.marketPathAxis) },
            },
          ]
        : []),
      ...(opts.relationSignals !== undefined
        ? [
            {
              provide: RelationAxisReaderService,
              useValue: { relationSignalsFor: jest.fn().mockResolvedValue(opts.relationSignals) },
            },
          ]
        : []),
      ...(opts.sellerHypotheses !== undefined
        ? [
            {
              provide: SellerHypothesesReader,
              useValue: { forAccount: jest.fn().mockResolvedValue(opts.sellerHypotheses ?? undefined) },
            },
          ]
        : []),
      ...(opts.attachmentBinder ? [{ provide: AnalysisAttachmentBinderService, useValue: opts.attachmentBinder }] : []),
    ],
  }).compile()
  return moduleRef.get(AnalysisService)
}

function factsInputsMock(opts: {
  factsInputs?: {
    accountFacts?: { accountFacts?: unknown[]; lostDealRex?: string }
    missionContacts?: unknown[]
    previousAnalysis?: string
  }
  onFactsInputs?: (mock: { accountFacts: jest.Mock; missionContacts: jest.Mock; previousAnalysis: jest.Mock }) => void
}) {
  const mock = {
    accountFacts: jest.fn().mockResolvedValue(opts.factsInputs?.accountFacts ?? {}),
    missionContacts: jest.fn().mockResolvedValue(opts.factsInputs?.missionContacts ?? []),
    previousAnalysis: jest.fn().mockResolvedValue(opts.factsInputs?.previousAnalysis),
  }
  opts.onFactsInputs?.(mock)
  return mock
}

function buildAddMock(): QueueMock['add'] {
  return jest
    .fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
    .mockImplementation(async (_name: string, _data: JobAddData, opts: JobAddOpts) => ({ id: opts.jobId }))
}

function buildGetJobMock(result: StateHolder | undefined = undefined): QueueMock['getJob'] {
  return jest.fn<Promise<StateHolder | undefined>, Parameters<GetJobFn>>().mockResolvedValue(result)
}

describe('AnalysisService — idempotency', () => {
  it('builds a deterministic jobId slugified from company_name', async () => {
    const add = buildAddMock()
    const getJob = buildGetJobMock()
    const service = await buildService({ add, getJob })

    const res = await service.start({ company_name: '  SNCF Réseau!! ' }, 'user-abc')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.jobId).toBe('analysis-user-abc-sncf-reseau')
    expect(add).toHaveBeenCalledTimes(1)
  })

  // #2704.7 — « cas A » du registre #2704 : deux sociétés DIFFÉRENTES, pas
  // expliquées par le cloisonnement (chacune reste propriétaire de son
  // compte). La racine réelle : l'ancien slug fusionnait TOUTE suite de
  // séparateurs sur un seul tiret, donc « AB & C » et « AB&C » rendaient le
  // même jobId — la seconde société atterrissait sur le job de la première.
  it('ne fait plus collisionner deux noms distincts que la fusion de séparateurs aurait rendus identiques (#2704.7)', async () => {
    const add = buildAddMock()
    const getJob = buildGetJobMock()
    const service = await buildService({ add, getJob })

    const premiere = await service.start({ company_name: 'AB & C' }, 'user-x')
    const seconde = await service.start({ company_name: 'AB&C' }, 'user-x')

    expect(isSuccess(premiere)).toBe(true)
    expect(isSuccess(seconde)).toBe(true)
    if (isSuccess(premiere) && isSuccess(seconde)) {
      expect(premiere.output.jobId).not.toBe(seconde.output.jobId)
    }
  })

  it('records an append-only run row (Théo P0) when a fresh analysis starts', async () => {
    const add = buildAddMock()
    const getJob = buildGetJobMock()
    const runs = runsServiceMock()
    const service = await buildService({ add, getJob }, { runs })

    await service.start({ company_name: 'SNCF', scope_mode: 'france', siren: '552081317' }, 'user-1')

    expect(runs.recordStart).toHaveBeenCalledTimes(1)
    expect(runs.recordStart).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', scopeMode: 'france', siren: '552081317' }),
    )
  })

  // #4667 — une analyse lancée depuis Laura n'apparaissait pas dans « Mes analyses » : l'historique lit
  // `analysis_runs.workspace_id`, et un compte sans espace (fiche venue d'un import) posait un run sans espace.
  it('#4667 — un compte sans espace pose le run sur l’espace actif de l’utilisateur', async () => {
    const add = buildAddMock()
    const getJob = buildGetJobMock()
    const runs = runsServiceMock()
    const service = await buildService({ add, getJob }, { runs })
    ;(service as unknown as { workspaceContext: unknown }).workspaceContext = {
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-9', role: 'member' }),
    }

    await service.start({ company_name: 'Société Générale — SGCIB' }, 'user-1')

    expect(runs.recordStart).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-9' }))
  })

  // #3623 (reste) — les pièces jointes passent de `personal` à `account` AVANT la mise en file :
  // aucune phase n'a lu la base, aucune autre analyse de l'auteur ne les voit.
  it('#3623 — rattache les pièces jointes au compte AVANT la mise en file', async () => {
    const order: string[] = []
    const add = buildAddMock()
    add.mockImplementation(async (_n: string, _d: JobAddData, opts: JobAddOpts) => {
      order.push('enqueue')
      return { id: opts.jobId }
    })
    const attachmentBinder = {
      bindToAccount: jest.fn().mockImplementation(async () => {
        order.push('bind')
        return 1
      }),
    }
    const service = await buildService({ add, getJob: buildGetJobMock() }, { attachmentBinder })
    const DOC = '22222222-2222-4222-8222-222222222222'

    await service.start({ company_name: 'SNCF', attachment_document_ids: [DOC] }, 'user-1')

    expect(attachmentBinder.bindToAccount).toHaveBeenCalledWith([DOC], expect.stringMatching(/^acc-/), 'user-1')
    expect(order).toEqual(['bind', 'enqueue'])
  })

  it('#3623 — sans pièce jointe, aucun rattachement (lancement inchangé)', async () => {
    const attachmentBinder = { bindToAccount: jest.fn() }
    const service = await buildService({ add: buildAddMock(), getJob: buildGetJobMock() }, { attachmentBinder })
    await service.start({ company_name: 'SNCF' }, 'user-1')
    expect(attachmentBinder.bindToAccount).not.toHaveBeenCalled()
  })

  // #3212.3 (épopée #3235), lot E7 — la révision de fiche que ce run a lue
  // (`accounts.updated_at`) voyage jusqu'au run, au même geste que le cadrage.
  it('épingle account_context_version (accounts.updated_at) sur le run — #3212.3', async () => {
    const add = buildAddMock()
    const runs = runsServiceMock()
    const updatedAt = new Date('2026-09-20T08:30:00.000Z')
    const service = await buildService({ add, getJob: buildGetJobMock() }, { runs, accountUpdatedAt: updatedAt })

    await service.start({ company_name: 'Capgemini' }, 'user-1')

    expect(runs.recordStart).toHaveBeenCalledWith(
      expect.objectContaining({ accountContextVersion: '2026-09-20T08:30:00.000Z' }),
    )
  })

  it('rend account_context_version null — jamais devinée — quand le compte ne porte pas encore la colonne', async () => {
    const add = buildAddMock()
    const runs = runsServiceMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { runs })

    await service.start({ company_name: 'Capgemini' }, 'user-1')

    expect(runs.recordStart).toHaveBeenCalledWith(expect.objectContaining({ accountContextVersion: null }))
  })

  // Théo P0-02 : « on paie une collecte sans avoir pu la cadrer ». Le cadrage
  // confirmé avant le débit doit voyager jusqu'au run — sinon la confirmation
  // n'est qu'un écran.
  it('emporte le cadrage de collecte jusqu’au job ET l’épingle sur le run', async () => {
    const add = buildAddMock()
    const runs = runsServiceMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { runs })

    const scope_selection = { excluded_entities: ['TF1 PUB'], selected_angles: ['cybersécurité'] }
    await service.start({ company_name: 'TF1', scope_selection }, 'user-1')

    expect(add).toHaveBeenCalledWith(
      'analyze',
      expect.objectContaining({ scopeSelection: scope_selection }),
      expect.anything(),
    )
    expect(runs.recordStart).toHaveBeenCalledWith(expect.objectContaining({ scopeSelection: scope_selection }))
  })

  // #4432.2 — « Découvrir aéronautique, Occitanie → Safran » : la zone cherchée devient le PÉRIMÈTRE du
  // run (`geo_perimeter`/`geo_areas`), pas une simple hypothèse du vendeur.
  it('#4432.2 — la zone d’une recherche Découvrir ou Laura devient le périmètre du run', async () => {
    for (const suggestion_id of ['discover:552100554', 'laura:552100554']) {
      const add = buildAddMock()
      const runs = runsServiceMock()
      const service = await buildService({ add, getJob: buildGetJobMock() }, { runs })
      await service.start(
        {
          company_name: 'Safran',
          suggestion_id,
          suggestion_criteria: { zone: 'Occitanie', zone_regions: ['Occitanie'] },
        },
        'user-1',
      )
      const expected = { geo_perimeter: 'region', geo_areas: ['Occitanie'] }
      expect(add).toHaveBeenCalledWith(
        'analyze',
        expect.objectContaining({ scopeSelection: expected }),
        expect.anything(),
      )
      expect(runs.recordStart).toHaveBeenCalledWith(expect.objectContaining({ scopeSelection: expected }))
    }
  })

  it('#4432.2 — dit NON : un périmètre saisi au cadrage gagne, et sans zone le run reste national', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() })
    await service.start(
      {
        company_name: 'Safran',
        suggestion_id: 'discover:552100554',
        suggestion_criteria: { zone_regions: ['Occitanie'] },
        scope_selection: { geo_perimeter: 'france' },
      },
      'user-1',
    )
    expect(add).toHaveBeenLastCalledWith(
      'analyze',
      expect.objectContaining({ scopeSelection: { geo_perimeter: 'france' } }),
      expect.anything(),
    )

    await service.start(
      {
        company_name: 'Safran',
        suggestion_id: 'discover:552100554',
        suggestion_criteria: { sectors: ['aeronautics'] },
      },
      'user-1',
    )
    expect(add).toHaveBeenLastCalledWith(
      'analyze',
      expect.objectContaining({ scopeSelection: undefined }),
      expect.anything(),
    )
  })

  // #2163.76 — ce qui est EXCLU réduit le prix débité, le MÊME compte que
  // celui annoncé par `ScopeConfirmPanel.tsx` (`estimateAnalysisCredits`) —
  // jamais un second calcul qui pourrait diverger.
  it('#2163.76 — débite un crédit de moins par entité écartée', async () => {
    const add = buildAddMock()
    let capturedCost: number | undefined
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      {
        onCredits: credits => {
          credits.consumeAnalysisSlot.mockImplementation(async (_userId: string, context: { cost?: number }) => {
            capturedCost = context.cost
            return { ok: true, used: 1, limit: 3 }
          })
        },
      },
    )

    const scope_selection = { excluded_entities: ['Secteur public', 'Hors France'] }
    await service.start({ company_name: 'TF1', scope_mode: 'groupe', scope_selection }, 'user-1')

    expect(capturedCost).toBe(resolveAnalysisCost('groupe', 2))
    expect(capturedCost).toBe(8)
  })

  // #3288 — la profondeur choisie change le prix DÉBITÉ, par la même fonction
  // que l'aperçu et l'écran (`estimateAnalysisCredits`).
  it('#3288 — débite le prix du palier choisi, rapide < vérifiée < approfondie', async () => {
    const costOf = async (depth?: 'quick' | 'verified' | 'deep') => {
      let captured: number | undefined
      const service = await buildService(
        { add: buildAddMock(), getJob: buildGetJobMock() },
        {
          onCredits: credits => {
            credits.consumeAnalysisSlot.mockImplementation(async (_u: string, ctx: { cost?: number }) => {
              captured = ctx.cost
              return { ok: true, used: 1, limit: 30 }
            })
          },
        },
      )
      await service.start(
        { company_name: 'TF1', scope_mode: 'groupe', ...(depth ? { scope_selection: { depth } } : {}) },
        'user-1',
      )
      return captured
    }
    const [none, quick, verified, deep] = [
      await costOf(),
      await costOf('quick'),
      await costOf('verified'),
      await costOf('deep'),
    ]
    expect(none).toBe(deep) // Louis 10/10 — sans palier choisi = Approfondie (plus « vérifiée » à 8)
    expect(quick).toBe(resolveAnalysisCost('groupe', 0, undefined, 'quick'))
    expect(deep).toBe(resolveAnalysisCost('groupe', 0, undefined, 'deep'))
    expect(quick!).toBeLessThan(verified!)
    expect(deep!).toBeGreaterThan(verified!)
  })

  it('#2163.76 — aucune exclusion : débite le prix plein, byte-identique à avant', async () => {
    const add = buildAddMock()
    let capturedCost: number | undefined
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      {
        onCredits: credits => {
          credits.consumeAnalysisSlot.mockImplementation(async (_userId: string, context: { cost?: number }) => {
            capturedCost = context.cost
            return { ok: true, used: 1, limit: 3 }
          })
        },
      },
    )

    await service.start({ company_name: 'TF1', scope_mode: 'groupe' }, 'user-1')

    expect(capturedCost).toBe(10)
  })

  it('ne transmet ni ne stocke un cadrage vide (run inchangé)', async () => {
    const add = buildAddMock()
    const runs = runsServiceMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { runs })

    await service.start({ company_name: 'TF1', scope_selection: { excluded_entities: [] } }, 'user-1')

    expect(add).toHaveBeenCalledWith(
      'analyze',
      expect.objectContaining({ scopeSelection: undefined }),
      expect.anything(),
    )
    expect(runs.recordStart).toHaveBeenCalledWith(expect.objectContaining({ scopeSelection: null }))
  })

  it('journals analysis_started in user_actions on a fresh launch (audit gap)', async () => {
    const persistence = { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) }
    const runs = runsServiceMock()
    runs.recordStart.mockResolvedValue('run-7')
    const service = await buildService({ add: buildAddMock(), getJob: buildGetJobMock() }, { persistence, runs })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    // Le 4e argument est la CLÉ DE CORRÉLATION : sans elle, « Analyse lancée »
    // ne peut jamais connaître son issue et reste « En cours » à vie.
    expect(persistence.recordAnalysisStarted).toHaveBeenCalledWith('acc-1', 'user-1', null, 'run-7')
  })

  it('does not record a run when the result cache short-circuits (no fresh run)', async () => {
    const cached = { id: 'acc-cached', status: 'completed', company_name: 'SNCF' } as AccountEntity
    const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
    const getJob = buildGetJobMock()
    const runs = runsServiceMock()
    const service = await buildService({ add, getJob }, { findCompletedByUserAndCompany: cached, runs })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    // Cache hit hands back the existing dossier — no new run, no history row.
    expect(runs.recordStart).not.toHaveBeenCalled()
  })

  it('returns the existing in-flight job without creating a new account', async () => {
    const activeJob: StateHolder = {
      id: 'analysis-user-1-sncf',
      data: { accountId: 'acc-existing' },
      getState: jest.fn<Promise<string>, []>().mockResolvedValue('active'),
      remove: jest.fn<Promise<void>, []>(),
    }
    const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
    const getJob = buildGetJobMock(activeJob)
    const service = await buildService({ add, getJob })

    const res = await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(getJob).toHaveBeenCalledWith('analysis-user-1-sncf')
    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) {
      expect(res.output).toEqual({
        jobId: 'analysis-user-1-sncf',
        accountId: 'acc-existing',
        launched: true,
        reason: 'in_flight',
      })
    }
    expect(add).not.toHaveBeenCalled()
    expect(activeJob.remove).not.toHaveBeenCalled()
  })

  // #3666.5 — « Retour sur une opération en cours : aucune seconde opération,
  // aucun second débit. » Les deux couches d'idempotence renvoient `in_flight`
  // AVANT la réservation du crédit : le test pose la preuve sur le débit lui-même
  // (jusqu'ici seul `add` était vérifié).
  describe('#3666.5 — revenir sur un run en cours ne débite pas', () => {
    it('couche 1 (job actif) : aucun crédit consommé, aucun job ajouté', async () => {
      const activeJob: StateHolder = {
        id: 'analysis-user-1-sncf',
        data: { accountId: 'acc-existing' },
        getState: jest.fn<Promise<string>, []>().mockResolvedValue('active'),
        remove: jest.fn<Promise<void>, []>(),
      }
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      let spy: ReturnType<typeof creditsProvider>['useValue'] | undefined
      const service = await buildService(
        { add, getJob: buildGetJobMock(activeJob) },
        { onCredits: credits => (spy = credits) },
      )

      await service.start({ company_name: 'SNCF' }, 'user-1')
      await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(add).not.toHaveBeenCalled()
      expect(spy?.consumeAnalysisSlot).not.toHaveBeenCalled()
    })

    it('couche 2 (compte analyzing vivant) : aucun crédit consommé, aucun job ajouté', async () => {
      const live = { id: 'acc-live', status: 'analyzing', updated_at: new Date(Date.now() - 30_000) } as AccountEntity
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      let spy: ReturnType<typeof creditsProvider>['useValue'] | undefined
      const service = await buildService(
        { add, getJob: buildGetJobMock() },
        { findAnalyzingByUserAndCompany: live, onCredits: credits => (spy = credits) },
      )

      await service.start({ company_name: 'SNCF' }, 'user-1')
      await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(add).not.toHaveBeenCalled()
      expect(spy?.consumeAnalysisSlot).not.toHaveBeenCalled()
    })
  })

  it('removes a terminal job and enqueues a fresh one with the same jobId', async () => {
    const staleJob: StateHolder = {
      id: 'analysis-user-1-sncf',
      data: { accountId: 'acc-old' },
      getState: jest.fn<Promise<string>, []>().mockResolvedValue('failed'),
      remove: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    }
    const add = buildAddMock()
    const getJob = buildGetJobMock(staleJob)
    const service = await buildService({ add, getJob })

    const res = await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(staleJob.remove).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(
      'analyze',
      expect.objectContaining({ companyName: 'SNCF' }),
      expect.objectContaining({
        jobId: 'analysis-user-1-sncf',
        // Bounded auto-retry so a transient stream cut self-heals (checkpointer
        // resume, no re-bill). A genuine failure is thrown as UnrecoverableError
        // and never retry-looped.
        attempts: 3,
        backoff: { type: 'exponential-jitter', delay: 5000 },
      }),
    )
    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) {
      expect(res.output.jobId).toBe('analysis-user-1-sncf')
      expect(res.output.accountId).not.toBe('acc-old')
    }
  })

  it('reuses an in-flight account when BullMQ has no job (race fallback)', async () => {
    // Real-world race: two concurrent `POST /analysis/start` requests both
    // see `getJob === null`, each call `accountsService.create()`, then BullMQ
    // dedupes the second `queue.add` silently — leaving the second account
    // orphaned with status='analyzing'. The findAnalyzing fallback closes that.
    const orphan = { id: 'acc-existing', status: 'analyzing' } as AccountEntity
    const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
    const getJob = buildGetJobMock() // No job in Redis (orphan case)
    const service = await buildService({ add, getJob }, { findAnalyzingByUserAndCompany: orphan })

    const res = await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) {
      expect(res.output).toEqual({
        jobId: 'analysis-user-1-sncf',
        accountId: 'acc-existing',
        launched: true,
        reason: 'in_flight',
      })
    }
    // No new account created, no new job enqueued.
    expect(add).not.toHaveBeenCalled()
  })

  describe('sortie de secours d’un compte bloqué en `analyzing`', () => {
    // Un compte bloqué en `analyzing` par un worker mort n'avait AUCUNE sortie
    // côté produit : les deux couches d'idempotence renvoyaient `in_flight` à
    // chaque tentative, donc « Relancer » ramenait l'utilisateur sur le run mort
    // qu'il essayait de fuir. Attendre ne servait à rien non plus — le faucheur
    // épargnait le job `active` orphelin. Ces deux tests verrouillent la sortie.

    it('relance vraiment quand le job `active` est orphelin (worker disparu)', async () => {
      const orphanJob: StateHolder = {
        id: 'analysis-user-1-sncf',
        data: { accountId: 'acc-stuck' },
        getState: jest.fn<Promise<string>, []>().mockResolvedValue('active'),
        remove: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
        processedOn: Date.now() - JOB_TIMEOUT_MS - 60_000,
      }
      const add = buildAddMock()
      const service = await buildService({ add, getJob: buildGetJobMock(orphanJob) })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(orphanJob.remove).toHaveBeenCalledTimes(1)
      expect(add).toHaveBeenCalledTimes(1)
      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) {
        expect(res.output.reason).not.toBe('in_flight')
        expect(res.output.accountId).not.toBe('acc-stuck')
      }
    })

    it('relance encore si `remove()` du job verrouillé échoue', async () => {
      const orphanJob: StateHolder = {
        id: 'analysis-user-1-sncf',
        data: { accountId: 'acc-stuck' },
        getState: jest.fn<Promise<string>, []>().mockResolvedValue('active'),
        remove: jest.fn<Promise<void>, []>().mockRejectedValue(new Error('Job is locked')),
        processedOn: Date.now() - JOB_TIMEOUT_MS - 60_000,
      }
      const add = buildAddMock()
      const service = await buildService({ add, getJob: buildGetJobMock(orphanJob) })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      expect(add).toHaveBeenCalledTimes(1)
    })

    it('répare le compte périmé et démarre un run neuf plutôt que de renvoyer `in_flight`', async () => {
      const stuck = {
        id: 'acc-stuck',
        status: 'analyzing',
        updated_at: new Date(Date.now() - JOB_TIMEOUT_MS - 60_000),
      } as AccountEntity
      const add = buildAddMock()
      const runs = runsServiceMock()
      const service = await buildService(
        { add, getJob: buildGetJobMock() },
        { findAnalyzingByUserAndCompany: stuck, runs },
      )

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) {
        expect(res.output.reason).not.toBe('in_flight')
        expect(res.output.accountId).not.toBe('acc-stuck')
      }
      // La ligne fantôme est dite en échec — pas laissée à mentir « en cours ».
      expect(runs.completeLatest).toHaveBeenCalledWith('acc-stuck', { status: 'error' })
      expect(add).toHaveBeenCalledTimes(1)
    })

    // COMPOSITION #627 × facturation — la 4ᵉ sortie de `analyzing`.
    // #627 a ouvert cette sortie (sans elle, « Relancer » était un cul-de-sac),
    // mais elle répare le run mort ET consomme aussitôt un slot pour le run
    // neuf : sans remboursement, l'utilisateur paie DEUX crédits pour un seul
    // dossier — sur le bouton même qu'il presse pour se sortir d'une panne
    // d'infra dont il n'est pas responsable.
    it('rembourse le run mort qu’elle répare, au lieu de double-facturer la relance', async () => {
      const stuck = {
        id: 'acc-stuck',
        company_name: 'SNCF',
        status: 'analyzing',
        updated_at: new Date(Date.now() - JOB_TIMEOUT_MS - 60_000),
      } as AccountEntity
      const service = await buildService(
        { add: buildAddMock(), getJob: buildGetJobMock() },
        { findAnalyzingByUserAndCompany: stuck },
      )
      const credits = (service as unknown as { credits: { refundAnalysisSlot: jest.Mock } }).credits

      await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(credits.refundAnalysisSlot).toHaveBeenCalledWith('user-1', {
        reason: expect.stringContaining('interrompu'),
        accountId: 'acc-stuck',
      })
    })

    // La garde tient aussi ici : si le faucheur (ou la lecture) a déjà basculé
    // la ligne, il a déjà remboursé — la relance ne doit pas rembourser une 2ᵉ fois.
    it('ne rembourse pas si un autre chemin a déjà gagné la transition', async () => {
      const stuck = {
        id: 'acc-stuck',
        company_name: 'SNCF',
        status: 'analyzing',
        updated_at: new Date(Date.now() - JOB_TIMEOUT_MS - 60_000),
      } as AccountEntity
      const service = await buildService(
        { add: buildAddMock(), getJob: buildGetJobMock() },
        { findAnalyzingByUserAndCompany: stuck },
      )
      const accounts = (service as unknown as { accountsService: { markInterrupted: jest.Mock } }).accountsService
      accounts.markInterrupted.mockResolvedValue(false)
      const credits = (service as unknown as { credits: { refundAnalysisSlot: jest.Mock } }).credits

      await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(credits.refundAnalysisSlot).not.toHaveBeenCalled()
    })

    it('répare aussi à la lecture quand le job `active` est orphelin', async () => {
      const stuck = {
        id: 'acc-stuck',
        status: 'analyzing',
        company_name: 'SNCF',
        updated_at: new Date(Date.now() - JOB_TIMEOUT_MS - 60_000),
      } as AccountEntity
      const orphanJob: StateHolder = {
        id: 'analysis-user-1-sncf',
        data: { accountId: 'acc-stuck' },
        getState: jest.fn<Promise<string>, []>().mockResolvedValue('active'),
        remove: jest.fn<Promise<void>, []>(),
        processedOn: Date.now() - JOB_TIMEOUT_MS - 60_000,
      }
      const runs = runsServiceMock()
      const service = await buildService({ add: buildAddMock(), getJob: buildGetJobMock(orphanJob) }, { runs })
      ;(service as unknown as { accountsService: { findOne: jest.Mock } }).accountsService.findOne = jest
        .fn()
        .mockResolvedValue(success(stuck))

      const res = await service.getStatus('acc-stuck', 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) expect(res.output.state).toBe('failed')
      expect(runs.completeLatest).toHaveBeenCalledWith('acc-stuck', { status: 'error' })
    })

    it('n’interrompt PAS un run récent encore légitimement en cours', async () => {
      const live = {
        id: 'acc-live',
        status: 'analyzing',
        updated_at: new Date(Date.now() - 30_000),
      } as AccountEntity
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      const service = await buildService({ add, getJob: buildGetJobMock() }, { findAnalyzingByUserAndCompany: live })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) expect(res.output).toMatchObject({ accountId: 'acc-live', reason: 'in_flight' })
      expect(add).not.toHaveBeenCalled()
    })

    // #2704.1 — Bedros/Adel (Apricot Labs, 22/09/2026) : la seconde personne
    // qui rejoint un run déjà en vol doit savoir QUI l'a lancé, au lieu d'un
    // rattachement muet qui se lit comme un plantage.
    it('nomme qui a lancé le run qu’on rejoint, quand ce n’est pas soi (#2704.1)', async () => {
      const live = {
        id: 'acc-live',
        status: 'analyzing',
        user_id: 'user-2',
        updated_at: new Date(Date.now() - 30_000),
      } as AccountEntity
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      const service = await buildService({ add, getJob: buildGetJobMock() }, { findAnalyzingByUserAndCompany: live })
      const workspaceAuthorOf = jest.fn().mockResolvedValue({ firstName: 'Bedros', avatarUrl: null })
      ;(service as unknown as { accountsService: { workspaceAuthorOf: jest.Mock } }).accountsService.workspaceAuthorOf =
        workspaceAuthorOf
      ;(service as unknown as { workspaceContext: unknown }).workspaceContext = {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
      }

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res))
        expect(res.output).toMatchObject({
          accountId: 'acc-live',
          reason: 'in_flight',
          startedBy: { firstName: 'Bedros', avatarUrl: null },
        })
      expect(workspaceAuthorOf).toHaveBeenCalledWith('ws-1', 'user-2')
    })

    it('reste MUET quand c’est soi-même qui a lancé le run — rien à nommer (#2704.1)', async () => {
      const own = {
        id: 'acc-live',
        status: 'analyzing',
        user_id: 'user-1',
        updated_at: new Date(Date.now() - 30_000),
      } as AccountEntity
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      const service = await buildService({ add, getJob: buildGetJobMock() }, { findAnalyzingByUserAndCompany: own })
      ;(service as unknown as { workspaceContext: unknown }).workspaceContext = {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'member' }),
      }

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) expect(res.output.startedBy).toBeUndefined()
    })

    it('sans WorkspaceContextService (specs historiques) : pas de startedBy, aucun crash (#2704.1)', async () => {
      const live = {
        id: 'acc-live',
        status: 'analyzing',
        user_id: 'user-2',
        updated_at: new Date(Date.now() - 30_000),
      } as AccountEntity
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      const service = await buildService({ add, getJob: buildGetJobMock() }, { findAnalyzingByUserAndCompany: live })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) expect(res.output.startedBy).toBeUndefined()
    })
  })

  describe('result cache (C1)', () => {
    it('returns a fresh completed analysis without creating a new account or job', async () => {
      const cached = { id: 'acc-cached', status: 'completed', company_name: 'SNCF' } as AccountEntity
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      const getJob = buildGetJobMock() // no in-flight job in Redis
      const service = await buildService({ add, getJob }, { findCompletedByUserAndCompany: cached })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) {
        // Cache hit — hand back the existing account's id, deterministic jobId.
        expect(res.output).toEqual({
          jobId: 'analysis-user-1-sncf',
          accountId: 'acc-cached',
          launched: false,
          reason: 'cache_hit',
        })
      }
      // No re-pay: no new account, no new IA run.
      expect(add).not.toHaveBeenCalled()
    })

    it('runs a fresh analysis when there is no recent completed account (cache miss)', async () => {
      const add = buildAddMock()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }, { findCompletedByUserAndCompany: null })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      // Cache miss — the full pipeline is enqueued as usual.
      expect(add).toHaveBeenCalledTimes(1)
    })

    it('still prefers an in-flight job over the result cache', async () => {
      const activeJob: StateHolder = {
        id: 'analysis-user-1-sncf',
        data: { accountId: 'acc-inflight' },
        getState: jest.fn<Promise<string>, []>().mockResolvedValue('active'),
        remove: jest.fn<Promise<void>, []>(),
      }
      const cached = { id: 'acc-cached', status: 'completed', company_name: 'SNCF' } as AccountEntity
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      const getJob = buildGetJobMock(activeJob)
      const service = await buildService({ add, getJob }, { findCompletedByUserAndCompany: cached })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) {
        // The live job wins — we don't short-circuit to a stale cached row
        // while an analysis is actively running.
        expect(res.output.accountId).toBe('acc-inflight')
      }
      expect(add).not.toHaveBeenCalled()
    })
  })

  // #1583 — le coût annoncé AVANT le clic doit être EXACTEMENT le coût débité.
  // `planLaunch` lit la MÊME logique que `start()` (démo, puis cache de
  // résultat), sans jamais rien écrire ni débiter — un aperçu, pas un lancement.
  describe('planLaunch (#1583 — coût annoncé = coût débité)', () => {
    it('espace de démonstration : scenario "demo", jamais de coût annoncé', async () => {
      const service = await buildService(
        { add: jest.fn(), getJob: buildGetJobMock() },
        { isDemoWorkspace: true, findCompletedByUserAndCompany: null },
      )

      const plan = await service.planLaunch({ companyName: 'SNCF' }, 'user-1')

      expect(plan).toEqual({ scenario: 'demo' })
    })

    // #3944 (retour bêta Louis 08/10/2026) — remplace le test #3288 ci-dessous,
    // qui prouvait TROIS paliers annoncés : deux seulement sont offerts au
    // lancement (`SELECTABLE_ANALYSIS_RUN_DEPTHS`). « verified » reste une
    // valeur VALIDE (un run déjà lancé dans ce palier avant ce lot reste
    // lisible), mais ce devis ne la propose plus.
    it('#3944 — annonce les DEUX paliers sélectionnables, durée mesurée seulement quand elle l’est', async () => {
      const service = await buildService(
        { add: jest.fn(), getJob: buildGetJobMock() },
        { findCompletedByUserAndCompany: null },
      )
      const internals = service as unknown as { workspaceContext: unknown; runs: unknown }
      internals.workspaceContext = {
        isDemoWorkspace: jest.fn().mockResolvedValue(false),
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
      }
      internals.runs = { medianSecondsByDepth: jest.fn().mockResolvedValue({ quick: null, verified: 240, deep: 420 }) }

      const plan = await service.planLaunch({ companyName: 'SNCF', scopeMode: 'groupe' }, 'user-1')

      expect(plan.scenario).toBe('fresh')
      const depths = (
        plan as { depths: Array<{ depth: string; credits: number; pages: number; medianSeconds: number | null }> }
      ).depths
      expect(depths.map(d => d.depth)).toEqual(['quick', 'deep'])
      expect(depths.map(d => d.medianSeconds)).toEqual([null, 420])
      // #3944 — « Approfondie » coûte 10 crédits exactement, pas le double du
      // prix plein (16) : la fonction du débit, jamais un chiffre recopié.
      expect(depths[1]!.credits).toBe(resolveAnalysisCost('groupe', 0, undefined, 'deep'))
      expect(depths[1]!.credits).toBe(10)
      expect(depths[0]!.credits).toBeLessThan(depths[1]!.credits)
      expect(depths[0]!.pages).toBeLessThan(depths[1]!.pages)
    })

    it('dossier récent déjà là : scenario "cache_hit" avec son accountId — jamais un coût', async () => {
      const cached = { id: 'acc-cached', status: 'completed', company_name: 'SNCF' } as AccountEntity
      const service = await buildService(
        { add: jest.fn(), getJob: buildGetJobMock() },
        { findCompletedByUserAndCompany: cached },
      )

      const plan = await service.planLaunch({ companyName: 'SNCF' }, 'user-1')

      expect(plan).toEqual({ scenario: 'cache_hit', accountId: 'acc-cached', companyName: 'SNCF' })
    })

    // SIMON-FIX S.18 — recette Simon 20/10 : « Actualiser l'analyse » annonçait « aucun crédit »
    // (plan `cache_hit`) mais débitait 10 crédits (1124 → 1114). `start()` saute le cache quand la
    // relance est EXPLICITE (`dto.relaunch`) : l'aperçu doit faire pareil, sinon il diverge du débit.
    it('SIMON-FIX S.18 — relance explicite : un dossier récent ne rend PAS cache_hit, mais le coût débité', async () => {
      const cached = { id: 'acc-cached', status: 'completed', company_name: 'SNCF' } as AccountEntity
      const service = await buildService(
        { add: jest.fn(), getJob: buildGetJobMock() },
        { findCompletedByUserAndCompany: cached },
      )

      const plan = await service.planLaunch({ companyName: 'SNCF', relaunch: true }, 'user-1')

      expect(plan.scenario).toBe('fresh')
      expect((plan as { credits: number }).credits).toBe(resolveAnalysisCost(undefined))
    })

    it('aucun cache : scenario "fresh" avec le coût canonique du périmètre', async () => {
      const service = await buildService(
        { add: jest.fn(), getJob: buildGetJobMock() },
        { findCompletedByUserAndCompany: null },
      )

      const plan = await service.planLaunch({ companyName: 'SNCF', scopeMode: 'groupe' }, 'user-1')

      // Le nombre EXACT n'est pas recopié ici (ce serait une seconde grille) —
      // on relit `resolveAnalysisCost`, la fonction que `consumeAnalysisSlot`
      // appelle pour DÉBITER, pour qu'un changement de grille ne puisse jamais
      // faire diverger l'aperçu du débit réel.
      // #2288.4 — entité jamais vue : aucune source de marchés publics annoncée.
      expect(plan).toEqual({
        scenario: 'fresh',
        credits: resolveAnalysisCost('groupe'),
        depths: expect.any(Array),
        publicTenderSources: [],
      })
    })

    // Théo B r1-recherche.A12 — « Analyse déjà en cours, lancée par {prénom} » se lit AVANT le clic, sous le champ
    // entreprise : l'aperçu nomme le run en vol (et qui l'a lancé), il ne le crée ni ne le rejoint.
    it('A12 — un run en vol sur ce nom est annoncé (accountId + lanceur) dans le plan "fresh"', async () => {
      const live = {
        id: 'acc-live',
        status: 'analyzing',
        company_name: 'SNCF',
        user_id: 'colleague',
        updated_at: new Date(),
      } as unknown as AccountEntity
      const service = await buildService(
        { add: jest.fn(), getJob: buildGetJobMock() },
        { findCompletedByUserAndCompany: null, findAnalyzingByUserAndCompany: live },
      )

      const plan = await service.planLaunch({ companyName: 'SNCF' }, 'user-1')

      expect(plan.scenario).toBe('fresh')
      expect((plan as { inFlight?: { accountId: string } }).inFlight).toMatchObject({ accountId: 'acc-live' })
    })

    it('A12 — aucun run en vol : pas de clé inFlight', async () => {
      const service = await buildService(
        { add: jest.fn(), getJob: buildGetJobMock() },
        { findCompletedByUserAndCompany: null },
      )
      const plan = await service.planLaunch({ companyName: 'SNCF' }, 'user-1')
      expect(plan).not.toHaveProperty('inFlight')
    })

    it('la démo gagne même quand un dossier récent existe — jamais de débit possible en démo', async () => {
      const cached = { id: 'acc-cached', status: 'completed', company_name: 'SNCF' } as AccountEntity
      const service = await buildService(
        { add: jest.fn(), getJob: buildGetJobMock() },
        { isDemoWorkspace: true, findCompletedByUserAndCompany: cached },
      )

      const plan = await service.planLaunch({ companyName: 'SNCF' }, 'user-1')

      expect(plan).toEqual({ scenario: 'demo' })
    })
  })

  // #2288.4 (c66) — le devis de vérification nomme BOAMP/DECP là où CE
  // lancement les interrogera, et seulement là. La gate vit dans
  // `collection_focus.py` ; `planLaunch` en lit le seul morceau décidable avant
  // le run — le pays que `start()` enverrait, et le NAF déjà persisté de
  // l'entité — sans appel réseau ni nouveau module.
  describe('planLaunch — les sources de marchés publics annoncées (#2288.4)', () => {
    const frResolution = {
      market: 'FR',
      countryCode: 'FR',
      defaultLocale: 'fr',
      legalBasis: 'RGPD',
      activeCountryPack: false,
    }
    const chResolution = {
      market: 'CH',
      countryCode: 'CH',
      defaultLocale: 'de',
      legalBasis: 'adéquation',
      activeCountryPack: true,
    }
    const publicAccount = {
      id: 'acc-mairie',
      status: 'completed',
      company_name: 'Ville de Lyon',
      workspace_id: 'ws-1',
      naf_code: '84.11Z',
    } as AccountEntity

    async function buildLaunchPlanService(opts: {
      /** Dossier complet ET frais (< 30 j) : le lanceur le rouvrirait. */
      fresh?: AccountEntity | null
      /** Le dossier déjà analysé, quel que soit son âge — l'entité que ce nom résout. */
      known?: AccountEntity | null
      market: { resolveForWorkspace: jest.Mock } | null
    }) {
      const findCompletedByUserAndCompany = jest
        .fn()
        .mockResolvedValueOnce(opts.fresh ?? null)
        .mockResolvedValueOnce(opts.known ?? null)
      const moduleRef = await Test.createTestingModule({
        providers: [
          AnalysisService,
          { provide: getQueueToken('analysis'), useValue: { add: jest.fn(), getJob: jest.fn() } },
          {
            provide: AccountsService,
            useValue: {
              findCompletedByUserAndCompany,
              // Théo B r1-recherche.A12 — l'aperçu lit aussi le run en vol.
              findAnalyzingByUserAndCompany: jest.fn().mockResolvedValue(null),
            },
          },
          { provide: ContactsService, useValue: { findByAccount: jest.fn() } },
          { provide: AnalysisCancellationService, useValue: { register: jest.fn(), unregister: jest.fn() } },
          esnProfileProvider(),
          creditsProvider(),
          { provide: AnalysisRunsService, useValue: runsServiceMock() },
          { provide: AnalysisPersistenceService, useValue: { recordAnalysisStarted: jest.fn() } },
          { provide: WorkspaceContextService, useValue: { isDemoWorkspace: jest.fn().mockResolvedValue(false) } },
          ...(opts.market ? [{ provide: WorkspaceMarketService, useValue: opts.market }] : []),
        ],
      }).compile()
      return { service: moduleRef.get(AnalysisService), findCompletedByUserAndCompany }
    }

    afterEach(() => jest.restoreAllMocks())

    it('une entité PUBLIQUE connue, marché France : BOAMP et DECP annoncés — sans aucun appel réseau', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch')
      const market = { resolveForWorkspace: jest.fn().mockResolvedValue(frResolution) }
      const { service, findCompletedByUserAndCompany } = await buildLaunchPlanService({ known: publicAccount, market })

      const plan = await service.planLaunch({ companyName: 'Ville de Lyon' }, 'user-1')

      expect(plan).toEqual({
        scenario: 'fresh',
        credits: resolveAnalysisCost(undefined),
        depths: expect.any(Array),
        publicTenderSources: ['boamp', 'decp'],
        // #2292.17/.18 (épopée #2929) — un dossier existe déjà, hors fenêtre de
        // cache : « analyse neuve » ne suffit plus à le dire, l'écran doit
        // savoir que ce nom est DÉJÀ CONNU pour afficher « à actualiser »
        // plutôt que de laisser croire à un compte jamais vu.
        knownAccount: { accountId: 'acc-mairie', companyName: 'Ville de Lyon' },
      })
      expect(fetchSpy).not.toHaveBeenCalled()
      // Le pays est lu pour l'espace de l'entité, comme `start()` le lit pour le run.
      expect(market.resolveForWorkspace).toHaveBeenCalledWith('ws-1')
      // L'entité connue est cherchée QUEL QUE SOIT son âge — le cache de 30 j ne
      // dit que « rouvrir », pas « jamais vue ».
      expect(findCompletedByUserAndCompany).toHaveBeenLastCalledWith(
        'user-1',
        'Ville de Lyon',
        expect.objectContaining({ maxAgeDays: expect.any(Number) }),
      )
      const [, , lookup] = findCompletedByUserAndCompany.mock.calls[1]!
      expect(lookup.maxAgeDays).toBeGreaterThan(30)
    })

    it('une entreprise INCONNUE : rien n’est annoncé, et le marché n’est même pas lu', async () => {
      const market = { resolveForWorkspace: jest.fn().mockResolvedValue(frResolution) }
      const { service } = await buildLaunchPlanService({ known: null, market })

      const plan = await service.planLaunch({ companyName: 'Inconnue SAS' }, 'user-1')

      expect(plan).toEqual({
        scenario: 'fresh',
        credits: resolveAnalysisCost(undefined),
        depths: expect.any(Array),
        publicTenderSources: [],
      })
      expect(market.resolveForWorkspace).not.toHaveBeenCalled()
    })

    it('un espace ciblant un marché HORS France : rien, même pour une entité publique', async () => {
      const market = { resolveForWorkspace: jest.fn().mockResolvedValue(chResolution) }
      const { service } = await buildLaunchPlanService({ known: publicAccount, market })

      const plan = await service.planLaunch({ companyName: 'Ville de Lyon' }, 'user-1')

      expect(plan).toMatchObject({ scenario: 'fresh', publicTenderSources: [] })
    })

    it('la lecture du marché ÉCHOUE : rien — le repli France du lanceur n’est pas une annonce', async () => {
      const market = { resolveForWorkspace: jest.fn().mockRejectedValue(new Error('db down')) }
      const { service } = await buildLaunchPlanService({ known: publicAccount, market })

      const plan = await service.planLaunch({ companyName: 'Ville de Lyon' }, 'user-1')

      expect(plan).toMatchObject({ scenario: 'fresh', publicTenderSources: [] })
    })

    it('un dossier FRAIS est rouvert, pas relancé : aucune source n’est interrogée, donc aucune annoncée', async () => {
      const market = { resolveForWorkspace: jest.fn().mockResolvedValue(frResolution) }
      const { service } = await buildLaunchPlanService({ fresh: publicAccount, known: publicAccount, market })

      const plan = await service.planLaunch({ companyName: 'Ville de Lyon' }, 'user-1')

      expect(plan).toEqual({ scenario: 'cache_hit', accountId: 'acc-mairie', companyName: 'Ville de Lyon' })
    })
  })

  // Bug prod 19/07 (Théo, TF1) : la barre de recherche affichait « Lancement de
  // l'analyse » à 0% pour toujours après un cache hit. `start` renvoyait la MÊME
  // forme `{ jobId, accountId }` qu'un vrai lancement, donc le front ne pouvait
  // pas distinguer « run en cours » de « rien n'a été lancé » : il ouvrait une
  // carte de progression qui attendait des events WS qui n'arriveraient jamais.
  // `launched` est ce discriminant — il DOIT être faux dès qu'aucun run n'est en
  // cours pour ce compte.
  describe('launched discriminator (aucun run fantôme côté UI)', () => {
    it('cache hit : launched=false + reason=cache_hit (aucun job enqueué)', async () => {
      const cached = { id: 'acc-cached', status: 'completed', company_name: 'SNCF' } as AccountEntity
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }, { findCompletedByUserAndCompany: cached })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) {
        expect(res.output.launched).toBe(false)
        expect(res.output.reason).toBe('cache_hit')
      }
      expect(add).not.toHaveBeenCalled()
    })

    it('cache miss : launched=true (un run tourne vraiment)', async () => {
      const add = buildAddMock()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }, { findCompletedByUserAndCompany: null })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) {
        expect(res.output.launched).toBe(true)
        expect(res.output.reason).toBeUndefined()
      }
    })

    it('job déjà en vol : launched=true (le front doit bien s’abonner)', async () => {
      const activeJob: StateHolder = {
        id: 'analysis-user-1-sncf',
        data: { accountId: 'acc-inflight' },
        getState: jest.fn<Promise<string>, []>().mockResolvedValue('active'),
        remove: jest.fn<Promise<void>, []>(),
      }
      const add = jest.fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      const getJob = buildGetJobMock(activeJob)
      const service = await buildService({ add, getJob }, { findCompletedByUserAndCompany: null })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) {
        expect(res.output.launched).toBe(true)
        expect(res.output.reason).toBe('in_flight')
      }
      expect(add).not.toHaveBeenCalled()
    })
  })

  describe('plan quota (accounts_limit)', () => {
    it('returns quota_exceeded and does not enqueue when the plan cap is reached', async () => {
      const add = buildAddMock()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }, { slot: { ok: false, used: 3, limit: 3 } })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isFailure(res)).toBe(true)
      if (isFailure(res)) expect(res.problem.code).toBe('quota_exceeded')
      // Cap reached → no account pre-created, no IA run enqueued.
      expect(add).not.toHaveBeenCalled()
    })

    it('allows more than 5 launches within the hour — the plan quota is the only cap', async () => {
      // The 5-analyses-per-hour guardrail is gone (product decision): as long
      // as the plan slot claim succeeds, launch #6, #7… go through unthrottled.
      const add = buildAddMock()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }, { slot: { ok: true, used: 1, limit: 100 } })

      const companies = ['SNCF', 'AXA', 'Orange', 'Thales', 'Doctolib', 'Nestlé', 'Airbus']
      for (const company of companies) {
        const res = await service.start({ company_name: company }, 'user-1')
        expect(isSuccess(res)).toBe(true)
      }

      // Every launch reached the queue — nothing was rate-limited by the hour.
      expect(add).toHaveBeenCalledTimes(companies.length)
    })

    it('force (operator launch) bypasses the plan cap', async () => {
      const add = buildAddMock()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }, { slot: { ok: false, used: 3, limit: 3 } })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1', { force: true })

      expect(isSuccess(res)).toBe(true)
      expect(add).toHaveBeenCalledTimes(1)
    })

    it('refunds the claimed slot when account pre-creation fails', async () => {
      const add = buildAddMock()
      const credits = {
        consumeAnalysisSlot: jest.fn().mockResolvedValue({ ok: true, used: 1, limit: 3 }),
        refundAnalysisSlot: jest.fn().mockResolvedValue(undefined),
        attachAnalysisDebit: jest.fn().mockResolvedValue(undefined),
        hasOutstandingAnalysisDebit: jest.fn().mockResolvedValue(true),
      }
      const moduleRef = await Test.createTestingModule({
        providers: [
          AnalysisService,
          { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(undefined), add } },
          {
            provide: AccountsService,
            useValue: {
              create: jest.fn().mockResolvedValue(failure({ code: 'db_error', message: 'insert failed' })),
              findAnalyzingByUserAndCompany: jest.fn().mockResolvedValue(null),
              findCompletedByUserAndCompany: jest.fn().mockResolvedValue(null),
              findReusableFailedByUserAndCompany: jest.fn().mockResolvedValue(null),
              findSameCompanyAccount: jest.fn().mockResolvedValue(null),
            },
          },
          { provide: ContactsService, useValue: { findByAccount: jest.fn() } },
          {
            provide: AnalysisCancellationService,
            useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
          },
          esnProfileProvider(),
          { provide: CreditsService, useValue: credits },
          { provide: AnalysisRunsService, useValue: runsServiceMock() },
          {
            provide: AnalysisPersistenceService,
            useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile()
      const service = moduleRef.get(AnalysisService)

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isFailure(res)).toBe(true)
      if (isFailure(res)) expect(res.problem.code).toBe('create_failed')
      expect(credits.consumeAnalysisSlot).toHaveBeenCalledWith('user-1', expect.objectContaining({ reason: 'SNCF' }))
      // Slot given back — the run never actually started.
      expect(credits.refundAnalysisSlot).toHaveBeenCalledWith('user-1', expect.any(Object))
      expect(add).not.toHaveBeenCalled()

      // Louis 10/10 — le remboursement rend le prix DÉBITÉ du palier choisi
      // (Rapide = 5), jamais le défaut Approfondie (10).
      await service.start({ company_name: 'SNCF', scope_selection: { depth: 'quick' } }, 'user-1')
      expect(credits.consumeAnalysisSlot).toHaveBeenLastCalledWith('user-1', expect.objectContaining({ cost: 5 }))
      expect(credits.refundAnalysisSlot).toHaveBeenLastCalledWith('user-1', expect.objectContaining({ cost: 5 }))
    })

    it('refunds the slot + marks the account errored when enqueue throws', async () => {
      // The account was created + the slot claimed, then queue.add throws (bad
      // jobId, Redis down…). No credit should burn and no `analyzing` orphan.
      const add = jest.fn().mockRejectedValue(new Error('Custom Ids cannot contain :'))
      const credits = {
        consumeAnalysisSlot: jest.fn().mockResolvedValue({ ok: true, used: 1, limit: 3 }),
        refundAnalysisSlot: jest.fn().mockResolvedValue(undefined),
        attachAnalysisDebit: jest.fn().mockResolvedValue(undefined),
        hasOutstandingAnalysisDebit: jest.fn().mockResolvedValue(true),
      }
      const markErrored = jest.fn().mockResolvedValue(undefined)
      const moduleRef = await Test.createTestingModule({
        providers: [
          AnalysisService,
          { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(undefined), add } },
          {
            provide: AccountsService,
            useValue: {
              create: jest.fn().mockResolvedValue(success({ id: 'acc-new' })),
              markErrored,
              findAnalyzingByUserAndCompany: jest.fn().mockResolvedValue(null),
              findCompletedByUserAndCompany: jest.fn().mockResolvedValue(null),
              findReusableFailedByUserAndCompany: jest.fn().mockResolvedValue(null),
              findSameCompanyAccount: jest.fn().mockResolvedValue(null),
            },
          },
          { provide: ContactsService, useValue: { findByAccount: jest.fn() } },
          {
            provide: AnalysisCancellationService,
            useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
          },
          esnProfileProvider(),
          { provide: CreditsService, useValue: credits },
          { provide: AnalysisRunsService, useValue: runsServiceMock() },
          {
            provide: AnalysisPersistenceService,
            useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile()
      const service = moduleRef.get(AnalysisService)

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isFailure(res)).toBe(true)
      if (isFailure(res)) expect(res.problem.code).toBe('create_failed')
      expect(credits.refundAnalysisSlot).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ accountId: 'acc-new' }),
      )
      expect(markErrored).toHaveBeenCalledWith('acc-new', expect.any(String))
    })

    // #4119 — entre le débit du créneau et l'enfilage, tout ce qui LÈVE (écriture du run, lecture de
    // contexte…) laissait le crédit pris : le faucheur ne voit qu'un compte `analyzing`, et le
    // remboursement nocturne (c78) ne couvre que les débits `refresh:`.
    it('#4119 — une exception APRÈS le débit rend le crédit UNE fois et remonte (jamais un crédit brûlé en silence)', async () => {
      let credits: ReturnType<typeof creditsProvider>['useValue'] | undefined
      const runs = runsServiceMock()
      runs.recordStart.mockRejectedValue(new Error('db down'))
      const add = buildAddMock()
      const service = await buildService({ add, getJob: buildGetJobMock() }, { runs, onCredits: c => (credits = c) })

      await expect(service.start({ company_name: 'SNCF' }, 'user-1')).rejects.toThrow('db down')

      expect(add).not.toHaveBeenCalled()
      expect(credits?.refundAnalysisSlot).toHaveBeenCalledTimes(1)
      expect(credits?.refundAnalysisSlot).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ accountId: 'acc-1' }),
      )
    })

    it('#4119 — une exception AVANT que le compte existe rend le crédit au tarif DÉBITÉ du palier choisi', async () => {
      let credits: ReturnType<typeof creditsProvider>['useValue'] | undefined
      const service = await buildService(
        { add: buildAddMock(), getJob: buildGetJobMock() },
        { onCredits: c => (credits = c) },
      )
      const accounts = (service as unknown as { accountsService: { create: jest.Mock } }).accountsService
      accounts.create.mockRejectedValue(new Error('pool épuisé'))

      await expect(
        service.start({ company_name: 'SNCF', scope_selection: { depth: 'quick' } }, 'user-1'),
      ).rejects.toThrow('pool épuisé')

      expect(credits?.refundAnalysisSlot).toHaveBeenCalledTimes(1)
      expect(credits?.refundAnalysisSlot).toHaveBeenCalledWith('user-1', expect.objectContaining({ cost: 5 }))
    })

    it('#4119 — lancement opérateur (force) qui lève : rien n’a été débité, rien n’est rendu', async () => {
      let credits: ReturnType<typeof creditsProvider>['useValue'] | undefined
      const runs = runsServiceMock()
      runs.recordStart.mockRejectedValue(new Error('db down'))
      const service = await buildService(
        { add: buildAddMock(), getJob: buildGetJobMock() },
        { runs, onCredits: c => (credits = c) },
      )

      await expect(service.start({ company_name: 'SNCF' }, 'user-1', { force: true })).rejects.toThrow('db down')

      expect(credits?.refundAnalysisSlot).not.toHaveBeenCalled()
    })

    it('#4119 — l’enfilage qui lève passe par SON remboursement : le filet général ne rend pas une 2e fois', async () => {
      let credits: ReturnType<typeof creditsProvider>['useValue'] | undefined
      const add = jest.fn().mockRejectedValue(new Error('redis down'))
      const service = await buildService({ add, getJob: buildGetJobMock() }, { onCredits: c => (credits = c) })

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isFailure(res)).toBe(true)
      expect(credits?.refundAnalysisSlot).toHaveBeenCalledTimes(1)
    })

    it('#4119 — création de compte refusée (échec typé) : un seul remboursement, pas deux', async () => {
      let credits: ReturnType<typeof creditsProvider>['useValue'] | undefined
      const service = await buildService(
        { add: buildAddMock(), getJob: buildGetJobMock() },
        { onCredits: c => (credits = c) },
      )
      const accounts = (service as unknown as { accountsService: { create: jest.Mock } }).accountsService
      accounts.create.mockResolvedValue(failure({ code: 'db_error', message: 'insert failed' }))

      const res = await service.start({ company_name: 'SNCF' }, 'user-1')

      expect(isFailure(res)).toBe(true)
      expect(credits?.refundAnalysisSlot).toHaveBeenCalledTimes(1)
    })
  })

  it('enqueues with a bounded auto-retry + jitter backoff so a transient stream cut self-heals', async () => {
    const add = buildAddMock()
    const getJob = buildGetJobMock()
    const service = await buildService({ add, getJob })

    await service.start({ company_name: 'Orange' }, 'user-9')

    const callOpts = add.mock.calls[0]![2]
    // attempts: 3 — a mid-run redeploy cutting the SSE surfaces as a retryable
    // AnalysisStreamInterruptedError; BullMQ re-runs the SAME job (same jobId → the
    // credit is never re-charged) and the worker resumes via outbox checkpoints. A
    // genuine failure is thrown as UnrecoverableError → moved straight to failed.
    expect(callOpts).toEqual({
      jobId: 'analysis-user-9-orange',
      attempts: 3,
      backoff: { type: 'exponential-jitter', delay: 5000 },
    })
  })

  it('consumes the analysis slot EXACTLY ONCE at start — the retry budget never re-charges', async () => {
    // No double-bill guard: the credit is claimed once here at enqueue time. The
    // three attempts are BullMQ re-runs of the SAME job (no second queue.add), so
    // consumeAnalysisSlot is never called again — the retry rides on the credit
    // already paid. (The refund on terminal failure lives in the worker's onFailed.)
    const slot = { ok: true, used: 1, limit: 10 }
    const consumeAnalysisSlot = jest.fn().mockResolvedValue(slot)
    const add = buildAddMock()
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { getJob: buildGetJobMock(), add } },
        {
          provide: AccountsService,
          useValue: {
            create: jest.fn().mockResolvedValue(success({ id: 'acc-1', status: 'analyzing' } as AccountEntity)),
            findOne: jest.fn(),
            countCreatedSince: jest.fn().mockResolvedValue(0),
            findAnalyzingByUserAndCompany: jest.fn().mockResolvedValue(null),
            findCompletedByUserAndCompany: jest.fn().mockResolvedValue(null),
            findReusableFailedByUserAndCompany: jest.fn().mockResolvedValue(null),
            findSameCompanyAccount: jest.fn().mockResolvedValue(null),
            reuseForRelaunch: jest.fn().mockResolvedValue(undefined),
            markErrored: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        {
          provide: CreditsService,
          useValue: {
            consumeAnalysisSlot,
            refundAnalysisSlot: jest.fn(),
            attachAnalysisDebit: jest.fn().mockResolvedValue(undefined),
            hasOutstandingAnalysisDebit: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)

    await service.start({ company_name: 'Orange' }, 'user-9')

    expect(consumeAnalysisSlot).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(1)
    // The single enqueue carries the whole retry budget — retries reuse this job.
    expect(add.mock.calls[0]![2]).toMatchObject({ attempts: 3 })
  })

  it('getStatus returns 100% completed when account.status=completed', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue(
                success({ id: 'a-1', user_id: 'u-1', company_name: 'SNCF', status: 'completed' } as AccountEntity),
              ),
          },
        },
        { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)
    const status = await service.getStatus('a-1', 'u-1')
    expect(isSuccess(status)).toBe(true)
    if (isSuccess(status)) {
      expect(status.output).toEqual({
        jobId: 'analysis-u-1-sncf',
        state: 'completed',
        percent: 100,
        phase: 'analysis_done',
        completedPhases: ['research', 'contacts', 'classify', 'plan'],
        // #2283.32 — pas de raw_analysis dans ce compte de test : aucun verdict
        // d'identité à lire, donc pas d'ambiguïté (jamais devinée).
        entityAmbiguity: null,
      })
    }
  })

  it('#2283.32 — getStatus lit un Résolveur d’identité (#2284) ambigu et rend ses candidats à SIREN', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(
              success({
                id: 'a-1',
                user_id: 'u-1',
                company_name: 'Groupe Horizon',
                status: 'completed',
                raw_analysis: {
                  entity_resolution: {
                    state: 'ambiguous',
                    kind: null,
                    canonical_id: null,
                    commercial_name: 'Groupe Horizon',
                    legal_name: null,
                    country: null,
                    identifiers: {},
                    domain: null,
                    naf_code: null,
                    naf_label: null,
                    location: null,
                    parent_names: [],
                    children_count: null,
                    sources: ['normalized_name'],
                    confidence: null,
                    reasons: [],
                    question: {
                      candidates: [
                        { name: 'Groupe Horizon SA', siren: '900000011', city: 'Lyon' },
                        { name: 'Horizon Services', siren: null, city: 'Nantes' },
                      ],
                    },
                    resolved_at: '2026-09-25T10:00:00Z',
                  },
                },
              } as unknown as AccountEntity),
            ),
          },
        },
        { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)
    const status = await service.getStatus('a-1', 'u-1')
    expect(isSuccess(status)).toBe(true)
    if (isSuccess(status)) {
      // Le candidat SANS siren n'est pas un candidat actionnable (rien à
      // confirmer ni exclure sur lui) — même filtre que la résolution de nom.
      expect(status.output.entityAmbiguity).toEqual({
        candidates: [{ name: 'Groupe Horizon SA', siren: '900000011', city: 'Lyon' }],
      })
    }
  })

  it('getStatus returns canceled when account.status=canceled', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue(
                success({ id: 'a-1', user_id: 'u-1', company_name: 'SNCF', status: 'canceled' } as AccountEntity),
              ),
          },
        },
        { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)
    const status = await service.getStatus('a-1', 'u-1')
    expect(isSuccess(status)).toBe(true)
    if (isSuccess(status)) {
      expect(status.output).toEqual({
        jobId: 'analysis-u-1-sncf',
        state: 'canceled',
        percent: 0,
        phase: null,
        completedPhases: [],
      })
    }
  })

  describe('getStatus — réparation à la lecture d’un run fantôme', () => {
    // Un run dont le worker est mort sans émettre d'événement terminal (éviction
    // Redis / redeploy) est réparé à la LECTURE, avant que le faucheur périodique
    // ne le voie. Ce chemin volait donc la transition au faucheur : le compte
    // passait en `error` et PERSONNE ne remboursait le crédit. La transition est
    // gardée (`markInterrupted` → booléen) pour qu'un seul chemin rembourse.
    async function buildForStaleRead(markInterrupted: jest.Mock) {
      const stale = {
        id: 'a-1',
        user_id: 'u-1',
        company_name: 'SNCF',
        status: 'analyzing',
        // Antérieur au plafond dur du job ⇒ considéré périmé.
        updated_at: new Date(Date.now() - JOB_TIMEOUT_MS - 60_000),
      } as unknown as AccountEntity
      const moduleRef = await Test.createTestingModule({
        providers: [
          AnalysisService,
          { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(undefined) } },
          {
            provide: AccountsService,
            useValue: { findOne: jest.fn().mockResolvedValue(success(stale)), markInterrupted },
          },
          { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
          {
            provide: AnalysisCancellationService,
            useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
          },
          esnProfileProvider(),
          creditsProvider(),
          { provide: AnalysisRunsService, useValue: runsServiceMock() },
          {
            provide: AnalysisPersistenceService,
            useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile()
      return {
        service: moduleRef.get(AnalysisService),
        credits: moduleRef.get(CreditsService),
      }
    }

    it('rembourse le crédit quand la réparation gagne la transition', async () => {
      const { service, credits } = await buildForStaleRead(jest.fn().mockResolvedValue(true))

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (isSuccess(status)) expect(status.output.state).toBe('failed')
      expect(credits.refundAnalysisSlot as jest.Mock).toHaveBeenCalledWith('u-1', {
        reason: expect.stringContaining('interrompu'),
        accountId: 'a-1',
      })
    })

    it('ne rembourse PAS quand un autre chemin a déjà basculé la ligne (transition perdue)', async () => {
      const { service, credits } = await buildForStaleRead(jest.fn().mockResolvedValue(false))

      await service.getStatus('a-1', 'u-1')

      expect(credits.refundAnalysisSlot as jest.Mock).not.toHaveBeenCalled()
    })
  })

  it("getStatus n'hérite PAS du dossier du run précédent sur une relance", async () => {
    /**
     * Le défaut vécu sur AIRBUS le 19/08. L'estimation se lit sur le dossier
     * PERSISTÉ : des contacts, un `raw_analysis` rempli ⇒ « 85 %,
     * classify_complete ». Sur une RELANCE, ce dossier est celui du run
     * précédent — la barre partait donc à 85 % à la première seconde et n'en
     * bougeait plus pendant douze minutes.
     *
     * Ce que l'utilisateur en conclut n'est pas « l'estimation est optimiste »,
     * c'est « l'analyse ne marche pas ». `percent: null` — « on ne sait pas
     * encore » — est la réponse vraie, et l'interface sait l'afficher.
     */
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: getQueueToken('analysis'),
          useValue: { getJob: jest.fn().mockResolvedValue({ getState: jest.fn().mockResolvedValue('active') }) },
        },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(
              success({
                id: 'a-1',
                user_id: 'u-1',
                company_name: 'AIRBUS',
                status: 'analyzing',
                sector: 'Aéronautique',
                raw_analysis: { sector: 'Aéronautique' },
                // Le dossier date du run PRÉCÉDENT : écrit avant que celui-ci
                // ne démarre. Il ne prouve rien sur le run en cours.
                updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
              } as unknown as AccountEntity),
            ),
          },
        },
        {
          provide: ContactsService,
          useValue: { findByAccount: jest.fn().mockResolvedValue([{}, {}, {}]) },
        },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProvider(),
        {
          provide: AnalysisRunsService,
          useValue: {
            ...runsServiceMock(),
            // Le run courant vient de démarrer.
            latestStartedAt: jest.fn().mockResolvedValue(new Date(Date.now() - 10_000)),
          },
        },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)
    const status = await service.getStatus('a-1', 'u-1')

    expect(isSuccess(status)).toBe(true)
    if (isSuccess(status)) {
      expect(status.output.state).toBe('active')
      expect(status.output.percent).toBeNull()
      expect(status.output.phase).toBeNull()
    }
  })

  it('getStatus estimates progress from contacts count + raw_analysis when active', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: getQueueToken('analysis'),
          useValue: { getJob: jest.fn().mockResolvedValue({ getState: jest.fn().mockResolvedValue('active') }) },
        },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(
              success({
                id: 'a-1',
                user_id: 'u-1',
                company_name: 'SNCF',
                status: 'analyzing',
                sector: 'Transport',
                raw_analysis: { sector: 'Transport' },
                // Écrit PENDANT ce run : c'est ce qui rend l'inférence légitime.
                updated_at: new Date(),
              } as unknown as AccountEntity),
            ),
          },
        },
        {
          provide: ContactsService,
          useValue: { findByAccount: jest.fn().mockResolvedValue([{}, {}, {}]) },
        },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)
    const status = await service.getStatus('a-1', 'u-1')
    expect(isSuccess(status)).toBe(true)
    if (isSuccess(status)) {
      expect(status.output.state).toBe('active')
      expect(status.output.percent).toBe(85)
      expect(status.output.phase).toBe('classify_complete')
    }
  })

  describe('getStatus — la position du run vient de l’ÉTAT, pas du flux d’événements', () => {
    /** Build a service whose account is mid-run, with `checkpointed` phases
     *  recorded in the outbox and `contacts` rows persisted. */
    /** Le dernier lecteur de points de contrôle monté — pour vérifier AVEC QUOI
     *  il a été appelé, et pas seulement ce qu'il a rendu. */
    let lastCheckpointReader: { loadCompletedPhaseNames: jest.Mock } | null = null

    async function buildService(opts: {
      checkpointed?: string[] | 'unavailable'
      contacts?: number
      account?: Partial<AccountEntity>
      /** Frontière du run courant rendue par `AnalysisRunsService`. */
      runStartedAt?: Date | null
    }) {
      const runs = runsServiceMock()
      if (opts.runStartedAt !== undefined) runs.latestStartedAt.mockResolvedValue(opts.runStartedAt)
      const providers: Parameters<typeof Test.createTestingModule>[0]['providers'] = [
        AnalysisService,
        {
          provide: getQueueToken('analysis'),
          useValue: { getJob: jest.fn().mockResolvedValue({ getState: jest.fn().mockResolvedValue('active') }) },
        },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(
              success({
                id: 'a-1',
                user_id: 'u-1',
                company_name: 'ALSEDIS',
                status: 'analyzing',
                updated_at: new Date(),
                ...opts.account,
              } as unknown as AccountEntity),
            ),
          },
        },
        {
          provide: ContactsService,
          useValue: {
            findByAccount: jest.fn().mockResolvedValue(Array.from({ length: opts.contacts ?? 0 }, () => ({}))),
          },
        },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runs },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ]
      lastCheckpointReader = null
      if (opts.checkpointed !== undefined) {
        lastCheckpointReader = {
          loadCompletedPhaseNames:
            opts.checkpointed === 'unavailable'
              ? jest.fn().mockRejectedValue(new Error('outbox unreachable'))
              : jest.fn().mockResolvedValue(opts.checkpointed),
        }
        providers.push({ provide: AnalysisCheckpointReader, useValue: lastCheckpointReader })
      }
      const moduleRef = await Test.createTestingModule({ providers }).compile()
      return moduleRef.get(AnalysisService)
    }

    // THE test that matters: this is the ALSEDIS case. A client connecting late
    // to a run whose phases have completed must see the real position — not the
    // 0% the (volatile, un-replayed) event stream would leave it on.
    it('un client qui rejoint tard un run dont 3 phases sont finies voit la VRAIE position, pas 0%', async () => {
      const service = await buildService({ checkpointed: ['research', 'contacts', 'classify'] })

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (!isSuccess(status)) return
      expect(status.output.state).toBe('active')
      expect(status.output.percent).toBe(75)
      expect(status.output.phase).toBe('classify_complete')
      // …et la checklist se reconstruit : montrer l'étape 1 alors que 3 phases
      // sont faites est le même mensonge sous une autre forme.
      expect(status.output.completedPhases).toEqual(['research', 'contacts', 'classify'])
    })

    // Le pendant du test précédent, et le bug vu en production le 16/08 :
    // « Actualiser » sur un dossier déjà analysé affichait « Progression 100 % »
    // dès la première seconde. Le `jobId` étant déterministe, les points de
    // contrôle du run PRÉCÉDENT portent le même couple (compte, job) — la
    // lecture doit donc être bornée au run courant.
    it('borne les points de contrôle au run COURANT (une relance ne naît pas à 100 %)', async () => {
      const runStartedAt = new Date('2026-08-16T08:00:00.000Z')
      const service = await buildService({ checkpointed: ['research', 'contacts', 'classify'], runStartedAt })

      await service.getStatus('a-1', 'u-1')

      expect(lastCheckpointReader?.loadCompletedPhaseNames).toHaveBeenCalledWith(
        'a-1',
        expect.any(String),
        runStartedAt,
      )
    })

    it('ordonne par l’ordre canonique du pipeline, pas par l’ordre des lignes outbox', async () => {
      const service = await buildService({ checkpointed: ['classify', 'research', 'contacts'] })

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (!isSuccess(status)) return
      expect(status.output.percent).toBe(75)
      expect(status.output.completedPhases).toEqual(['research', 'contacts', 'classify'])
    })

    it('les checkpoints priment sur l’estimation heuristique du dossier', async () => {
      // Le dossier contient des contacts + raw_analysis (l'heuristique dirait
      // 85 %), mais SEULE la phase research est checkpointée pour CE job.
      const service = await buildService({
        checkpointed: ['research'],
        contacts: 12,
        account: { raw_analysis: { sector: 'Retail' } } as Partial<AccountEntity>,
      })

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (!isSuccess(status)) return
      expect(status.output.percent).toBe(25)
      expect(status.output.phase).toBe('research_complete')
    })

    // « Ne JAMAIS inventer de progression » — un chiffre faux est pire que pas
    // de chiffre. Avant, ce cas renvoyait un plancher inventé de 10 %.
    it('renvoie percent=null quand le serveur ne peut PAS dire où en est le run', async () => {
      const service = await buildService({ checkpointed: [], contacts: 0 })

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (!isSuccess(status)) return
      expect(status.output.state).toBe('active')
      expect(status.output.percent).toBeNull()
      expect(status.output.phase).toBeNull()
      expect(status.output.completedPhases).toEqual([])
    })

    it('un échec de lecture des checkpoints dégrade en position inconnue, jamais en 0%', async () => {
      const service = await buildService({ checkpointed: 'unavailable', contacts: 0 })

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (!isSuccess(status)) return
      expect(status.output.percent).toBeNull()
      expect(status.output.completedPhases).toEqual([])
    })

    it('un dossier terminé annonce 100% ET les quatre phases (checklist complète)', async () => {
      const service = await buildService({ checkpointed: [], account: { status: 'completed' } })

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (!isSuccess(status)) return
      expect(status.output.state).toBe('completed')
      expect(status.output.percent).toBe(100)
      expect(status.output.completedPhases).toEqual(['research', 'contacts', 'classify', 'plan'])
    })

    // #2478 — « les analyses échouent presque à chaque fois et en plus c'est
    // faux, une grande partie a fonctionné ». Avant ce correctif, la branche
    // `account.status === 'error'` rendait `completedPhases: []` en DUR, sans
    // jamais consulter l'outbox — un run qui avait fini `research` et
    // `contacts` avant de tomber en `plan` se lisait comme un échec TOTAL,
    // alors que le service savait exactement ce qui avait abouti.
    it('un run ERRONÉ dont des phases sont checkpointées les RENVOIE, jamais []', async () => {
      const service = await buildService({
        checkpointed: ['research', 'contacts'],
        account: { status: 'error' },
      })

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (!isSuccess(status)) return
      expect(status.output.state).toBe('failed')
      expect(status.output.completedPhases).toEqual(['research', 'contacts'])
    })

    // Témoin voisin : un run qui n'a RIEN checkpointé (mort dès la phase 1)
    // reste bien à [] — ce n'est pas « toujours tout rendre », c'est rendre le
    // VRAI compte, qui peut légitimement être vide.
    it('un run ERRONÉ sans aucun checkpoint reste à [] — le vrai compte, pas un défaut caché', async () => {
      const service = await buildService({ checkpointed: [], account: { status: 'error' } })

      const status = await service.getStatus('a-1', 'u-1')

      expect(isSuccess(status)).toBe(true)
      if (!isSuccess(status)) return
      expect(status.output.state).toBe('failed')
      expect(status.output.completedPhases).toEqual([])
    })
  })

  it('cancel() aborts the worker AND removes the queued job', async () => {
    const cancellation = {
      register: jest.fn().mockReturnValue(new AbortController().signal),
      unregister: jest.fn(),
      cancel: jest.fn().mockReturnValue(true),
    }
    const job = { remove: jest.fn().mockResolvedValue(undefined) }
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(job) } },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue(
                success({ id: 'a-1', user_id: 'u-1', company_name: 'SNCF', status: 'analyzing' } as AccountEntity),
              ),
          },
        },
        { provide: ContactsService, useValue: { findByAccount: jest.fn() } },
        { provide: AnalysisCancellationService, useValue: cancellation },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)

    await service.cancel('a-1', 'u-1')

    expect(cancellation.cancel).toHaveBeenCalledWith('analysis-u-1-sncf', 'account_deleted')
    expect(job.remove).toHaveBeenCalledTimes(1)
  })

  it('cancel() swallows job.remove() errors (job may be locked) so the abort still wins', async () => {
    const cancellation = {
      register: jest.fn(),
      unregister: jest.fn(),
      cancel: jest.fn().mockReturnValue(true),
    }
    const job = { remove: jest.fn().mockRejectedValue(new Error('Job is locked')) }
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(job) } },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest
              .fn()
              .mockResolvedValue(
                success({ id: 'a-2', user_id: 'u-2', company_name: 'AXA', status: 'analyzing' } as AccountEntity),
              ),
          },
        },
        { provide: ContactsService, useValue: { findByAccount: jest.fn() } },
        { provide: AnalysisCancellationService, useValue: cancellation },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)

    await expect(service.cancel('a-2', 'u-2')).resolves.toBeUndefined()
    expect(cancellation.cancel).toHaveBeenCalledWith('analysis-u-2-axa', 'account_deleted')
  })

  describe('cancelByUser', () => {
    function buildService(
      opts: {
        accountFound?: boolean
        jobRemoveError?: Error
        status?: string
      } = {},
    ) {
      const cancellation = {
        register: jest.fn(),
        unregister: jest.fn(),
        cancel: jest.fn().mockReturnValue(true),
      }
      const job = {
        remove: opts.jobRemoveError
          ? jest.fn().mockRejectedValue(opts.jobRemoveError)
          : jest.fn().mockResolvedValue(undefined),
      }
      const accountsService = {
        findOne: jest.fn().mockResolvedValue(
          opts.accountFound === false
            ? failure({ code: 'not_found', message: 'gone' })
            : success({
                id: 'a-1',
                user_id: 'u-1',
                company_name: 'SNCF',
                status: opts.status ?? 'analyzing',
              } as AccountEntity),
        ),
        markCancelled: jest.fn().mockResolvedValue(undefined),
      }

      return Test.createTestingModule({
        providers: [
          AnalysisService,
          { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(job) } },
          { provide: AccountsService, useValue: accountsService },
          { provide: ContactsService, useValue: { findByAccount: jest.fn() } },
          { provide: AnalysisCancellationService, useValue: cancellation },
          esnProfileProvider(),
          creditsProvider(),
          { provide: AnalysisRunsService, useValue: runsServiceMock() },
          {
            provide: AnalysisPersistenceService,
            useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      })
        .compile()
        .then(m => ({
          service: m.get(AnalysisService),
          cancellation,
          accountsService,
          job,
        }))
    }

    it('aborts the worker, removes the job, and marks the account cancelled', async () => {
      const { service, cancellation, accountsService, job } = await buildService()

      const result = await service.cancelByUser('a-1', 'u-1')

      expect(isSuccess(result)).toBe(true)
      if (isSuccess(result)) expect(result.output).toEqual({ accountId: 'a-1' })
      // Reason distinguishes the legitimate user-triggered path from the
      // delete-account path in logs and Sentry context.
      expect(cancellation.cancel).toHaveBeenCalledWith('analysis-u-1-sncf', 'user_cancelled')
      expect(job.remove).toHaveBeenCalledTimes(1)
      expect(accountsService.markCancelled).toHaveBeenCalledWith('a-1', 'u-1')
    })

    it('returns not_found when the account is missing or owned by someone else', async () => {
      const { service, cancellation, accountsService } = await buildService({ accountFound: false })

      const result = await service.cancelByUser('ghost', 'u-1')

      expect(isFailure(result)).toBe(true)
      if (isFailure(result)) expect(result.problem.code).toBe('not_found')
      // Nothing was attempted on a non-owned account.
      expect(cancellation.cancel).not.toHaveBeenCalled()
      expect(accountsService.markCancelled).not.toHaveBeenCalled()
    })

    it.each(['completed', 'error', 'canceled'])(
      'audit H1 — refuse (not_cancellable → 409) une analyse déjà « %s » : rien annulé, rien rendu',
      async status => {
        const { service, cancellation, accountsService } = await buildService({ status })
        const credits = (service as unknown as { credits: { refundAnalysisSlot: jest.Mock } }).credits

        const result = await service.cancelByUser('a-1', 'u-1')

        expect(isFailure(result)).toBe(true)
        if (isFailure(result)) expect(result.problem.code).toBe('not_cancellable')
        expect(cancellation.cancel).not.toHaveBeenCalled()
        expect(accountsService.markCancelled).not.toHaveBeenCalled()
        expect(credits.refundAnalysisSlot).not.toHaveBeenCalled()
      },
    )

    it('rend le crédit : un run annulé ne livre aucun dossier, il ne se facture pas', async () => {
      const { service } = await buildService()
      const credits = (service as unknown as { credits: { refundAnalysisSlot: jest.Mock } }).credits

      await service.cancelByUser('a-1', 'u-1')

      // Le montant vient du REGISTRE (ce qui a réellement été débité), et
      // `requireLedgerDebit` interdit de créditer un run que le client n'a
      // jamais payé — un lancement opérateur, par exemple.
      expect(credits.refundAnalysisSlot).toHaveBeenCalledWith('u-1', {
        reason: 'annulation: SNCF',
        accountId: 'a-1',
        requireLedgerDebit: true,
      })
    })

    it('une annulation reste une annulation même si le remboursement échoue', async () => {
      const { service, accountsService } = await buildService()
      const credits = (service as unknown as { credits: { refundAnalysisSlot: jest.Mock } }).credits
      credits.refundAnalysisSlot.mockRejectedValueOnce(new Error('billing down'))

      const result = await service.cancelByUser('a-1', 'u-1')

      expect(isSuccess(result)).toBe(true)
      expect(accountsService.markCancelled).toHaveBeenCalledWith('a-1', 'u-1')
    })

    it('still marks cancelled even when job.remove() fails (locked job)', async () => {
      const { service, accountsService } = await buildService({
        jobRemoveError: new Error('Job is locked'),
      })

      const result = await service.cancelByUser('a-1', 'u-1')

      expect(isSuccess(result)).toBe(true)
      expect(accountsService.markCancelled).toHaveBeenCalledWith('a-1', 'u-1')
    })
  })

  describe('ESN profile conditioning', () => {
    it('start derives profile_data from the seller ESN onboarding answers', async () => {
      const answers: EsnAnswers = {
        ...EMPTY_ANSWERS,
        esn_name: 'Comet',
        expertise_areas: ['Data', 'Cloud'],
        target_sectors: ['Banque'],
        geo_zones: ['France'],
      }
      const add = buildAddMock()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }, { answers })

      await service.start({ company_name: 'SNCF' }, 'user-1')

      const data = add.mock.calls[0]![1]
      // Field-name mismatch is resolved: expertise→offers, target_sectors→sectors,
      // geo_zones→geoZone. This is what kills the "profile-neutral" run.
      expect(data.profileData).toEqual({
        companyName: 'Comet',
        offers: ['Data', 'Cloud'],
        sectors: ['Banque'],
        geoZone: 'France',
      })
    })

    it('start prefers an explicit dto.profile_data over the derived profile', async () => {
      const answers: EsnAnswers = { ...EMPTY_ANSWERS, esn_name: 'Comet' }
      const add = buildAddMock()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }, { answers })

      // Operator/demo override (internal-analyze path) must win untouched.
      await service.start({ company_name: 'SNCF', profile_data: { size: 'operator-override' } }, 'user-1')

      const data = add.mock.calls[0]![1]
      expect(data.profileData).toEqual({ size: 'operator-override' })
    })

    it('start enqueues {} when the seller has no onboarding answers (profile-neutral)', async () => {
      const add = buildAddMock()
      const getJob = buildGetJobMock()
      const service = await buildService({ add, getJob }) // default EMPTY_ANSWERS

      await service.start({ company_name: 'SNCF' }, 'user-1')

      const data = add.mock.calls[0]![1]
      expect(data.profileData).toEqual({})
    })

    it('resume re-derives the ESN profile instead of sending {}', async () => {
      const answers: EsnAnswers = { ...EMPTY_ANSWERS, esn_name: 'Comet', expertise_areas: ['Cloud'] }
      const add = buildAddMock()
      const moduleRef = await Test.createTestingModule({
        providers: [
          AnalysisService,
          { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(undefined), add } },
          {
            provide: AccountsService,
            useValue: {
              findOne: jest.fn().mockResolvedValue(
                success({
                  id: 'a-1',
                  user_id: 'u-1',
                  company_name: 'SNCF',
                  status: 'analyzing',
                  user_context: null,
                } as unknown as AccountEntity),
              ),
              markAnalyzing: jest.fn().mockResolvedValue(undefined),
            },
          },
          { provide: ContactsService, useValue: { findByAccount: jest.fn() } },
          {
            provide: AnalysisCancellationService,
            useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
          },
          esnProfileProvider(answers),
          creditsProvider(),
          { provide: AnalysisRunsService, useValue: runsServiceMock() },
          {
            provide: AnalysisPersistenceService,
            useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile()
      const service = moduleRef.get(AnalysisService)

      const res = await service.resume('a-1', 'u-1')

      expect(isSuccess(res)).toBe(true)
      const data = add.mock.calls[0]![1]
      // Regression guard for Matteo's finding: resume used to hardcode {}.
      expect(data.profileData).toEqual({ companyName: 'Comet', offers: ['Cloud'] })
      // A manual resume that itself hits a transient cut also self-heals: same
      // bounded auto-retry + jitter backoff as ``start``.
      expect(add.mock.calls[0]![2]).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential-jitter', delay: 5000 },
      })
    })
  })

  it('second concurrent POST returns the same jobId (queue dedupes via jobId)', async () => {
    const firstJob: StateHolder = {
      id: 'analysis-user-1-axa',
      data: { accountId: 'acc-first' },
      getState: jest.fn<Promise<string>, []>().mockResolvedValue('waiting'),
      remove: jest.fn<Promise<void>, []>(),
    }
    let callCount = 0
    const getJob = jest.fn<Promise<StateHolder | undefined>, Parameters<GetJobFn>>().mockImplementation(async () => {
      callCount += 1
      return callCount === 1 ? undefined : firstJob
    })
    const add = jest
      .fn<Promise<{ id: string }>, Parameters<JobAddFn>>()
      .mockImplementation(async (_name: string, data: JobAddData, opts: JobAddOpts) => {
        firstJob.data.accountId = data.accountId
        return { id: opts.jobId }
      })
    const service = await buildService({ add, getJob })

    const first = await service.start({ company_name: 'AXA' }, 'user-1')
    const second = await service.start({ company_name: 'AXA' }, 'user-1')

    expect(isSuccess(first) && isSuccess(second)).toBe(true)
    if (isSuccess(first) && isSuccess(second)) {
      expect(first.output.jobId).toBe('analysis-user-1-axa')
      expect(second.output.jobId).toBe('analysis-user-1-axa')
      expect(second.output.accountId).toBe(first.output.accountId)
    }
    expect(add).toHaveBeenCalledTimes(1)
  })
})

/* ------------------------------------------------------------------ */
/*  Market → `country` propagation to the IA (country packs)           */
/* ------------------------------------------------------------------ */

type MarketMock = { resolveForWorkspace: jest.Mock }

/** Build an AnalysisService wired to a market resolver and an account pre-create
 *  that carries a `workspace_id`, so we can observe what `country` (if any) ends
 *  up on the enqueued job. `market: null` omits the resolver entirely — the
 *  production wiring is `@Optional()`, and its absence must leave the FR path. */
async function buildServiceForMarket(
  add: QueueMock['add'],
  opts: {
    market: MarketMock | null
    workspaceId?: string | null
    channelPerformance?: { forWorkspace: jest.Mock }
  },
): Promise<AnalysisService> {
  const accountsService = {
    create: jest
      .fn()
      .mockResolvedValue(
        success({ id: 'acc-1', status: 'analyzing', workspace_id: opts.workspaceId ?? 'ws-1' } as AccountEntity),
      ),
    findOne: jest.fn(),
    findAnalyzingByUserAndCompany: jest.fn().mockResolvedValue(null),
    findCompletedByUserAndCompany: jest.fn().mockResolvedValue(null),
    findReusableFailedByUserAndCompany: jest.fn().mockResolvedValue(null),
    findSameCompanyAccount: jest.fn().mockResolvedValue(null),
  } as unknown as AccountsService
  const moduleRef = await Test.createTestingModule({
    providers: [
      AnalysisService,
      { provide: getQueueToken('analysis'), useValue: { add, getJob: jest.fn().mockResolvedValue(undefined) } },
      { provide: AccountsService, useValue: accountsService },
      { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
      {
        provide: AnalysisCancellationService,
        useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
      },
      esnProfileProvider(),
      creditsProvider(),
      { provide: AnalysisRunsService, useValue: runsServiceMock() },
      {
        provide: AnalysisPersistenceService,
        useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
      },
      ...(opts.market ? [{ provide: WorkspaceMarketService, useValue: opts.market }] : []),
      ...(opts.channelPerformance
        ? [{ provide: ChannelPerformanceReaderService, useValue: opts.channelPerformance }]
        : []),
    ],
  }).compile()
  return moduleRef.get(AnalysisService)
}

describe('AnalysisService — canaux MESURÉS de l’espace (#3278.3)', () => {
  const measured = [{ channel: 'call', sent: 20, replied: 8, sufficient: true, replyRate: 40 }]

  it('passe les canaux mesurés du workspace du compte au job', async () => {
    const add = buildAddMock()
    const channelPerformance = { forWorkspace: jest.fn().mockResolvedValue(measured) }
    const service = await buildServiceForMarket(add, { market: null, workspaceId: 'ws-9', channelPerformance })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(channelPerformance.forWorkspace).toHaveBeenCalledWith('ws-9')
    expect(add).toHaveBeenCalledWith(
      'analyze',
      expect.objectContaining({ channelPerformance: measured }),
      expect.anything(),
    )
  })

  it('omet la clé quand rien n’a été mesuré (wire byte-identique)', async () => {
    const add = buildAddMock()
    const channelPerformance = { forWorkspace: jest.fn().mockResolvedValue([]) }
    const service = await buildServiceForMarket(add, { market: null, channelPerformance })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData).not.toHaveProperty('channelPerformance')
  })

  it('dégrade sans mesure (jamais un échec d’analyse) quand la lecture échoue', async () => {
    const add = buildAddMock()
    const channelPerformance = { forWorkspace: jest.fn().mockRejectedValue(new Error('db down')) }
    const service = await buildServiceForMarket(add, { market: null, channelPerformance })

    const res = await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    const [, jobData] = add.mock.calls[0]!
    expect(jobData).not.toHaveProperty('channelPerformance')
  })
})

describe('AnalysisService — un dossier livré = un débit (reprise)', () => {
  /** Un compte en échec/annulé qu'on reprend. `outstanding` dit si le run est
   *  encore payé (crédit jamais rendu) ou s'il a été remboursé. */
  async function buildResumeService(
    outstanding: boolean,
    slot: SlotResult = { ok: true, used: 2, limit: 10 },
    add: jest.Mock = jest.fn().mockResolvedValue({ id: 'analysis-u-1-sncf' }),
  ) {
    const credits = creditsProvider(slot, outstanding)
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(undefined), add } },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(
              success({
                id: 'a-1',
                user_id: 'u-1',
                company_name: 'SNCF',
                status: 'error',
                user_context: null,
              } as unknown as AccountEntity),
            ),
            markAnalyzing: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ContactsService, useValue: { findByAccount: jest.fn() } },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        credits,
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    return { service: moduleRef.get(AnalysisService), credits: credits.useValue, add }
  }

  it('reprendre un run ENCORE PAYÉ est gratuit — c’est le cas d’une panne', async () => {
    const { service, credits, add } = await buildResumeService(true)

    const res = await service.resume('a-1', 'u-1')

    expect(isSuccess(res)).toBe(true)
    expect(credits.consumeAnalysisSlot).not.toHaveBeenCalled()
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('reprendre un run dont le crédit a été RENDU le redébite — sinon le dossier serait gratuit', async () => {
    const { service, credits, add } = await buildResumeService(false)

    const res = await service.resume('a-1', 'u-1')

    expect(isSuccess(res)).toBe(true)
    expect(credits.consumeAnalysisSlot).toHaveBeenCalledWith('u-1', {
      reason: 'reprise: SNCF',
      accountId: 'a-1',
    })
    expect(add).toHaveBeenCalledTimes(1)
  })

  // #4119 — la reprise redébitée porte `slotConsumed` : sans lui, un échec TERMINAL du run repris ne
  // rendait jamais le crédit (le worker ne rembourse que ce qu'il sait avoir été pris au lancement).
  it('#4119 — une reprise REDÉBITÉE marque le job `slotConsumed` : un échec terminal rendra le crédit', async () => {
    const { service, add } = await buildResumeService(false)
    await service.resume('a-1', 'u-1')
    expect(add.mock.calls[0]![1]).toMatchObject({ slotConsumed: true })
  })

  it('#4119 — une reprise GRATUITE (run encore payé) ne porte PAS `slotConsumed` : pas de remboursement sans débit propre', async () => {
    const { service, add } = await buildResumeService(true)
    await service.resume('a-1', 'u-1')
    expect(add.mock.calls[0]![1]).not.toHaveProperty('slotConsumed')
  })

  it('#4119 — reprise redébitée dont l’enfilage lève : le crédit est rendu UNE fois, et l’erreur remonte', async () => {
    const add = jest.fn().mockRejectedValue(new Error('redis down'))
    const { service, credits } = await buildResumeService(false, undefined, add)

    await expect(service.resume('a-1', 'u-1')).rejects.toThrow('redis down')

    expect(credits.refundAnalysisSlot).toHaveBeenCalledTimes(1)
    expect(credits.refundAnalysisSlot).toHaveBeenCalledWith('u-1', expect.objectContaining({ accountId: 'a-1' }))
  })

  it('#4119 — reprise GRATUITE dont l’enfilage lève : rien n’a été débité, rien n’est rendu', async () => {
    const add = jest.fn().mockRejectedValue(new Error('redis down'))
    const { service, credits } = await buildResumeService(true, undefined, add)

    await expect(service.resume('a-1', 'u-1')).rejects.toThrow('redis down')

    expect(credits.refundAnalysisSlot).not.toHaveBeenCalled()
  })

  it('et si le quota est atteint, la reprise est refusée AVANT d’enfiler quoi que ce soit', async () => {
    const { service, add } = await buildResumeService(false, { ok: false, used: 10, limit: 10 })

    const res = await service.resume('a-1', 'u-1')

    expect(isFailure(res)).toBe(true)
    if (isFailure(res)) expect(res.problem.code).toBe('quota_exceeded')
    expect(add).not.toHaveBeenCalled()
  })
})

describe('AnalysisService — market → country propagation', () => {
  const frResolution = {
    market: 'FR',
    countryCode: 'FR',
    defaultLocale: 'fr',
    legalBasis: 'RGPD',
    activeCountryPack: false,
  }
  const chResolution = {
    market: 'CH',
    countryCode: 'CH',
    defaultLocale: 'de',
    legalBasis: 'adéquation',
    activeCountryPack: true,
  }

  it('passes country to the job for a non-FR market, resolved from the run workspace', async () => {
    const add = buildAddMock()
    const market: MarketMock = { resolveForWorkspace: jest.fn().mockResolvedValue(chResolution) }
    const service = await buildServiceForMarket(add, { market, workspaceId: 'ws-ch' })

    await service.start({ company_name: 'Nestlé' }, 'user-1')

    expect(market.resolveForWorkspace).toHaveBeenCalledWith('ws-ch')
    expect(add).toHaveBeenCalledWith('analyze', expect.objectContaining({ country: 'CH' }), expect.anything())
  })

  it('omits country for the FR default so the French wire is unchanged', async () => {
    const add = buildAddMock()
    const market: MarketMock = { resolveForWorkspace: jest.fn().mockResolvedValue(frResolution) }
    const service = await buildServiceForMarket(add, { market })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.country).toBeUndefined()
  })

  it('leaves the FR path untouched when no market resolver is wired (unit / legacy)', async () => {
    const add = buildAddMock()
    const service = await buildServiceForMarket(add, { market: null })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.country).toBeUndefined()
  })

  it('degrades to the FR path (no country) when market resolution throws', async () => {
    const add = buildAddMock()
    const market: MarketMock = { resolveForWorkspace: jest.fn().mockRejectedValue(new Error('db down')) }
    const service = await buildServiceForMarket(add, { market })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.country).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */
/*  Relance après échec — réutilisation du compte errored              */
/*  (bug prod « 7× Decathlon » : chaque retry post-échec empilait      */
/*  une nouvelle ligne accounts)                                        */
/* ------------------------------------------------------------------ */

describe('AnalysisService — réutilisation du compte errored à la relance', () => {
  /** Builder local qui EXPOSE le mock AccountsService pour vérifier le chemin
   *  réutilisation vs création (le buildService partagé ne rend que le service). */
  async function buildReuseHarness(opts: {
    reusable?: AccountEntity | null
    /** #4603 — le compte de la même société, quel que soit son statut (`findSameCompanyAccount`). */
    sameCompany?: AccountEntity | null
    /** Dossier `completed` renvoyé par le result cache — pour tester le cache-hit
     *  (« ouvrir ») ET la relance en place (« relancer »). Défaut null. */
    completed?: AccountEntity | null
    runs?: RunsMock
    slot?: SlotResult
  }): Promise<{
    service: AnalysisService
    accountsService: {
      create: jest.Mock
      findReusableFailedByUserAndCompany: jest.Mock
      findSameCompanyAccount: jest.Mock
      reuseForRelaunch: jest.Mock
    }
    add: QueueMock['add']
    runs: RunsMock
    /** Le service de crédits du harnais — pour prouver qu'un refus NE DÉBITE PAS. */
    credits: { consumeAnalysisSlot: jest.Mock }
  }> {
    const add = buildAddMock()
    const runs = opts.runs ?? runsServiceMock()
    const creditsProviderInstance = creditsProvider(opts.slot)
    const accountsService = {
      create: jest.fn().mockResolvedValue(success({ id: 'acc-created', status: 'analyzing' } as AccountEntity)),
      findOne: jest.fn(),
      findAnalyzingByUserAndCompany: jest.fn().mockResolvedValue(null),
      findCompletedByUserAndCompany: jest.fn().mockResolvedValue(opts.completed ?? null),
      findReusableFailedByUserAndCompany: jest.fn().mockResolvedValue(opts.reusable ?? null),
      findSameCompanyAccount: jest.fn().mockResolvedValue(opts.sameCompany ?? null),
      reuseForRelaunch: jest.fn().mockResolvedValue(undefined),
      markErrored: jest.fn().mockResolvedValue(undefined),
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { add, getJob: jest.fn().mockResolvedValue(undefined) } },
        { provide: AccountsService, useValue: accountsService },
        { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProviderInstance,
        { provide: AnalysisRunsService, useValue: runs },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    return {
      service: moduleRef.get(AnalysisService),
      accountsService,
      add,
      runs,
      credits: creditsProviderInstance.useValue as { consumeAnalysisSlot: jest.Mock },
    }
  }

  const erroredAccount = {
    id: 'acc-errored',
    status: 'error',
    company_name: 'Decathlon',
    workspace_id: 'ws-1',
    user_id: 'user-1',
  } as AccountEntity

  it('réutilise le compte errored : même accountId, statut repassé à analyzing, aucune nouvelle ligne', async () => {
    const { service, accountsService, add } = await buildReuseHarness({ reusable: erroredAccount })

    const res = await service.start({ company_name: 'Decathlon' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.accountId).toBe('acc-errored')
    // La ligne existante est recyclée — PAS de nouveau row accounts.
    expect(accountsService.create).not.toHaveBeenCalled()
    expect(accountsService.reuseForRelaunch).toHaveBeenCalledWith('acc-errored', 'user-1', {
      userContext: null,
      siren: undefined,
    })
    // Le run repart normalement sur le MÊME compte.
    expect(add).toHaveBeenCalledWith(
      'analyze',
      expect.objectContaining({ accountId: 'acc-errored', companyName: 'Decathlon' }),
      expect.anything(),
    )
  })

  it("appende un nouveau AnalysisRun sur le MÊME accountId (historique append-only, P0 Théo) — 2 entrées après l'échec + la relance", async () => {
    const runs = runsServiceMock()
    // Simule l'historique : le run échoué a déjà sa ligne, la relance en APPEND une 2e.
    const { service } = await buildReuseHarness({ reusable: erroredAccount, runs })

    await service.start({ company_name: 'Decathlon' }, 'user-1')

    expect(runs.recordStart).toHaveBeenCalledTimes(1)
    expect(runs.recordStart).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-errored', userId: 'user-1', workspaceId: 'ws-1' }),
    )
  })

  it('cherche le compte réutilisable STRICTEMENT pour le user appelant (pas de reuse cross-user/workspace)', async () => {
    const { service, accountsService } = await buildReuseHarness({ reusable: null })

    await service.start({ company_name: 'Decathlon' }, 'user-caller')

    // Le scope user est passé au repo (qui filtre `account.user_id = :userId`) —
    // le compte errored d'un AUTRE user/workspace n'est jamais candidat.
    expect(accountsService.findReusableFailedByUserAndCompany).toHaveBeenCalledWith('user-caller', 'Decathlon', {
      siren: undefined,
    })
  })

  it('transmet le SIREN du scope lock à la recherche ET à la mise à jour du compte réutilisé', async () => {
    const { service, accountsService } = await buildReuseHarness({ reusable: erroredAccount })

    await service.start({ company_name: 'Decathlon', siren: '306138900' }, 'user-1')

    expect(accountsService.findReusableFailedByUserAndCompany).toHaveBeenCalledWith('user-1', 'Decathlon', {
      siren: '306138900',
    })
    expect(accountsService.reuseForRelaunch).toHaveBeenCalledWith('acc-errored', 'user-1', {
      userContext: null,
      siren: '306138900',
    })
  })

  it('met à jour le user_context du compte réutilisé avec celui de la relance (forme persistée)', async () => {
    const { service, accountsService } = await buildReuseHarness({ reusable: erroredAccount })

    await service.start(
      { company_name: 'Decathlon', user_context: { preset: 'free', notes: 'cible la DSI' } },
      'user-1',
    )

    // Même forme persistée que `create()` : le contexte structuré est replié en
    // texte lisible (renderAnalysisContext) avant d'être écrit sur la ligne.
    expect(accountsService.reuseForRelaunch).toHaveBeenCalledWith(
      'acc-errored',
      'user-1',
      expect.objectContaining({ userContext: 'cible la DSI' }),
    )
  })

  it('#4603 — analyser une société DÉJÀ venue du CRM reprend sa fiche (statut quelconque) : un seul compte, pas deux', async () => {
    const crmAccount = {
      id: 'acc-crm',
      status: 'imported',
      company_name: 'VEEPEE SAS',
      siren: null,
      workspace_id: 'ws-1',
      user_id: 'user-1',
    } as AccountEntity
    const { service, accountsService, add } = await buildReuseHarness({ reusable: null, sameCompany: crmAccount })

    const res = await service.start({ company_name: 'Veepee', siren: '440297785' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.accountId).toBe('acc-crm')
    expect(accountsService.findSameCompanyAccount).toHaveBeenCalledWith('user-1', 'Veepee', { siren: '440297785' })
    expect(accountsService.create).not.toHaveBeenCalled()
    // Le run s'appende sur la fiche du CRM, comme une relance ; le SIREN se POSE (jamais ne remplace, GA-96).
    expect(accountsService.reuseForRelaunch).toHaveBeenCalledWith('acc-crm', 'user-1', {
      userContext: null,
      siren: '440297785',
    })
    expect(add).toHaveBeenCalledWith('analyze', expect.objectContaining({ accountId: 'acc-crm' }), expect.anything())
  })

  it("crée un compte normalement quand aucun compte errored n'existe (chemin frais inchangé)", async () => {
    const { service, accountsService, add } = await buildReuseHarness({ reusable: null })

    const res = await service.start({ company_name: 'Decathlon' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.accountId).toBe('acc-created')
    expect(accountsService.create).toHaveBeenCalledTimes(1)
    expect(accountsService.reuseForRelaunch).not.toHaveBeenCalled()
    expect(add).toHaveBeenCalledTimes(1)
  })

  // #3914 — le pont manquant entre Découvrir et l'analyse : la raison calculée
  // qui a fait remonter le compte voyage jusqu'à la ligne `accounts`, pour que
  // l'écran puisse la citer si l'analyse conclut différemment plus tard.
  it('#3914 — une analyse ouverte depuis Découvrir persiste origin + la raison calculée', async () => {
    const { service, accountsService } = await buildReuseHarness({ reusable: null })

    await service.start(
      { company_name: 'Decathlon', suggestion_id: 'discover:306138900', suggestion_reason: '5 postes data ouverts' },
      'user-1',
    )

    expect(accountsService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ origin: 'discover', discover_origin_reason: '5 postes data ouverts' }),
    )
  })

  it('#3914 — une analyse tapée à la main ne persiste aucune raison Découvrir, même si le champ traîne', async () => {
    const { service, accountsService } = await buildReuseHarness({ reusable: null })

    await service.start({ company_name: 'Decathlon' }, 'user-1')

    const call = accountsService.create.mock.calls[0]?.[1]
    expect(call).toMatchObject({ origin: 'search' })
    expect(call).not.toHaveProperty('discover_origin_reason')
  })

  // #3819 (lot RBB, décision Louis 11/10) — les CRITÈRES de Découvrir suivent le
  // compte : persistés à la création, puis transmis au cadrage du run.
  it('#3819 — une analyse ouverte depuis Découvrir persiste les critères posés', async () => {
    const { service, accountsService } = await buildReuseHarness({ reusable: null })

    await service.start(
      {
        company_name: 'Decathlon',
        suggestion_id: 'discover:306138900',
        suggestion_reason: '5 postes data ouverts',
        suggestion_criteria: { zone: 'Lille', signals: ['hiring'] },
      },
      'user-1',
    )

    expect(accountsService.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ discover_origin_criteria: { zone: 'Lille', signals: ['hiring'] } }),
    )
  })

  it('#3819 — le run REÇOIT la raison et les critères de Découvrir, comme hypothèses du vendeur', async () => {
    const { service, add } = await buildReuseHarness({ reusable: null })

    await service.start(
      {
        company_name: 'Decathlon',
        suggestion_id: 'discover:306138900',
        suggestion_reason: '5 postes data ouverts',
        suggestion_criteria: { zone: 'Lille', signals: ['hiring'] },
      },
      'user-1',
    )

    const payload = add.mock.calls[0]?.[1] as { sellerHypotheses?: Record<string, unknown> }
    expect(payload.sellerHypotheses).toMatchObject({
      discover_origin_reason: '5 postes data ouverts',
      discover_origin_criteria: ['zone : Lille', 'signal : recrutement'],
    })
  })

  it('#3819 — une relance d’un compte venu de Découvrir retransmet ce qui a été persisté', async () => {
    const { service, add } = await buildReuseHarness({
      reusable: {
        ...erroredAccount,
        origin: 'discover',
        discover_origin_reason: 'Appel d’offres publié',
        discover_origin_criteria: { sectors: ['insurance'] },
      } as AccountEntity,
    })

    await service.start({ company_name: 'Decathlon' }, 'user-1')

    const payload = add.mock.calls[0]?.[1] as { sellerHypotheses?: Record<string, unknown> }
    expect(payload.sellerHypotheses).toMatchObject({
      discover_origin_reason: 'Appel d’offres publié',
      discover_origin_criteria: ['secteur : Assurance & mutuelles'],
    })
  })

  it('#3819 — une analyse tapée à la main ne transmet ni ne persiste aucun critère Découvrir', async () => {
    const { service, accountsService, add } = await buildReuseHarness({ reusable: null })

    await service.start({ company_name: 'Decathlon', suggestion_criteria: { zone: 'Lille' } }, 'user-1')

    expect(accountsService.create.mock.calls[0]?.[1]).not.toHaveProperty('discover_origin_criteria')
    const payload = add.mock.calls[0]?.[1] as { sellerHypotheses?: unknown }
    expect(payload.sellerHypotheses).toBeUndefined()
  })

  // #4642 — le CONTEXTE d'une conversation avec Laura (compétences, offres, talent) voyage avec le lot : il
  // cadre le run et se persiste pour que le dossier dise sur quoi il a été cadré. Il PRIORISE, jamais ne restreint.
  const lauraFraming = {
    framed_by: 'laura' as const,
    talent_id: '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
    skills: ['Java', 'Kafka'],
    offers: [{ title: 'Dev Java Kafka', date: '2026-10-20' }],
    zone: 'Rhône',
  }

  it('#4642 — une analyse lancée depuis la carte « placer un talent » persiste le cadrage, sans changer l’origine', async () => {
    const { service, accountsService } = await buildReuseHarness({ reusable: null })

    await service.start(
      { company_name: 'JEMS', suggestion_id: 'laura:JEMS', suggestion_criteria: lauraFraming },
      'user-1',
    )

    const call = accountsService.create.mock.calls[0]?.[1]
    expect(call).toMatchObject({ origin: 'search', discover_origin_criteria: lauraFraming })
    expect(call).not.toHaveProperty('discover_origin_reason')
  })

  it('#4642 — le run REÇOIT la demande : en tête, nommée, avec ses offres — et dit que rien n’est écarté', async () => {
    const { service, add } = await buildReuseHarness({ reusable: null })

    await service.start(
      { company_name: 'JEMS', suggestion_id: 'laura:JEMS', suggestion_criteria: lauraFraming },
      'user-1',
    )

    const payload = add.mock.calls[0]?.[1] as { sellerHypotheses?: { discover_origin_criteria?: string[] } }
    const lines = payload.sellerHypotheses?.discover_origin_criteria ?? []
    expect(lines[0]).toContain('conversation avec Laura')
    expect(lines).toContain('compétence : Java, Kafka')
    expect(lines).toContain('offres relevées par la recherche : Dev Java Kafka (2026-10-20)')
  })

  it('#4642 — le cadrage ne devient JAMAIS un périmètre : la zone en libellé ne pose aucun géo-périmètre', async () => {
    const { service, accountsService } = await buildReuseHarness({ reusable: null })

    await service.start(
      { company_name: 'JEMS', suggestion_id: 'laura:JEMS', suggestion_criteria: lauraFraming },
      'user-1',
    )

    expect(accountsService.create).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(accountsService.create.mock.calls[0]?.[1])).not.toContain('geo_perimeter')
  })

  it('#4642 — une relance d’un compte existant remplace un ancien cadrage Laura, pas les critères de Découvrir', async () => {
    const reusedFramed = await buildReuseHarness({
      reusable: {
        ...erroredAccount,
        discover_origin_criteria: { framed_by: 'laura', skills: ['Cobol'] },
      } as AccountEntity,
    })
    await reusedFramed.service.start(
      { company_name: 'Decathlon', suggestion_id: 'laura:Decathlon', suggestion_criteria: lauraFraming },
      'user-1',
    )
    expect(reusedFramed.accountsService.reuseForRelaunch).toHaveBeenCalledWith(
      'acc-errored',
      'user-1',
      expect.objectContaining({ discoverOriginCriteria: lauraFraming }),
    )

    const reusedDiscover = await buildReuseHarness({
      reusable: {
        ...erroredAccount,
        origin: 'discover',
        discover_origin_criteria: { sectors: ['insurance'] },
      } as AccountEntity,
    })
    await reusedDiscover.service.start(
      { company_name: 'Decathlon', suggestion_id: 'laura:Decathlon', suggestion_criteria: lauraFraming },
      'user-1',
    )
    expect(reusedDiscover.accountsService.reuseForRelaunch.mock.calls[0]?.[2]).not.toHaveProperty(
      'discoverOriginCriteria',
    )
  })

  it('#4642 — dit NON : une analyse hors conversation, ou une carte Laura sans cadrage, est inchangée', async () => {
    const manual = await buildReuseHarness({ reusable: null })
    await manual.service.start({ company_name: 'JEMS' }, 'user-1')
    expect(manual.accountsService.create.mock.calls[0]?.[1]).not.toHaveProperty('discover_origin_criteria')
    expect((manual.add.mock.calls[0]?.[1] as { sellerHypotheses?: unknown }).sellerHypotheses).toBeUndefined()

    // La carte « recherche de comptes » (#4432.3) ne porte que la zone : ni persistée ni transmise comme avant.
    const zoneOnly = await buildReuseHarness({ reusable: null })
    await zoneOnly.service.start(
      { company_name: 'SAFRAN', suggestion_id: 'laura:SAFRAN', suggestion_criteria: { zone: 'Occitanie' } },
      'user-1',
    )
    expect(zoneOnly.accountsService.create.mock.calls[0]?.[1]).not.toHaveProperty('discover_origin_criteria')
    expect((zoneOnly.add.mock.calls[0]?.[1] as { sellerHypotheses?: unknown }).sellerHypotheses).toBeUndefined()
  })

  it('la relance réutilisée consomme un slot du quota (nouveau run = nouveau crédit, remboursé par le worker si échec)', async () => {
    const { service } = await buildReuseHarness({
      reusable: erroredAccount,
      slot: { ok: false, used: 3, limit: 3 },
    })

    const res = await service.start({ company_name: 'Decathlon' }, 'user-1')

    // Quota atteint → la relance est bloquée AVANT de toucher au compte.
    expect(isFailure(res)).toBe(true)
    if (isFailure(res)) expect(res.problem.code).toBe('quota_exceeded')
  })

  it('la mémoire feedback (#506) continue de fonctionner : le compte réutilisé garde company_name/workspace pour la jointure', async () => {
    const add = buildAddMock()
    const directives = '- [signal] « rachat » signalé FAUX (2026-07-10)'
    const directivesFor = jest.fn().mockResolvedValue(directives)
    const accountsService = {
      create: jest.fn(),
      findAnalyzingByUserAndCompany: jest.fn().mockResolvedValue(null),
      findCompletedByUserAndCompany: jest.fn().mockResolvedValue(null),
      findReusableFailedByUserAndCompany: jest.fn().mockResolvedValue(erroredAccount),
      reuseForRelaunch: jest.fn().mockResolvedValue(undefined),
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { add, getJob: jest.fn().mockResolvedValue(undefined) } },
        { provide: AccountsService, useValue: accountsService },
        { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: AccountFeedbackService, useValue: { directivesFor } },
      ],
    }).compile()
    const service = moduleRef.get(AnalysisService)

    await service.start({ company_name: 'Decathlon' }, 'user-1')

    // La résolution mémoire reçoit l'identité du compte RÉUTILISÉ (id + workspace
    // + company_name) — la jointure LOWER(company_name) du service feedback tient.
    expect(directivesFor).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-errored', workspaceId: 'ws-1', companyName: 'Decathlon' }),
    )
    const [, jobData] = add.mock.calls[0]!
    expect(jobData.accountFeedback).toBe(directives)
  })

  /* ---------------------------------------------------------------- */
  /*  Relance EN PLACE d'un dossier `completed` (« ouvrir » vs         */
  /*  « relancer ») — compte canonique unique, jamais de 2ᵉ ligne     */
  /* ---------------------------------------------------------------- */

  const completedAccount = {
    id: 'acc-done',
    status: 'completed',
    company_name: 'SNCF',
    workspace_id: 'ws-1',
    user_id: 'user-1',
  } as AccountEntity

  it('(c) relance explicite d’un dossier completed : ré-exécution EN PLACE (même accountId), +1 run, aucune nouvelle ligne', async () => {
    const runs = runsServiceMock()
    const { service, accountsService, add } = await buildReuseHarness({ completed: completedAccount, runs })

    const res = await service.start({ company_name: 'SNCF', relaunch: true }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.accountId).toBe('acc-done')
    // Le dossier completed est RECYCLÉ en place — jamais une 2ᵉ ligne.
    expect(accountsService.create).not.toHaveBeenCalled()
    expect(accountsService.reuseForRelaunch).toHaveBeenCalledWith('acc-done', 'user-1', {
      userContext: null,
      siren: undefined,
    })
    // Nouveau AnalysisRun appendé sur le MÊME compte (historique +1).
    expect(runs.recordStart).toHaveBeenCalledTimes(1)
    expect(runs.recordStart).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-done' }))
    // Le pipeline repart réellement sur ce compte.
    expect(add).toHaveBeenCalledWith('analyze', expect.objectContaining({ accountId: 'acc-done' }), expect.anything())
  })

  /**
   * GA-96 — « un dossier qui connaît son SIREN se rafraîchit sur ce SIREN,
   * jamais sur son nom ».
   *
   * Le défaut mesuré en production le 30/08/2026 : « Actualiser l'analyse »
   * renvoie sur `/search?accountId=…&company=ROCHE`, et le lancement repart
   * avec `siren: undefined` — donc une résolution PAR NOM. Le registre a rendu
   * ROCHE BOBOIS (`493229280`) au lieu du laboratoire (`552012031`), et le
   * dossier a changé d'entreprise.
   *
   * Le nom sert à trouver une société qu'on n'a pas encore. Dès qu'on relance
   * un dossier, l'identité est DÉJÀ acquise : c'est elle qui doit ancrer le run,
   * et le client n'a pas à la renvoyer pour qu'elle soit respectée — ce chemin
   * est aussi celui du MCP et de l'opérateur.
   */
  it('(GA-96) une relance HÉRITE du SIREN du dossier — le run n’est jamais ré-ancré sur le seul nom', async () => {
    const roche = {
      ...completedAccount,
      id: 'acc-roche',
      company_name: 'ROCHE',
      siren: '552012031', // le laboratoire pharmaceutique
    } as AccountEntity
    const runs = runsServiceMock()
    const { service, accountsService, add } = await buildReuseHarness({ completed: roche, runs })

    // Exactement ce que le bouton envoie aujourd'hui : un nom, aucune identité.
    await service.start({ company_name: 'ROCHE', relaunch: true }, 'user-1')

    // Le run part ANCRÉ sur l'identité du dossier, pas sur son nom.
    const [, jobData] = add.mock.calls[0]!
    expect(jobData.siren).toBe('552012031')
    // …et les deux écritures qui accompagnent le lancement portent la même.
    expect(accountsService.reuseForRelaunch).toHaveBeenCalledWith('acc-roche', 'user-1', {
      userContext: null,
      siren: '552012031',
    })
    expect(runs.recordStart).toHaveBeenCalledWith(expect.objectContaining({ siren: '552012031' }))
  })

  it('(GA-96) REFUSE une relance qui demande une AUTRE identité — et ne débite rien', async () => {
    // Relancer et ré-identifier sont deux gestes différents. « Actualiser »
    // promet de relancer « sur ce dossier » : un lancement qui demande à la fois
    // de rafraîchir CE dossier et de l'ancrer sur une autre société se
    // contredit. On refuse, on le dit, et — c'est la moitié qui compte — on
    // refuse AVANT le débit : un refus qui coûte un crédit est une punition.
    const roche = { ...completedAccount, id: 'acc-roche', company_name: 'ROCHE', siren: '552012031' } as AccountEntity
    const { service, accountsService, add, credits } = await buildReuseHarness({ completed: roche })

    const res = await service.start({ company_name: 'ROCHE', relaunch: true, siren: '493229280' }, 'user-1')

    expect(isFailure(res)).toBe(true)
    if (isFailure(res)) {
      expect(res.problem.code).toBe('identity_mismatch')
      // Le refus NOMME les deux sociétés — sans elles, l'utilisateur ne peut pas
      // décider de la suite.
      expect(res.problem.message).toContain('552012031')
      expect(res.problem.message).toContain('493229280')
    }
    // Rien n'a été touché, rien n'a été débité.
    expect(add).not.toHaveBeenCalled()
    expect(accountsService.reuseForRelaunch).not.toHaveBeenCalled()
    expect(credits.consumeAnalysisSlot).not.toHaveBeenCalled()
  })

  it('(GA-96) laisse passer une relance qui REDIT la même identité (mise en forme comprise)', async () => {
    // Le SIREN voyage tantôt compact, tantôt espacé. Un refus qui se
    // déclencherait sur la mise en forme bloquerait un dossier sain.
    const roche = { ...completedAccount, id: 'acc-roche', company_name: 'ROCHE', siren: '552 012 031' } as AccountEntity
    const { service, add } = await buildReuseHarness({ completed: roche })

    const res = await service.start({ company_name: 'ROCHE', relaunch: true, siren: '552012031' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('sans relaunch : cache-hit rapide (« ouvrir »), aucun re-run, aucun crédit, aucun run appendé', async () => {
    const runs = runsServiceMock()
    const { service, accountsService, add } = await buildReuseHarness({ completed: completedAccount, runs })

    const res = await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.accountId).toBe('acc-done')
    expect(accountsService.reuseForRelaunch).not.toHaveBeenCalled()
    expect(accountsService.create).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    expect(runs.recordStart).not.toHaveBeenCalled()
  })

  it('la relance en place consomme un slot (nouveau run = nouveau crédit) — bloquée si quota atteint, sans toucher au dossier', async () => {
    const { service, accountsService } = await buildReuseHarness({
      completed: completedAccount,
      slot: { ok: false, used: 3, limit: 3 },
    })

    const res = await service.start({ company_name: 'SNCF', relaunch: true }, 'user-1')

    expect(isFailure(res)).toBe(true)
    if (isFailure(res)) expect(res.problem.code).toBe('quota_exceeded')
    expect(accountsService.reuseForRelaunch).not.toHaveBeenCalled()
    expect(accountsService.create).not.toHaveBeenCalled()
  })

  /* ---------------------------------------------------------------- */
  /*  Garantie dure : aucun chemin ne crée un doublon (test (f))       */
  /* ---------------------------------------------------------------- */

  it('(f) create() n’est JAMAIS appelé quand un compte existe déjà (errored / completed-relance / completed-cache)', async () => {
    const errored = {
      id: 'acc-err',
      status: 'error',
      company_name: 'Decathlon',
      workspace_id: 'ws-1',
      user_id: 'user-1',
    } as AccountEntity
    const completed = { ...completedAccount, company_name: 'Decathlon' } as AccountEntity

    // 1) re-recherche d'une coquille errored → réutilisée, pas de create()
    const h1 = await buildReuseHarness({ reusable: errored })
    await h1.service.start({ company_name: 'Decathlon' }, 'user-1')
    expect(h1.accountsService.create).not.toHaveBeenCalled()

    // 2) relance explicite d'un dossier completed → recyclé, pas de create()
    const h2 = await buildReuseHarness({ completed })
    await h2.service.start({ company_name: 'Decathlon', relaunch: true }, 'user-1')
    expect(h2.accountsService.create).not.toHaveBeenCalled()

    // 3) simple ré-ouverture d'un dossier completed (cache) → pas de create()
    const h3 = await buildReuseHarness({ completed })
    await h3.service.start({ company_name: 'Decathlon' }, 'user-1')
    expect(h3.accountsService.create).not.toHaveBeenCalled()
  })

  it('crée UNE ligne — et une seule — pour une entreprise réellement nouvelle (aucun compte existant)', async () => {
    const { service, accountsService, add } = await buildReuseHarness({})

    const res = await service.start({ company_name: 'Entreprise Inédite' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    expect(accountsService.create).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(1)
  })
})

describe('AnalysisService — mémoire de corrections (feedback loop A2)', () => {
  it('injecte les directives de correction dans le payload du run quand il y a du feedback', async () => {
    const add = buildAddMock()
    const directives = "- [play] « Play cyber » jugé INUTILE / hors sujet par l'utilisateur (2026-07-10)"
    const service = await buildService({ add, getJob: buildGetJobMock() }, { feedbackDirectives: directives })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.accountFeedback).toBe(directives)
  })

  it("omet le bloc quand le compte n'a aucun feedback (payload inchangé)", async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { feedbackDirectives: '' })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.accountFeedback).toBeUndefined()
  })

  it("omet le bloc quand le service mémoire n'est pas branché (unit / legacy)", async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.accountFeedback).toBeUndefined()
  })
})

// #3753.3 — le ciblage de l'ESN (tier, raison, problématiques, projets IT) entre dans la
// phase 1 de l'analyse du compte, comme hypothèses du vendeur — jamais comme faits collectés.
describe('AnalysisService — hypothèses du vendeur (#3753.3)', () => {
  const targeting: SellerHypothesesForRun = {
    tier_label: 'A',
    selection_reason: 'Plan de transformation SI',
    addressable_issues: 'Dette applicative',
    upcoming_it_projects: 'Migration ERP',
  }

  it('embarque le ciblage de l’ESN dans le job : la phase 1 le recevra', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { sellerHypotheses: targeting })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.sellerHypotheses).toEqual(targeting)
  })

  it('compte hors liste cible : aucune clé, payload du run inchangé', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { sellerHypotheses: null })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect('sellerHypotheses' in jobData).toBe(false)
  })

  it('lecteur non branché : aucune clé (chemin historique)', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect('sellerHypotheses' in jobData).toBe(false)
  })
})

describe('AnalysisService — couche zéro CRM (annexe méthodo p8)', () => {
  const history = 'CRM HubSpot consulté pour « SNCF » :\n- 3 contact(s) déjà dans votre CRM chez ce groupe'

  it("embarque l'historique CRM dans le run — le plan saura que le compte n'est pas froid", async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { crmHistory: history })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.crmPresence).toBe(history)
  })

  it('CRM branché mais aucun match : rien n’est envoyé (« consulté, rien trouvé » ≠ historique)', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { crmConnected: true })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.crmPresence).toBeUndefined()
  })

  it('sans CRM branché du tout, le payload du run est inchangé (feature additive)', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.crmPresence).toBeUndefined()
  })
})

/**
 * #1631.3/.4, #1606.2 (lot 14) — l'axe CHEMIN : le lot 13 a livré le CALCUL
 * (`_path_axis` côté IA) mais AUCUN appelant ne lui transmettait le compte de
 * parcours — l'axe restait non mesuré en production. `start()` est le point
 * d'entrée du chemin PRINCIPAL (première analyse d'un compte).
 */
describe('AnalysisService — axe CHEMIN de l’adressabilité (lot 14)', () => {
  it('transmet le compte de parcours et l’ESN dominante quand `MarketMemoryService` les résout', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { marketPathAxis: { paths: 9, topEsn: 'ALTEN' } },
    )

    await service.start({ company_name: 'BNP Paribas' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.marketPathsObserved).toBe(9)
    expect(jobData.marketTopEsn).toBe('ALTEN')
  })

  it('transmet le compte de parcours SANS ESN nommée — l’axe reste vrai en désignant des partenaires génériques', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { marketPathAxis: { paths: 4, topEsn: null } },
    )

    await service.start({ company_name: 'BNP Paribas' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.marketPathsObserved).toBe(4)
    expect(jobData.marketTopEsn).toBeUndefined()
  })

  it('sous le seuil transverse (`pathAxisFor` rend `null`) — clés omises, jamais un `0`', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { marketPathAxis: null })

    await service.start({ company_name: 'Société Inconnue' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.marketPathsObserved).toBeUndefined()
    expect(jobData.marketTopEsn).toBeUndefined()
  })

  it('sans `MarketMemoryService` branché du tout, le payload du run est inchangé (feature additive)', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.marketPathsObserved).toBeUndefined()
    expect(jobData.marketTopEsn).toBeUndefined()
  })
})

/**
 * #2298.4 (décision Louis 19/09/2026) — l'axe RELATION lit maintenant PLUSIEURS
 * sources (CRM déjà branché plus haut, missions, agenda, e-mails, correction
 * humaine). `start()` est le point d'entrée du chemin PRINCIPAL — même mirroir
 * que l'axe CHEMIN juste au-dessus.
 */
describe('AnalysisService — axe RELATION, plusieurs sources (#2298.4)', () => {
  it('transmet les missions signées et le dernier rendez-vous quand `RelationAxisReaderService` les résout', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { relationSignals: { missionsCount: 2, lastMeetingAt: '2026-06-01' } },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.relationMissionsCount).toBe(2)
    expect(jobData.relationLastMeetingAt).toBe('2026-06-01')
    expect(jobData.relationLastEmailAt).toBeUndefined()
  })

  it('transmet la correction humaine posée sur la relation du compte', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { relationHumanCorrection: 'ancien client' })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.relationHumanCorrection).toBe('ancien client')
  })

  it('#2273.9-.21 — transmet les partenaires déclarés en place, jamais une liste vide', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { relationSignals: { declaredPartners: ['Alten'] } },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.declaredPartners).toEqual(['Alten'])
  })

  it('#3278.1 — transmet « consultant présent / ancien » lu sur les missions, jamais sans mission', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { relationSignals: { consultantHistory: 'present' } },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.consultantHistory).toBe('present')
  })

  it('#3278.1 — transmet le signal d’achat DÉCLARÉ, jamais sans signal', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { relationSignals: { declaredSignalPresent: true } },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.declaredSignalPresent).toBe(true)
  })

  it('aucune source réelle (`RelationAxisReaderService` rend `{}`) : clés omises, jamais un `0`', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { relationSignals: {} })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.relationMissionsCount).toBeUndefined()
    expect(jobData.relationLastMeetingAt).toBeUndefined()
    expect(jobData.relationLastEmailAt).toBeUndefined()
  })

  it('sans `RelationAxisReaderService` branché du tout, le payload du run est inchangé (feature additive)', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.relationMissionsCount).toBeUndefined()
    expect(jobData.relationLastMeetingAt).toBeUndefined()
    expect(jobData.relationLastEmailAt).toBeUndefined()
    expect(jobData.relationHumanCorrection).toBeUndefined()
  })
})

describe('AnalysisService — workspace démo (demo mode C1)', () => {
  it('replays the seeded dossier instead of launching a real analysis', async () => {
    const add = buildAddMock()
    const runs = runsServiceMock()
    const seeded = { id: 'acc-demo-1', status: 'completed' } as AccountEntity
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { isDemoWorkspace: true, findCompletedByUserAndCompany: seeded, runs },
    )

    const res = await service.start({ company_name: 'Groupe Helios' }, 'demo-user')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.accountId).toBe('acc-demo-1')
    // NOTHING real happened: no queue job, no run history row.
    expect(add).not.toHaveBeenCalled()
    expect(runs.recordStart).not.toHaveBeenCalled()
  })

  it('falls back to an example dossier when the typed name matches nothing — never invents one', async () => {
    // Un prospect tape le nom d'une VRAIE entreprise. On lui montre un dossier
    // d'exemple (fictif, sous son propre nom), jamais un dossier fabriqué au nom
    // qu'il a tapé : ce serait des chiffres inventés sur une société réelle.
    const add = buildAddMock()
    const runs = runsServiceMock()
    const dossiers = [{ id: 'acc-demo-1' }, { id: 'acc-demo-2' }, { id: 'acc-demo-3' }] as AccountEntity[]
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { isDemoWorkspace: true, findCompletedByUserAndCompany: null, demoDossiers: dossiers, runs },
    )

    const res = await service.start({ company_name: 'Une Vraie Entreprise' }, 'demo-user')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) {
      expect(dossiers.map(d => d.id)).toContain(res.output.accountId)
      // `launched: false` = aucun run ne tourne ; la progression est jouée côté
      // client, et rien ne s'abonne à un flux d'événements qui n'existe pas.
      expect(res.output.launched).toBe(false)
      expect(res.output.reason).toBe('demo_replay')
    }
    // Toujours RIEN de réel : pas de job, pas d'historique de run, pas de crédit.
    expect(add).not.toHaveBeenCalled()
    expect(runs.recordStart).not.toHaveBeenCalled()
  })

  it('picks the SAME example dossier for the same input — a demo replays identically', async () => {
    const dossiers = [{ id: 'acc-demo-1' }, { id: 'acc-demo-2' }, { id: 'acc-demo-3' }] as AccountEntity[]
    const build = () =>
      buildService(
        { add: buildAddMock(), getJob: buildGetJobMock() },
        { isDemoWorkspace: true, findCompletedByUserAndCompany: null, demoDossiers: dossiers },
      )

    const first = await (await build()).start({ company_name: 'Société Générale' }, 'demo-user')
    const second = await (await build()).start({ company_name: 'société générale ' }, 'demo-user')

    expect(isSuccess(first) && isSuccess(second)).toBe(true)
    if (isSuccess(first) && isSuccess(second)) {
      expect(first.output.accountId).toBe(second.output.accountId)
    }
  })

  it('says so when the demo space holds no dossier at all, instead of a run that never comes', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      { isDemoWorkspace: true, findCompletedByUserAndCompany: null, demoDossiers: [] },
    )

    const res = await service.start({ company_name: 'Une Vraie Entreprise' }, 'demo-user')

    expect(isFailure(res)).toBe(true)
    if (isFailure(res)) {
      expect(res.problem.code).toBe('demo_workspace')
      expect(res.problem.message).toContain('démonstration')
    }
    expect(add).not.toHaveBeenCalled()
  })

  it('a NON-demo workspace launches normally (the guard is demo-only)', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { isDemoWorkspace: false })

    const res = await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(isSuccess(res)).toBe(true)
    expect(add).toHaveBeenCalledTimes(1)
  })
})

describe('AnalysisService — cancelByAdmin (operator stop)', () => {
  /** Build the service with only the deps cancelByAdmin touches: the analysis
   *  queue, a cross-tenant accounts mock, the shared cancellation service and
   *  the run history. The other required constructor deps are inert stubs. */
  function buildAdminHarness(account: Partial<AccountEntity> | null) {
    const removeJob = jest.fn().mockResolvedValue(undefined)
    const getJob = jest.fn().mockResolvedValue(account ? { remove: removeJob } : undefined)
    const analysisQueue = { getJob, add: jest.fn() }
    const findByIdUnscoped = jest.fn().mockResolvedValue(account ?? null)
    const markCancelled = jest.fn().mockResolvedValue(undefined)
    const markErrored = jest.fn().mockResolvedValue(undefined)
    const accountsService = { findByIdUnscoped, markCancelled, markErrored }
    const cancel = jest.fn().mockReturnValue(true)
    const cancellation = { cancel, register: jest.fn(), unregister: jest.fn() }
    const completeLatest = jest.fn().mockResolvedValue(undefined)
    const runs = { completeLatest, recordStart: jest.fn(), listForAccount: jest.fn() }
    const service = new AnalysisService(
      analysisQueue as never,
      accountsService as never,
      {} as never, // contactsService — unused here
      cancellation as never,
      {} as never, // esnProfile — unused here
      {} as never, // credits — unused here
      runs as never,
      {} as never, // persistence — unused here
    )
    return { service, getJob, removeJob, findByIdUnscoped, markCancelled, markErrored, cancel, completeLatest }
  }

  const ACME: Partial<AccountEntity> = {
    id: 'acc-1',
    user_id: 'owner-9',
    company_name: 'ACME',
    siren: '123456789',
  }

  it('reuses the shared cancellation path with a siren-scoped jobId and marks the run canceled', async () => {
    const h = buildAdminHarness(ACME)

    const res = await h.service.cancelByAdmin('acc-1')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output).toEqual({ accountId: 'acc-1', status: 'canceled', ownerUserId: 'owner-9' })
    // Same jobId `start()` would have enqueued (buildJobId includes the siren).
    expect(h.cancel).toHaveBeenCalledWith('analysis-owner-9-acme-siren-123456789', 'admin_stopped')
    expect(h.getJob).toHaveBeenCalledWith('analysis-owner-9-acme-siren-123456789')
    expect(h.removeJob).toHaveBeenCalledTimes(1)
    // markCancelled is called with the OWNER's userId (from the unscoped lookup).
    expect(h.markCancelled).toHaveBeenCalledWith('acc-1', 'owner-9')
    expect(h.completeLatest).toHaveBeenCalledWith('acc-1', { status: 'canceled' })
    expect(h.markErrored).not.toHaveBeenCalled()
  })

  it('force_error marks a zombie account errored (status → error) and closes the run', async () => {
    const h = buildAdminHarness(ACME)

    const res = await h.service.cancelByAdmin('acc-1', 'force_error', 'louis@bellum')

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.status).toBe('error')
    expect(h.cancel).toHaveBeenCalledWith('analysis-owner-9-acme-siren-123456789', 'admin_force_error')
    expect(h.markErrored).toHaveBeenCalledTimes(1)
    expect(h.markCancelled).not.toHaveBeenCalled()
    expect(h.completeLatest).toHaveBeenCalledWith('acc-1', { status: 'error' })
  })

  it('returns not_found when the account does not exist (no cancel attempted)', async () => {
    const h = buildAdminHarness(null)

    const res = await h.service.cancelByAdmin('missing')

    expect(isFailure(res)).toBe(true)
    if (isFailure(res)) expect(res.problem.code).toBe('not_found')
    expect(h.cancel).not.toHaveBeenCalled()
    expect(h.markCancelled).not.toHaveBeenCalled()
    expect(h.markErrored).not.toHaveBeenCalled()
  })
})

describe('AnalysisService — provenance du profil (recette finale §13/§53, P0-02)', () => {
  it('fige sur le run le mode, la raison et les deux versions du profil', async () => {
    // Le reproche du rapport : un dossier écrivait « profil ESN non précisé »
    // sans que rien ne permette de savoir quel profil avait été lu. Le run doit
    // désormais porter la réponse, avec sa raison.
    const runs = runsServiceMock()
    // Le défaut du double rend `null` : sans id de run, il n'y a rien à
    // annoter — et c'est le bon comportement, mais pas ce qu'on teste ici.
    runs.recordStart.mockResolvedValue('run-1')
    const service = await buildService({ add: buildAddMock(), getJob: buildGetJobMock() }, { runs })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(runs.recordProfileProvenance).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mode: 'generic', reason: 'no_profile', esnName: null }),
    )
  })

  it('un profil imposé par l’appelant s’explique comme tel, pas comme un oubli de l’utilisateur', async () => {
    const runs = runsServiceMock()
    runs.recordStart.mockResolvedValue('run-1')
    const service = await buildService({ add: buildAddMock(), getJob: buildGetJobMock() }, { runs })

    await service.start({ company_name: 'SNCF', profile_data: {} }, 'user-1')

    expect(runs.recordProfileProvenance).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mode: 'generic', reason: 'overridden' }),
    )
  })

  it('#2005.11 — fige sur le run les versions des TROIS couches du profil', async () => {
    const runs = runsServiceMock()
    runs.recordStart.mockResolvedValue('run-1')
    const layerVersions = { company: 'a-1-2', businessUnit: null, person: 'b-3-4' }
    const service = await buildService({ add: buildAddMock(), getJob: buildGetJobMock() }, { runs, layerVersions })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(runs.recordProfileProvenance).toHaveBeenCalledWith('run-1', expect.objectContaining({ layerVersions }))
  })

  it('#2005.11 — SAIT DIRE NON à l’invention : versions illisibles → les trois clés valent `null`', async () => {
    const runs = runsServiceMock()
    runs.recordStart.mockResolvedValue('run-1')
    const service = await buildService(
      { add: buildAddMock(), getJob: buildGetJobMock() },
      { runs, layerVersions: new Error('pg down') },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    expect(runs.recordProfileProvenance).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ layerVersions: { company: null, businessUnit: null, person: null } }),
    )
  })

  it('la provenance ne fait jamais tomber un lancement', async () => {
    // Une métrique ne doit ni retarder, ni empêcher, ni casser ce qu'elle
    // observe : l'écriture est best-effort côté service de runs, et l'absence
    // de versions laisse quand même un mode lisible à l'écran.
    const runs = runsServiceMock()
    runs.recordStart.mockResolvedValue('run-1')
    runs.recordProfileProvenance.mockRejectedValueOnce(new Error('pg down'))
    const service = await buildService({ add: buildAddMock(), getJob: buildGetJobMock() }, { runs })

    await expect(service.start({ company_name: 'SNCF' }, 'user-1')).resolves.toBeDefined()
  })
})

/**
 * #2451.1 / #2453.7 / #2453.8 — Analyser LIT le mode de contexte côté serveur.
 * Une couche exclue n'est pas « priée d'être ignorée » : elle n'est pas LUE, et
 * le run garde le mode qui l'a décidé pour que l'écran le libelle. Chaque mode
 * sait dire NON ; « Mon activité » rend le job byte-identique.
 */
describe('AnalysisService — les faits du compte sont un intrant du run (#4070)', () => {
  const facts = [
    { kind: 'need', label: 'Migration paie cloud', date: '2025-08-12', ageDays: 426 },
    { kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 },
  ]
  const inputs = {
    accountFacts: { accountFacts: facts, lostDealRex: 'Perte du 2024-06-01 — motif déclaré : prix.' },
    missionContacts: [{ name: 'Paul Durand', role: 'Directeur paie', relation: 'mission', lastSeen: '2024-02-01' }],
    previousAnalysis: "Analyse du 2026-06-18 (il y a 4 mois)\n- Siège : Lyon (corrigé par l'équipe le 2026-07-01)",
  }
  const history = 'CRM consulté pour « SNCF » :\n- 1 contact(s) déjà dans votre CRM chez ce groupe'

  it('#4070.1/.2/.3/.4 — le job embarque faits, motifs de perte, analyse précédente et interlocuteurs connus', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      {
        factsInputs: inputs,
        crmHistory: history,
        crmKnownContacts: [{ name: 'Claire Martin', jobTitle: 'DSI' }],
      },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.accountFacts).toEqual(facts)
    expect(jobData.lostDealRex).toContain('motif déclaré : prix')
    expect(jobData.previousAnalysis).toContain("corrigé par l'équipe le 2026-07-01")
    // Le CRM d'abord, puis les missions — un même nom n'entre qu'une fois.
    expect(jobData.knownContacts).toEqual([
      { name: 'Claire Martin', role: 'DSI', relation: 'crm', lastSeen: null },
      { name: 'Paul Durand', role: 'Directeur paie', relation: 'mission', lastSeen: '2024-02-01' },
    ])
  })

  it('NON — aucun fait, aucune analyse précédente : aucune clé, le job est byte-identique', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { factsInputs: {} })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    for (const key of ['accountFacts', 'knownContacts', 'previousAnalysis', 'lostDealRex']) {
      expect(key in jobData).toBe(false)
    }
  })

  it('NON — lecteur non branché (specs et déploiements historiques) : aucune clé', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() })

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect('accountFacts' in jobData).toBe(false)
    expect('knownContacts' in jobData).toBe(false)
  })

  it('NON — « Neutre » (aucune couche : ni CRM, ni historique commercial) : rien n’est lu, rien ne part', async () => {
    const add = buildAddMock()
    let mock: { accountFacts: jest.Mock; missionContacts: jest.Mock; previousAnalysis: jest.Mock } | undefined
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      {
        factsInputs: inputs,
        crmHistory: history,
        crmKnownContacts: [{ name: 'Claire Martin', jobTitle: 'DSI' }],
        onFactsInputs: m => {
          mock = m
        },
      },
    )

    await service.start({ company_name: 'SNCF', context_mode: 'neutral' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    for (const key of ['accountFacts', 'knownContacts', 'previousAnalysis', 'lostDealRex']) {
      expect(key in jobData).toBe(false)
    }
    expect(mock?.accountFacts).not.toHaveBeenCalled()
    expect(mock?.previousAnalysis).not.toHaveBeenCalled()
  })

  it('« Mission ponctuelle » : l’historique du compte CHOISI reste (c’est un objet choisi, pas du profil)', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { factsInputs: inputs })

    await service.start({ company_name: 'SNCF', context_mode: 'one_off_mission' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.accountFacts).toEqual(facts)
  })

  it('le CRM est interrogé pour ses contacts SEULEMENT quand il a déjà reconnu le compte', async () => {
    const add = buildAddMock()
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      // CRM branché mais aucun match : `crmPresence` est vide, donc aucun second appel au CRM.
      { factsInputs: {}, crmConnected: true, crmKnownContacts: [{ name: 'Claire Martin', jobTitle: 'DSI' }] },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect('knownContacts' in jobData).toBe(false)
  })

  it('l’espace d’un compte est celui qui cloisonne chaque lecture', async () => {
    const add = buildAddMock()
    let mock: { accountFacts: jest.Mock; missionContacts: jest.Mock; previousAnalysis: jest.Mock } | undefined
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      {
        factsInputs: inputs,
        onFactsInputs: m => {
          mock = m
        },
      },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    // `sellerHypotheses` fait poser `workspace_id: 'ws-1'` sur le compte créé par le mock.
    expect(mock?.accountFacts).toHaveBeenCalledWith({ workspaceId: 'ws-1', accountId: 'acc-1', userId: 'user-1' })
  })

  it('NON — compte sans espace (legacy) : on ne devine pas un espace, rien n’est lu', async () => {
    const add = buildAddMock()
    let mock: { accountFacts: jest.Mock; missionContacts: jest.Mock; previousAnalysis: jest.Mock } | undefined
    const service = await buildService(
      { add, getJob: buildGetJobMock() },
      {
        factsInputs: inputs,
        accountWithoutWorkspace: true,
        onFactsInputs: m => {
          mock = m
        },
      },
    )

    await service.start({ company_name: 'SNCF' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect('accountFacts' in jobData).toBe(false)
    expect(mock?.accountFacts).not.toHaveBeenCalled()
  })
})

describe('AnalysisService — mode de contexte (#2451.1)', () => {
  const answers: EsnAnswers = {
    ...EMPTY_ANSWERS,
    esn_name: 'Comet',
    expertise_areas: ['Data'],
    target_sectors: ['Banque'],
    geo_zones: ['France'],
  }
  const history = 'CRM consulté pour « SNCF » :\n- 3 contact(s) déjà dans votre CRM chez ce groupe'

  it('« Neutre » : ni profil, ni CRM ; le run est générique « par le mode » et garde le mode', async () => {
    const add = buildAddMock()
    const runs = runsServiceMock()
    runs.recordStart.mockResolvedValue('run-1')
    const service = await buildService({ add, getJob: buildGetJobMock() }, { answers, crmHistory: history, runs })

    await service.start({ company_name: 'SNCF', context_mode: 'neutral' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.profileData).toEqual({})
    expect(jobData.crmPresence).toBeUndefined()
    expect(jobData.contextMode).toBe('neutral')
    expect(runs.recordProfileProvenance).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ mode: 'generic', reason: 'context_mode', contextMode: 'neutral', esnName: null }),
    )
  })

  it('« Mission ponctuelle » : le profil habituel sort, le CRM du compte choisi reste', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { answers, crmHistory: history })

    await service.start({ company_name: 'SNCF', context_mode: 'one_off_mission' }, 'user-1')

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.profileData).toEqual({})
    expect(jobData.crmPresence).toBe(history)
    expect(jobData.contextMode).toBe('one_off_mission')
  })

  it('#2453.6 — conflit surcharge explicite du profil (niveau 1) contre « Neutre » (niveau 6) : la surcharge gagne', async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { answers })

    await service.start(
      { company_name: 'SNCF', context_mode: 'neutral', profile_data: { size: 'operator-override' } },
      'user-1',
    )

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.profileData).toEqual({ size: 'operator-override' })
  })

  it("sans mode dans l'appel, le défaut de l'ESPACE s'applique", async () => {
    const add = buildAddMock()
    const service = await buildService({ add, getJob: buildGetJobMock() }, { answers, crmHistory: history })

    await service.start({ company_name: 'SNCF' }, 'user-1', { workspaceDefaultMode: 'neutral' })

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.profileData).toEqual({})
    expect(jobData.crmPresence).toBeUndefined()
    expect(jobData.contextMode).toBe('neutral')
  })

  it("« Mon activité » explicite gagne sur un défaut d'espace « Neutre » — job byte-identique, aucun mode transporté", async () => {
    const add = buildAddMock()
    const runs = runsServiceMock()
    runs.recordStart.mockResolvedValue('run-2')
    const service = await buildService({ add, getJob: buildGetJobMock() }, { answers, crmHistory: history, runs })

    await service.start({ company_name: 'SNCF', context_mode: 'my_activity' }, 'user-1', {
      workspaceDefaultMode: 'neutral',
    })

    const [, jobData] = add.mock.calls[0]!
    expect(jobData.profileData).toEqual({
      companyName: 'Comet',
      offers: ['Data'],
      sectors: ['Banque'],
      geoZone: 'France',
    })
    expect(jobData.crmPresence).toBe(history)
    expect('contextMode' in jobData).toBe(false)
    expect(runs.recordProfileProvenance).toHaveBeenCalledWith(
      'run-2',
      // Profil incomplet ici (4 réponses sur 10) : générique pour SA raison, jamais « par le mode ».
      expect.objectContaining({ reason: 'incomplete_profile', contextMode: 'my_activity' }),
    )
  })
})

/**
 * #2164.17 — la question d'identité posée PENDANT le job, et sa réponse. Le
 * job en pause est un job BullMQ différé qui porte la question ; répondre
 * enregistre le SIREN choisi sur le job et le promeut (reprise immédiate).
 */
describe('AnalysisService — question d’identité pendant le job (#2164.17)', () => {
  const QUESTION = {
    candidates: [
      { name: 'BPCE', siren: '493455042', city: 'Paris' },
      { name: 'BPCE Lease', siren: '332357286', city: null },
    ],
    hypothesisSiren: '493455042',
    askedAt: '2026-11-01T10:00:00.000Z',
    expiresAt: '2026-11-01T10:05:00.000Z',
  }

  async function buildService(opts: { state?: string; data?: Record<string, unknown> | null; status?: string }) {
    const job =
      opts.data === null
        ? undefined
        : {
            id: 'job-1',
            data: { accountId: 'a-1', ...opts.data },
            getState: jest.fn().mockResolvedValue(opts.state ?? 'delayed'),
            updateData: jest.fn().mockResolvedValue(undefined),
            promote: jest.fn().mockResolvedValue(undefined),
          }
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalysisService,
        { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(job) } },
        {
          provide: AccountsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue(
              success({
                id: 'a-1',
                user_id: 'u-1',
                company_name: 'BPCE',
                status: opts.status ?? 'analyzing',
              } as unknown as AccountEntity),
            ),
          },
        },
        { provide: ContactsService, useValue: { findByAccount: jest.fn().mockResolvedValue([]) } },
        {
          provide: AnalysisCancellationService,
          useValue: { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn() },
        },
        esnProfileProvider(),
        creditsProvider(),
        { provide: AnalysisRunsService, useValue: runsServiceMock() },
        {
          provide: AnalysisPersistenceService,
          useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()
    return { service: moduleRef.get(AnalysisService), job }
  }

  it('rend la question d’un job en pause', async () => {
    const { service } = await buildService({ data: { entityQuestion: QUESTION } })
    const res = await service.entityQuestion('a-1', 'u-1')
    expect(res).toEqual(success({ question: QUESTION }))
  })

  it('NON — un job qui tourne, une question déjà répondue ou un compte terminé ne posent rien', async () => {
    for (const opts of [
      { state: 'active', data: { entityQuestion: QUESTION } },
      { data: { entityQuestion: QUESTION, entityAnswer: { siren: '332357286', answeredAt: 'x' } } },
      { status: 'completed', data: { entityQuestion: QUESTION } },
      { data: null },
    ]) {
      const { service } = await buildService(opts)
      expect(await service.entityQuestion('a-1', 'u-1')).toEqual(success({ question: null }))
    }
  })

  it('une réponse parmi les candidats est rangée sur le job, qui reprend aussitôt', async () => {
    const { service, job } = await buildService({ data: { entityQuestion: QUESTION } })
    const res = await service.answerEntityQuestion('a-1', 'u-1', { siren: '332357286' })
    expect(res).toEqual(success({ accountId: 'a-1', siren: '332357286' }))
    expect(job?.updateData).toHaveBeenCalledWith(
      expect.objectContaining({ entityAnswer: expect.objectContaining({ siren: '332357286' }) }),
    )
    expect(job?.promote).toHaveBeenCalled()
  })

  it('NON — un SIREN hors des candidats est refusé, rien n’est écrit', async () => {
    const { service, job } = await buildService({ data: { entityQuestion: QUESTION } })
    const res = await service.answerEntityQuestion('a-1', 'u-1', { siren: '552081317' })
    expect(isFailure(res) && res.problem.code).toBe('invalid_entity_answer')
    expect(job?.updateData).not.toHaveBeenCalled()
    expect(job?.promote).not.toHaveBeenCalled()
  })

  it('NON — sans question en attente, la réponse est un conflit', async () => {
    const { service, job } = await buildService({ state: 'active', data: {} })
    const res = await service.answerEntityQuestion('a-1', 'u-1', { siren: '332357286' })
    expect(isFailure(res) && res.problem.code).toBe('no_entity_question')
    expect(job?.promote).not.toHaveBeenCalled()
  })
})
