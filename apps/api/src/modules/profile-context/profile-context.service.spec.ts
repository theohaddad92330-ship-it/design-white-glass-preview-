import { Logger } from '@nestjs/common'
import type {
  AnalysisBusinessUnit,
  AnswerMetaMap,
  EsnAnswers,
  ProfileContext,
  ProfilerEnvelope,
} from '@bellum/contracts'
import { isFailure } from '@bellum/utils'
import type { Repository } from 'typeorm'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { ProductAnalyticsService } from '../analytics/product-analytics.service'
import type { IaClient } from '../ia/ia.client'
import type { AnswerMetaReader } from './answer-meta.port'
import type { BusinessUnitsReader } from './business-units.port'
import type { ConnectedToolsReader } from './connected-tools.port'
import { ProfileContextService } from './profile-context.service'
import type { ProfileContextRevisionService } from './profile-context-revision.service'
import type { ProfilerGateway } from './profiler.gateway'
import type { ProfilerProgressService } from './profiler-progress.service'
import type { SkippedQuestionsReader } from './skipped-questions.port'
import type { WorkspaceIdReader } from './workspace-id.port'

const ANSWERS_A = { esn_name: 'Acme' } as unknown as EsnAnswers
const ANSWERS_B = { esn_name: 'Beta' } as unknown as EsnAnswers
const CONTEXT = { esnArchetype: 'boutiqueExpert' } as unknown as ProfileContext

function successEnvelope(): ProfilerEnvelope {
  return { status: 'success', data: CONTEXT } as unknown as ProfilerEnvelope
}

function failureEnvelope(): ProfilerEnvelope {
  return { status: 'error', data: null } as unknown as ProfilerEnvelope
}

/** Lets the background `.then()/.catch()/.finally()` chain of a fire-and-forget
 *  `triggerGeneration()` settle before the next assertion — it resolves as soon
 *  as `status='generating'` is persisted, well before the IA call completes. */
async function flushBackgroundWork(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

function makeProfilesRepo(): Repository<ProfileEntity> {
  return {
    findOne: jest.fn(async () => ({ user_id: 'u1', first_name: 'Théo' }) as unknown as ProfileEntity),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<ProfileEntity>
}

// #2009.11 — par défaut, une version de prompt STABLE et non-nulle : les
// tests d'idempotence déjà écrits pour workspace/BU ne doivent pas se
// dédoublonner différemment juste parce que ce segment existe désormais.
function makeIaClient(
  impl: () => Promise<ProfilerEnvelope>,
  promptVersion: () => Promise<string | null> = async () => 'v1',
): IaClient {
  return { generateProfile: jest.fn(impl), promptVersion: jest.fn(promptVersion) } as unknown as IaClient
}

/** #2007.8 — par défaut, aucun outil branché : dégrade en `[]`, jamais un
 *  échec de test qui n'a rien à voir avec les connecteurs. */
function makeConnectedTools(tools: readonly { display_name: string; status: string }[] = []) {
  // #2007.8 / GA-07 — le double est celui du PORT, pas du service d'un autre
  // module : le filtre « connecté » et la projection sur le nom affichable
  // vivent désormais dans `profile-context.module.ts`, qui est le seul endroit
  // à connaître les deux côtés.
  return {
    listConnected: jest.fn(async () =>
      tools.filter(tool => tool.status === 'connected').map(tool => tool.display_name),
    ),
  } as unknown as ConnectedToolsReader
}

// #2009.7 — par défaut, aucun espace résolu (profil legacy) : dégrade en
// `null`, jamais un échec de test qui n'a rien à voir avec le workspace.
function makeWorkspaceReader(resolve: () => Promise<string | null> = async () => null): WorkspaceIdReader {
  return { resolveWorkspaceId: jest.fn(resolve) }
}

// #2007.6/#2007.7/#2007.10/#2007.12 — par défaut, aucune entrée : dégrade en
// `{}`, jamais un échec de test qui n'a rien à voir avec la provenance.
function makeAnswerMetaReader(map: AnswerMetaMap = {}): AnswerMetaReader {
  return { resolveAnswerMeta: jest.fn(async () => map) }
}

// #2007.3 / #2009.8 — par défaut, aucun périmètre porté : dégrade en `[]`,
// et la clé reste byte-identique à celle d'avant la couche BU.
function makeBusinessUnitsReader(resolve: () => Promise<AnalysisBusinessUnit[]> = async () => []): BusinessUnitsReader {
  return { resolveCarriedBusinessUnits: jest.fn(resolve) }
}

// #2007.11 — par défaut, aucune clé passée : dégrade en `[]`, et la clé reste
// byte-identique à celle d'avant ce champ.
function makeSkippedQuestionsReader(resolve: () => Promise<string[]> = async () => []): SkippedQuestionsReader {
  return { resolveSkippedQuestionKeys: jest.fn(resolve) }
}

function makeService(
  iaClient: IaClient,
  toolRegistry: ConnectedToolsReader = makeConnectedTools(),
  workspaceReader: WorkspaceIdReader = makeWorkspaceReader(),
  answerMetaReader: AnswerMetaReader = makeAnswerMetaReader(),
  businessUnitsReader: BusinessUnitsReader = makeBusinessUnitsReader(),
  skippedQuestionsReader: SkippedQuestionsReader = makeSkippedQuestionsReader(),
) {
  const profilerProgress = {
    buildCallback: jest.fn(() => ({ url: 'http://internal/profiler/progress', userId: 'u1' })),
  } as unknown as ProfilerProgressService
  const profilerGateway = {
    emitDone: jest.fn(async () => undefined),
    emitError: jest.fn(async () => undefined),
  } as unknown as ProfilerGateway
  const revisions = {
    recordNewVersion: jest.fn(async () => undefined),
    // #2062.1 — `validate` passe par la même garde de lecture que `getMe` :
    // valider un contexte ne valide pas une phrase que la doctrine refuse.
    liveSnapshotMeta: jest.fn(async () => null),
  } as unknown as ProfileContextRevisionService
  return new ProfileContextService(
    makeProfilesRepo(),
    iaClient,
    profilerProgress,
    profilerGateway,
    revisions,
    toolRegistry,
    workspaceReader,
    answerMetaReader,
    businessUnitsReader,
    skippedQuestionsReader,
  )
}

// #2775 — même construction que `makeService`, avec un `ProductAnalyticsService`
// CONTRÔLABLE en plus (dernier paramètre du constructeur, `@Optional()`) : les
// autres tests de ce fichier n'ont rien à changer, `makeService` reste
// byte-identique. `recordNewVersion` est overridable pour simuler une panne de
// PERSISTANCE distincte d'une panne du modèle (#2775 — `stage: 'persist'` vs
// `stage: 'llm'`).
function makeServiceWithAnalytics(
  iaClient: IaClient,
  opts: { recordNewVersion?: () => Promise<void> } = {},
): { service: ProfileContextService; analytics: ProductAnalyticsService; profiles: Repository<ProfileEntity> } {
  const profilerProgress = {
    buildCallback: jest.fn(() => ({ url: 'http://internal/profiler/progress', userId: 'u1' })),
  } as unknown as ProfilerProgressService
  const profilerGateway = {
    emitDone: jest.fn(async () => undefined),
    emitError: jest.fn(async () => undefined),
  } as unknown as ProfilerGateway
  const revisions = {
    recordNewVersion: jest.fn(opts.recordNewVersion ?? (async () => undefined)),
    liveSnapshotMeta: jest.fn(async () => null),
  } as unknown as ProfileContextRevisionService
  const analytics = { track: jest.fn(async () => undefined) } as unknown as ProductAnalyticsService
  const profiles = makeProfilesRepo()
  const service = new ProfileContextService(
    profiles,
    iaClient,
    profilerProgress,
    profilerGateway,
    revisions,
    makeConnectedTools(),
    makeWorkspaceReader(),
    makeAnswerMetaReader(),
    makeBusinessUnitsReader(),
    makeSkippedQuestionsReader(),
    analytics,
  )
  return { service, analytics, profiles }
}

describe('ProfileContextService.triggerGeneration — idempotence (#2008)', () => {
  it('does not start a second IA generation while one is already running for the SAME user and SAME answers', async () => {
    // Reproduces esn-profile.controller.ts:258-259 today: upsertAnswers()
    // fires triggerGeneration() (void), then the controller awaits
    // triggerGeneration() again on the SAME resolved answers.
    let resolveFirst!: (envelope: ProfilerEnvelope) => void
    const first = new Promise<ProfilerEnvelope>(resolve => {
      resolveFirst = resolve
    })
    const iaClient = makeIaClient(() => first)
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await service.triggerGeneration('u1', ANSWERS_A)

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
    resolveFirst(successEnvelope())
    await flushBackgroundWork()
  })

  // #2007.8 — l'état RÉEL des connecteurs atteint le Profileur, résolu par
  // `ToolRegistryService.list`, jamais deviné depuis les réponses déclarées.
  it('#2007.8 — transmet au Profileur les outils marqués `connected` par le registre, et EUX SEULS', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const toolRegistry = makeConnectedTools([
      { display_name: 'Salesforce', status: 'connected' },
      { display_name: 'HubSpot', status: 'action_required' },
    ])
    const service = makeService(iaClient, toolRegistry)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(expect.objectContaining({ connectedTools: ['Salesforce'] }))
  })

  // #2007.8 — best-effort : une lecture du registre qui échoue ne doit
  // jamais empêcher la génération elle-même (même doctrine que le reste de
  // cette méthode).
  it('#2007.8 — une lecture du registre en échec dégrade en `[]`, sans bloquer la génération', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const toolRegistry = {
      listConnected: jest.fn(async () => {
        throw new Error('registre indisponible')
      }),
    } as unknown as ConnectedToolsReader
    const service = makeService(iaClient, toolRegistry)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(expect.objectContaining({ connectedTools: [] }))
  })

  // #2007.6/#2007.7/#2007.10/#2007.12 — la provenance ET le statut de chaque
  // réponse connue atteignent le Profileur, dérivés par
  // `deriveAnswerProvenanceForModel` (@bellum/contracts, GA-26).
  it('#2007.6/#2007.12 — transmet une ligne « source, statut » par réponse connue de `answer_meta`', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const answerMeta: AnswerMetaMap = {
      esn_name: {
        question: { key: 'esn_name', label: 'esn_name', version: 1 },
        questionnaireVersion: 1,
        provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-16', actorId: 'u1' },
        status: 'confirmed',
        branchReason: 'company_profile',
        consumerAreas: ['audit'],
      },
    }
    const service = makeService(iaClient, makeConnectedTools(), makeWorkspaceReader(), makeAnswerMetaReader(answerMeta))

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ answerProvenanceLines: ['esn_name: source=user, statut=confirmed'] }),
    )
  })

  it('#2007.7 — transmet les clés dont la source est EXTERNE comme « contexte importé »', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const answerMeta: AnswerMetaMap = {
      target_sectors: {
        question: { key: 'target_sectors', label: 'target_sectors', version: 1 },
        questionnaireVersion: 1,
        provenance: { source: 'registry', confidence: 'high', observedAt: '2026-09-10', actorId: null },
        status: 'proposed',
        branchReason: 'company_profile',
        consumerAreas: ['audit'],
      },
    }
    const service = makeService(iaClient, makeConnectedTools(), makeWorkspaceReader(), makeAnswerMetaReader(answerMeta))

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ importedContextKeys: ['target_sectors'] }),
    )
  })

  it('#2007.10 — transmet les clés CORRIGÉES après une première valeur', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const answerMeta: AnswerMetaMap = {
      consultant_size: {
        question: { key: 'consultant_size', label: 'consultant_size', version: 1 },
        questionnaireVersion: 1,
        provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-18', actorId: 'u1' },
        status: 'corrected',
        branchReason: 'company_profile',
        consumerAreas: ['audit'],
      },
    }
    const service = makeService(iaClient, makeConnectedTools(), makeWorkspaceReader(), makeAnswerMetaReader(answerMeta))

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ correctedAnswersLines: ['consultant_size: corrigé le 2026-09-18'] }),
    )
  })

  it('#2007.6 — une lecture de `answer_meta` en échec dégrade en trois listes vides, sans bloquer la génération', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const answerMetaReader: AnswerMetaReader = {
      resolveAnswerMeta: jest.fn(async () => {
        throw new Error('answer_meta indisponible')
      }),
    }
    const service = makeService(iaClient, makeConnectedTools(), makeWorkspaceReader(), answerMetaReader)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ answerProvenanceLines: [], importedContextKeys: [], correctedAnswersLines: [] }),
    )
  })

  // #2007.11 — les clés que l'utilisateur a volontairement PASSÉES atteignent
  // le Profileur, résolues par un port dédié (jamais confondu avec
  // `answer_meta`, qui suppose toujours une valeur).
  it('#2007.11 — transmet au Profileur les clés PASSÉES volontairement', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const service = makeService(
      iaClient,
      makeConnectedTools(),
      makeWorkspaceReader(),
      makeAnswerMetaReader(),
      makeBusinessUnitsReader(),
      makeSkippedQuestionsReader(async () => ['avg_tjm']),
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(expect.objectContaining({ skippedQuestionKeys: ['avg_tjm'] }))
  })

  // #2007.11 — best-effort : une lecture ratée ne doit jamais empêcher la
  // génération elle-même (même doctrine que le reste de cette méthode).
  it('#2007.11 — une lecture des clés passées en échec dégrade en `[]`, sans bloquer la génération', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const skippedQuestionsReader: SkippedQuestionsReader = {
      resolveSkippedQuestionKeys: jest.fn(async () => {
        throw new Error('skipped_question_keys indisponible')
      }),
    }
    const service = makeService(
      iaClient,
      makeConnectedTools(),
      makeWorkspaceReader(),
      makeAnswerMetaReader(),
      makeBusinessUnitsReader(),
      skippedQuestionsReader,
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(expect.objectContaining({ skippedQuestionKeys: [] }))
  })

  it('does NOT dedupe a different user, or the same user with different answers — a garde must not over-catch', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await service.triggerGeneration('u2', ANSWERS_A)
    await service.triggerGeneration('u1', ANSWERS_B)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(3)
  })

  it('lets a NEW generation start again once the previous one has finished, even with the same answers', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()
    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(2)
  })

  it('releases the in-flight guard on failure too, so a retry with the same answers is not blocked forever', async () => {
    const iaClient = makeIaClient(async () => failureEnvelope())
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()
    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(2)
  })

  // #2009.7 — la clé cible (docblock `generationKey`) est workspace + BU +
  // utilisateur + version des réponses + version du prompt ; BU et prompt
  // restent hors périmètre (couche isolée / #2009.11), mais le workspace doit
  // désormais distinguer deux appels identiques par ailleurs.
  it('#2009.7 — un MÊME utilisateur, les MÊMES réponses, mais un espace de travail ACTIF différent, ne se dédoublonnent PAS', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    let call = 0
    const workspaceReader = makeWorkspaceReader(async () => (call++ === 0 ? 'ws-1' : 'ws-2'))
    const service = makeService(iaClient, makeConnectedTools(), workspaceReader)

    await service.triggerGeneration('u1', ANSWERS_A)
    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(2)
  })

  it('#2009.7 — un MÊME utilisateur, les MÊMES réponses, le MÊME espace : toujours dédoublonné', async () => {
    let resolveFirst!: (envelope: ProfilerEnvelope) => void
    const first = new Promise<ProfilerEnvelope>(resolve => {
      resolveFirst = resolve
    })
    const iaClient = makeIaClient(() => first)
    const workspaceReader = makeWorkspaceReader(async () => 'ws-1')
    const service = makeService(iaClient, makeConnectedTools(), workspaceReader)

    await service.triggerGeneration('u1', ANSWERS_A)
    await service.triggerGeneration('u1', ANSWERS_A)

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
    resolveFirst(successEnvelope())
    await flushBackgroundWork()
  })
})

/**
 * #2007.3 / #2009.8 — le périmètre PORTÉ (BU / agence) atteint le Profileur et
 * entre dans la clé d'idempotence. Lu par un PORT borné à l'espace actif ET à
 * l'utilisateur (`EsnProfileWorkspaceResolver.resolveCarriedBusinessUnits`).
 */
describe('ProfileContextService.triggerGeneration — le périmètre BU (#2007.3, #2009.8)', () => {
  const AGENCE_LYON: AnalysisBusinessUnit = {
    name: 'Agence Lyon',
    kind: 'agency',
    territory: 'Auvergne-Rhône-Alpes',
    specialties: ['Data'],
  }

  it('#2007.3 — transmet au Profileur les BU que le membre PORTE', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const reader = makeBusinessUnitsReader(async () => [AGENCE_LYON])
    const service = makeService(iaClient, makeConnectedTools(), makeWorkspaceReader(), makeAnswerMetaReader(), reader)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(reader.resolveCarriedBusinessUnits).toHaveBeenCalledWith('u1')
    expect(iaClient.generateProfile).toHaveBeenCalledWith(expect.objectContaining({ businessUnits: [AGENCE_LYON] }))
  })

  it('#2007.3 — une lecture ratée dégrade en `[]`, jamais bloquante ni devinée', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const reader = makeBusinessUnitsReader(async () => {
      throw new Error('db down')
    })
    const service = makeService(iaClient, makeConnectedTools(), makeWorkspaceReader(), makeAnswerMetaReader(), reader)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledWith(expect.objectContaining({ businessUnits: [] }))
  })

  it('#2009.8 — MÊMES utilisateur, réponses et espace, mais un périmètre porté DIFFÉRENT : ne se dédoublonnent PAS', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    let call = 0
    const reader = makeBusinessUnitsReader(async () =>
      call++ === 0 ? [AGENCE_LYON] : [{ name: 'Agence Toulouse', kind: 'agency' }],
    )
    const service = makeService(
      iaClient,
      makeConnectedTools(),
      makeWorkspaceReader(async () => 'ws-1'),
      makeAnswerMetaReader(),
      reader,
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(2)
  })

  it('#2009.8 — le MÊME périmètre porté : toujours dédoublonné', async () => {
    let resolveFirst!: (envelope: ProfilerEnvelope) => void
    const first = new Promise<ProfilerEnvelope>(resolve => {
      resolveFirst = resolve
    })
    const iaClient = makeIaClient(() => first)
    const reader = makeBusinessUnitsReader(async () => [AGENCE_LYON])
    const service = makeService(
      iaClient,
      makeConnectedTools(),
      makeWorkspaceReader(async () => 'ws-1'),
      makeAnswerMetaReader(),
      reader,
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await service.triggerGeneration('u1', ANSWERS_A)

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
    resolveFirst(successEnvelope())
    await flushBackgroundWork()
  })
})

/**
 * #2009.11 — la version du prompt PROFILEUR entre dans la clé d'idempotence,
 * lue côté IA (`GET /config/prompt-version/profiler`, `prompt_version_for`,
 * GA-26 : une seule source de vérité) AVANT l'appel générateur.
 */
describe('ProfileContextService.triggerGeneration — la version du prompt (#2009.11)', () => {
  it('un MÊME utilisateur, les MÊMES réponses, mais une version de prompt DIFFÉRENTE : ne se dédoublonnent PAS', async () => {
    let call = 0
    const iaClient = makeIaClient(
      async () => successEnvelope(),
      async () => (call++ === 0 ? 'v1' : 'v2'),
    )
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(2)
  })

  it('la MÊME version de prompt : toujours dédoublonné', async () => {
    let resolveFirst!: (envelope: ProfilerEnvelope) => void
    const first = new Promise<ProfilerEnvelope>(resolve => {
      resolveFirst = resolve
    })
    const iaClient = makeIaClient(
      () => first,
      async () => 'v1',
    )
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await service.triggerGeneration('u1', ANSWERS_A)

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
    resolveFirst(successEnvelope())
    await flushBackgroundWork()
  })

  it('une lecture ratée dégrade en `prompt=unknown`, jamais bloquante pour la génération', async () => {
    const iaClient = makeIaClient(
      async () => successEnvelope(),
      async () => {
        throw new Error('ia muette')
      },
    )
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
  })
})

/**
 * #2009.15 — journaliser le déclencheur, la version d'entrée et l'auteur au
 * moment où une génération démarre RÉELLEMENT (pas le cas doublon-ignoré,
 * déjà loggé). Avant ce point, seul `Profile context persisted for user…`
 * (succès) et le doublon skip étaient tracés — aucune ligne au DÉMARRAGE ne
 * distinguait un déclenchement manuel d'une réédition, ni ne permettait de
 * relier deux générations à la MÊME version de réponses sans relire les
 * réponses elles-mêmes (jamais de contenu de réponse en clair dans un log,
 * doctrine sécurité — seul un hash de la clé d'idempotence est tracé).
 */
describe('ProfileContextService.triggerGeneration — #2009.15 journal du déclenchement', () => {
  it('journalise déclencheur=regenerate, l’auteur et une version d’entrée (hash, jamais les réponses en clair) au démarrage', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const iaClient = makeIaClient(async () => successEnvelope())
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    const startLine = logSpy.mock.calls.map(call => String(call[0])).find(line => line.includes('trigger=regenerate'))
    expect(startLine).toBeDefined()
    expect(startLine).toContain('user=u1')
    expect(startLine).toMatch(/answersVersion=[0-9a-f]{12}/)
    // Jamais le contenu réel des réponses dans le log.
    expect(startLine).not.toContain('Acme')
  })

  it('journalise déclencheur=reedited quand options.reedited est vrai', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const iaClient = makeIaClient(async () => successEnvelope())
    const service = makeService(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A, { reedited: true })
    await flushBackgroundWork()

    const startLine = logSpy.mock.calls.map(call => String(call[0])).find(line => line.includes('trigger=reedited'))
    expect(startLine).toBeDefined()
  })

  it('ne journalise PAS de ligne de démarrage pour un déclenchement SAUTÉ (doublon ou D9)', async () => {
    let resolveFirst!: (envelope: ProfilerEnvelope) => void
    const first = new Promise<ProfilerEnvelope>(resolve => {
      resolveFirst = resolve
    })
    const iaClient = makeIaClient(() => first)
    const service = makeService(iaClient)
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    await service.triggerGeneration('u1', ANSWERS_A)
    logSpy.mockClear()
    await service.triggerGeneration('u1', ANSWERS_A) // doublon — sauté

    const startLines = logSpy.mock.calls.map(call => String(call[0])).filter(line => line.includes('trigger='))
    expect(startLines).toHaveLength(0)
    resolveFirst(successEnvelope())
    await flushBackgroundWork()
  })
})

// #2775 — épopée « instrumentation fine des 6 phases onboarding » : deux des
// six phases affichées par `OnboardingGeneratingPage` (`buildProfile`/`persist`,
// cf. `onboarding-generation-phases.ts`) n'avaient, avant ce lot, AUCUN
// événement produit dédié — seule la réponse HTTP de `POST
// /esn-profile/regenerate-context` était observable, et elle répond dès que le
// statut passe à `generating`, bien avant que le modèle ait répondu ou que la
// révision soit persistée. Ces trois tests verrouillent les trois instants
// RÉELS désormais posés : le départ (après tout saut d'idempotence/D9), la fin
// RÉELLE (persistance écrite, pas juste reçue du modèle), et l'échec — avec
// l'étape qui a RÉELLEMENT cassé (`stage: 'llm'` | `'persist'`), jamais confondues.
describe('ProfileContextService — #2775 événements produit de la génération', () => {
  it('émet onboarding_generation_started au départ RÉEL de la génération, jamais sur un déclenchement sauté', async () => {
    let resolveFirst!: (envelope: ProfilerEnvelope) => void
    const first = new Promise<ProfilerEnvelope>(resolve => {
      resolveFirst = resolve
    })
    const iaClient = makeIaClient(() => first)
    const { service, analytics } = makeServiceWithAnalytics(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    expect(analytics.track).toHaveBeenCalledWith(
      'onboarding_generation_started',
      expect.objectContaining({ userId: 'u1', properties: { reedited: false } }),
    )
    ;(analytics.track as jest.Mock).mockClear()

    await service.triggerGeneration('u1', ANSWERS_A) // doublon (#2008) — sauté
    expect(analytics.track).not.toHaveBeenCalledWith('onboarding_generation_started', expect.anything())

    resolveFirst(successEnvelope())
    await flushBackgroundWork()
  })

  it('émet onboarding_generation_completed seulement quand la révision est RÉELLEMENT persistée', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service, analytics } = makeServiceWithAnalytics(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(analytics.track).toHaveBeenCalledWith('onboarding_generation_completed', { userId: 'u1' })
  })

  it('émet onboarding_generation_failed(stage: llm) quand le modèle ne rend pas de succès', async () => {
    const iaClient = makeIaClient(async () => failureEnvelope())
    const { service, analytics } = makeServiceWithAnalytics(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(analytics.track).toHaveBeenCalledWith(
      'onboarding_generation_failed',
      expect.objectContaining({ userId: 'u1', properties: { stage: 'llm' } }),
    )
    expect(analytics.track).not.toHaveBeenCalledWith('onboarding_generation_completed', expect.anything())
  })

  it('émet onboarding_generation_failed(stage: persist) quand le modèle réussit mais que la persistance échoue', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service, analytics } = makeServiceWithAnalytics(iaClient, {
      recordNewVersion: async () => {
        throw new Error('db down')
      },
    })

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(analytics.track).toHaveBeenCalledWith(
      'onboarding_generation_failed',
      expect.objectContaining({ userId: 'u1', properties: { stage: 'persist' } }),
    )
    expect(analytics.track).not.toHaveBeenCalledWith('onboarding_generation_completed', expect.anything())
  })

  // #4969 — « Échec — raison non enregistrée » : l'échec s'écrivait SANS motif. Une raison COURTE (un code, jamais le
  // message d'erreur ni un corps) se pose avec le statut `failed`, et s'efface avec tout autre statut.
  it('#4969 enregistre une raison « model_error » quand le modèle ne rend pas de succès', async () => {
    const iaClient = makeIaClient(async () => failureEnvelope())
    const { service, profiles } = makeServiceWithAnalytics(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(profiles.update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      { profile_context_status: 'failed', profile_context_failure_reason: 'model_error' },
    )
  })

  it('#4969 enregistre « model_unreachable » quand l’appel au service IA lève, sans recopier son message', async () => {
    const iaClient = makeIaClient(async () => {
      throw new Error('secret-token-xyz connect ECONNREFUSED')
    })
    const { service, profiles } = makeServiceWithAnalytics(iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(profiles.update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      { profile_context_status: 'failed', profile_context_failure_reason: 'model_unreachable' },
    )
    expect(JSON.stringify((profiles.update as jest.Mock).mock.calls)).not.toContain('secret-token')
  })

  it('#4969 enregistre « persist_failed » quand la persistance échoue', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service, profiles } = makeServiceWithAnalytics(iaClient, {
      recordNewVersion: async () => {
        throw new Error('db down')
      },
    })

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(profiles.update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      { profile_context_status: 'failed', profile_context_failure_reason: 'persist_failed' },
    )
  })
})

// D9 — décision Louis 14/09/2026 : valider le contexte commercial. Ses propres
// helpers, même motif que `validate` ci-dessous : `makeProfilesRepo()` (haut de
// fichier) ignore `select` et ne peut donc jamais rendre `profile_context_status`.
describe('ProfileContextService.triggerGeneration — un contexte VALIDÉ (D9)', () => {
  type Row = { user_id: string; first_name: string | null; profile_context_status: string }

  function makeD9Service(status: string, iaClient: IaClient) {
    const findOne = jest.fn(async (): Promise<Row> => ({
      user_id: 'u1',
      first_name: 'Théo',
      profile_context_status: status,
    }))
    const update = jest.fn(async () => undefined)
    const profiles = { findOne, update } as unknown as Repository<ProfileEntity>
    const profilerProgress = {
      buildCallback: jest.fn(() => ({ url: 'http://internal/profiler/progress', userId: 'u1' })),
    } as unknown as ProfilerProgressService
    const profilerGateway = {
      emitDone: jest.fn(async () => undefined),
      emitError: jest.fn(async () => undefined),
    } as unknown as ProfilerGateway
    const revisions = { recordNewVersion: jest.fn(async () => undefined) } as unknown as ProfileContextRevisionService
    return {
      service: new ProfileContextService(
        profiles,
        iaClient,
        profilerProgress,
        profilerGateway,
        revisions,
        makeConnectedTools(),
        makeWorkspaceReader(),
        makeAnswerMetaReader(),
        makeBusinessUnitsReader(),
        makeSkippedQuestionsReader(),
      ),
      profiles,
    }
  }

  it('un chemin AUTOMATIQUE (bouton Régénérer, changement de prénom…) saute un contexte VALIDÉ — la correction humaine gagne toujours', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service, profiles } = makeD9Service('validated', iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).not.toHaveBeenCalled()
    expect(profiles.update).not.toHaveBeenCalled()
  })

  it('une RÉÉDITION des réponses (options.reedited) régénère MÊME un contexte validé, et retire sa validation', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service, profiles } = makeD9Service('validated', iaClient)

    await service.triggerGeneration('u1', ANSWERS_A, { reedited: true })
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
    expect(profiles.update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      { profile_context_status: 'generating', profile_context_validated_at: null },
    )
  })

  it('un contexte NON validé régénère normalement — aucun retrait de validation à écrire', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service, profiles } = makeD9Service('succeeded', iaClient)

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
    expect(profiles.update).not.toHaveBeenCalledWith(
      { user_id: 'u1' },
      expect.objectContaining({ profile_context_validated_at: null }),
    )
  })

  it('libère la clé d’idempotence même sur un saut — une réédition juste après n’est pas bloquée', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service } = makeD9Service('validated', iaClient)

    await service.triggerGeneration('u1', ANSWERS_A) // sauté (validé, chemin automatique)
    await service.triggerGeneration('u1', ANSWERS_A, { reedited: true }) // ne doit PAS trouver la clé déjà prise
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
  })
})

/**
 * #2009.14 — une génération TERMINÉE (statut `succeeded`) sur la MÊME clé
 * d'idempotence ne relance jamais le modèle : `profile_context` porte déjà
 * ce résultat. Ses propres helpers, même motif que le describe D9 ci-dessus :
 * `makeProfilesRepo()` ignore `select` et ne peut donc jamais rendre
 * `profile_context_generation_key`.
 */
describe('ProfileContextService.triggerGeneration — réutiliser un résultat déjà généré (#2009.14)', () => {
  type Row = {
    user_id: string
    first_name: string | null
    profile_context_status: string
    profile_context_generation_key: string | null
  }

  function makeReuseService(row: Row, iaClient: IaClient) {
    const findOne = jest.fn(async (): Promise<Row> => row)
    const update = jest.fn(async () => undefined)
    const profiles = { findOne, update } as unknown as Repository<ProfileEntity>
    const profilerProgress = {
      buildCallback: jest.fn(() => ({ url: 'http://internal/profiler/progress', userId: 'u1' })),
    } as unknown as ProfilerProgressService
    const profilerGateway = {
      emitDone: jest.fn(async () => undefined),
      emitError: jest.fn(async () => undefined),
    } as unknown as ProfilerGateway
    const revisions = {
      recordNewVersion: jest.fn(async () => undefined),
    } as unknown as ProfileContextRevisionService
    return {
      service: new ProfileContextService(
        profiles,
        iaClient,
        profilerProgress,
        profilerGateway,
        revisions,
        makeConnectedTools(),
        makeWorkspaceReader(),
        makeAnswerMetaReader(),
        makeBusinessUnitsReader(),
        makeSkippedQuestionsReader(),
      ),
      profiles,
      revisions,
    }
  }

  it('une génération RÉUSSIE sur la MÊME clé (mêmes réponses) n’appelle pas une seconde fois le modèle', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    // #2009.7 : workspaceId `null` (aucun lecteur custom) → clé =
    // `u1:none:{"esn_name":"Acme"}`, la même que celle déjà persistée.
    const key = 'u1:none:prompt=v1:' + JSON.stringify(ANSWERS_A, Object.keys(ANSWERS_A).sort())
    const { service: reuseService, profiles } = makeReuseService(
      { user_id: 'u1', first_name: 'Théo', profile_context_status: 'succeeded', profile_context_generation_key: key },
      iaClient,
    )

    await reuseService.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).not.toHaveBeenCalled()
    expect(profiles.update).not.toHaveBeenCalled()
  })

  it('des réponses DIFFÉRENTES (clé différente) régénèrent normalement, même avec un statut succeeded', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const staleKey = 'u1:none:prompt=v1:' + JSON.stringify(ANSWERS_B, Object.keys(ANSWERS_B).sort())
    const { service } = makeReuseService(
      {
        user_id: 'u1',
        first_name: 'Théo',
        profile_context_status: 'succeeded',
        profile_context_generation_key: staleKey,
      },
      iaClient,
    )

    await service.triggerGeneration('u1', ANSWERS_A) // clé différente de staleKey (ANSWERS_B)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
  })

  it('un échec précédent (failed) sur la MÊME clé régénère normalement — un échec ne se « réutilise » jamais', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const key = 'u1:none:prompt=v1:' + JSON.stringify(ANSWERS_A, Object.keys(ANSWERS_A).sort())
    const { service } = makeReuseService(
      { user_id: 'u1', first_name: 'Théo', profile_context_status: 'failed', profile_context_generation_key: key },
      iaClient,
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(iaClient.generateProfile).toHaveBeenCalledTimes(1)
  })

  it('persiste la clé à côté du contexte pour qu’un appel identique ultérieur puisse la reconnaître', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const key = 'u1:none:prompt=v1:' + JSON.stringify(ANSWERS_A, Object.keys(ANSWERS_A).sort())
    const { service, revisions } = makeReuseService(
      {
        user_id: 'u1',
        first_name: 'Théo',
        profile_context_status: 'not_generated',
        profile_context_generation_key: null,
      },
      iaClient,
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    expect(revisions.recordNewVersion).toHaveBeenCalledWith('u1', CONTEXT, key)
  })

  // #2908 (#2011.4) — L'EMPREINTE DE CONTENU est posée à CÔTÉ du compteur que
  // `recordNewVersion` vient de faire avancer, sur le contenu REÇU du modèle
  // (jamais recalculée depuis une relecture de la ligne).
  it('#2908 — persiste commercial_audit_version comme une empreinte du contenu généré', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service, profiles } = makeReuseService(
      {
        user_id: 'u1',
        first_name: 'Théo',
        profile_context_status: 'not_generated',
        profile_context_generation_key: null,
      },
      iaClient,
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    const versionCall = (profiles.update as jest.Mock).mock.calls.find(
      ([, patch]) => patch && typeof patch === 'object' && 'commercial_audit_version' in patch,
    )
    expect(versionCall).toBeDefined()
    const [, patch] = versionCall as [unknown, { commercial_audit_version: string | null }]
    expect(patch.commercial_audit_version).toEqual(expect.stringMatching(/^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/))
  })

  // #2012.12 (épopée #2776) — `envelope.meta.source_health` était jeté à
  // cette même frontière (constat des lots précédents) : ce test prouve
  // qu'il atteint désormais la colonne, à côté de l'empreinte de contenu.
  it('#2012.12 — persiste source_health depuis envelope.meta, jamais deviné', async () => {
    const iaClient = makeIaClient(
      async () =>
        ({
          status: 'success',
          data: CONTEXT,
          meta: { source_health: { market_memory: 'down' } },
        }) as unknown as ProfilerEnvelope,
    )
    const { service, profiles } = makeReuseService(
      {
        user_id: 'u1',
        first_name: 'Théo',
        profile_context_status: 'not_generated',
        profile_context_generation_key: null,
      },
      iaClient,
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    const healthCall = (profiles.update as jest.Mock).mock.calls.find(
      ([, patch]) => patch && typeof patch === 'object' && 'source_health' in patch,
    )
    expect(healthCall).toBeDefined()
    const [, patch] = healthCall as [unknown, { source_health: unknown }]
    expect(patch.source_health).toEqual({ market_memory: 'down' })
  })

  it('#2012.12 — sans meta.source_health sur l’enveloppe, persiste null (jamais un objet vide deviné)', async () => {
    const iaClient = makeIaClient(async () => successEnvelope())
    const { service, profiles } = makeReuseService(
      {
        user_id: 'u1',
        first_name: 'Théo',
        profile_context_status: 'not_generated',
        profile_context_generation_key: null,
      },
      iaClient,
    )

    await service.triggerGeneration('u1', ANSWERS_A)
    await flushBackgroundWork()

    const healthCall = (profiles.update as jest.Mock).mock.calls.find(
      ([, patch]) => patch && typeof patch === 'object' && 'source_health' in patch,
    )
    expect(healthCall).toBeDefined()
    const [, patch] = healthCall as [unknown, { source_health: unknown }]
    expect(patch.source_health).toBeNull()
  })
})

// Les helpers de `validate` vivent DANS son describe : deux côtés de la fusion
// avaient chacun un `CONTEXT`, un `makeProfilesRepo` et un `makeService` au
// niveau du module, avec des signatures différentes. Les garder tous les deux
// au niveau du fichier aurait fait taire l'un des deux jeux de tests.
describe('ProfileContextService.validate', () => {
  const VALIDATED_CONTEXT = {
    esnArchetype: 'boutiqueExpert',
    sellingPosture: 'expertiseRare',
  } as unknown as ProfileContext

  type Row = {
    user_id: string
    profile_context: ProfileContext | null
    profile_context_status: string
    profile_context_version?: number
  }

  /** Un faux repository minimal : seuls `findOne`/`update` sont exercés par
   *  `validate` — les autres dépendances du service (IA, gateway, revisions)
   *  n'ont pas leur mot à dire sur cette écriture. */
  function makeValidateRepo(rows: Row[]) {
    const update = jest.fn(async (where: { user_id: string }, patch: Partial<Row>) => {
      const row = rows.find(r => r.user_id === where.user_id)
      if (row) Object.assign(row, patch)
      return { affected: row ? 1 : 0 }
    })
    const findOne = jest.fn(
      async ({ where }: { where: { user_id: string } }) => rows.find(r => r.user_id === where.user_id) ?? null,
    )
    return { update, findOne } as unknown as Repository<ProfileEntity>
  }

  function makeValidateService(rows: Row[]) {
    const profiles = makeValidateRepo(rows)
    // #2075.B — `validate` ne lit ni n'écrit via l'IA, le gateway temps réel ou
    // le service de révisions : ces dépendances restent `undefined`, et un test
    // qui les appellerait par erreur planterait au lieu de mentir en silence.
    return {
      service: new ProfileContextService(
        profiles,
        undefined as never,
        undefined as never,
        undefined as never,
        // #2062.1 — `validate` rend le contexte SERVABLE, donc il lit lui aussi
        // la provenance de l'instantané. `null` = aucun instantané lisible.
        { liveSnapshotMeta: jest.fn(async () => null) } as unknown as ProfileContextRevisionService,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
      ),
      profiles,
    }
  }

  it('#2075.B — écrit profile_context_validated_at et rend status validated quand un contexte existe', async () => {
    const rows: Row[] = [{ user_id: 'u1', profile_context: VALIDATED_CONTEXT, profile_context_status: 'succeeded' }]
    const { service, profiles } = makeValidateService(rows)

    const result = await service.validate('u1')

    expect(isFailure(result)).toBe(false)
    if (result.type === 'success') {
      expect(result.output.status).toBe('validated')
      expect(result.output.profile_context).toEqual(VALIDATED_CONTEXT)
      // D9 — la réponse porte l'état de validation qu'elle vient d'écrire :
      // l'écran n'a pas besoin d'un second aller-retour pour afficher « Validé
      // le … » juste après le clic.
      expect(result.output.validatedAt).toEqual(expect.any(String))
      expect(Number.isNaN(Date.parse(result.output.validatedAt as string))).toBe(false)
    }
    expect(profiles.update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      expect.objectContaining({ profile_context_status: 'validated', profile_context_validated_at: expect.any(Date) }),
    )
  })

  /**
   * #2010.17 — la version validée survit à une régénération future (qui
   * écrase `profile_context_version` en place) : sans ce champ persisté à
   * PART, aucun moyen de retrouver quelle ancienne révision était la
   * dernière validée une fois qu'une revue démarre.
   */
  it('#2010.17 — persiste last_validated_context_version = la version LIVE au moment du clic', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: VALIDATED_CONTEXT,
        profile_context_status: 'succeeded',
        profile_context_version: 3,
      },
    ]
    const { service, profiles } = makeValidateService(rows)

    await service.validate('u1')

    expect(profiles.update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      expect.objectContaining({ last_validated_context_version: 3 }),
    )
  })

  it('#2075.B — refuse quand aucun contexte n’a jamais été généré, sans écrire', async () => {
    const rows: Row[] = [{ user_id: 'u1', profile_context: null, profile_context_status: 'not_generated' }]
    const { service, profiles } = makeValidateService(rows)

    const result = await service.validate('u1')

    expect(isFailure(result) && result.problem.code).toBe('no_profile_context')
    expect(profiles.update).not.toHaveBeenCalled()
  })

  it('#2075.B — cloisonné : n’écrit que la ligne de l’appelant, jamais un autre user_id', async () => {
    const rows: Row[] = [
      { user_id: 'u1', profile_context: VALIDATED_CONTEXT, profile_context_status: 'succeeded' },
      { user_id: 'u2', profile_context: VALIDATED_CONTEXT, profile_context_status: 'succeeded' },
    ]
    const { service, profiles } = makeValidateService(rows)

    await service.validate('u1')

    expect(profiles.update).toHaveBeenCalledTimes(1)
    expect(profiles.update).toHaveBeenCalledWith({ user_id: 'u1' }, expect.anything())
    expect(rows.find(r => r.user_id === 'u2')?.profile_context_status).toBe('succeeded')
  })

  it('#2075.B — rend un corps explicite (jamais null) même en échec', async () => {
    const rows: Row[] = [{ user_id: 'u1', profile_context: null, profile_context_status: 'not_generated' }]
    const { service } = makeValidateService(rows)

    const result = await service.validate('u1')

    expect(result).not.toBeNull()
    expect(result.type).toBe('failure')
  })
})

// D9 — décision Louis 14/09/2026 : valider le contexte commercial.
describe('ProfileContextService.getMe — validatedAt (D9)', () => {
  type Row = {
    user_id: string
    profile_context: ProfileContext | null
    profile_context_status: string
    profile_context_validated_at: Date | null
    // #2073.8 — optionnel : les fixtures écrites avant ce champ n'ont pas à
    // être réécrites une par une pour continuer de compiler.
    chosen_entry_strategy?: string | null
    // #2074.16 — idem.
    audit_move_decisions?: Record<string, { status: string; decidedAt: string }> | null
    // #2908 (#2011.4) — idem : optionnel, les fixtures écrites avant ce champ
    // n'ont pas à être réécrites une par une pour continuer de compiler.
    commercial_audit_version?: string | null
    // #2012.12 (épopée #2776) — idem : optionnel, même raison.
    source_health?: Record<string, string> | null
    // #2908 (#2010.4) — idem : optionnel, les fixtures écrites avant ce champ
    // n'ont pas à être réécrites une par une pour continuer de compiler.
    profile_context_corrections?: Record<string, { value: string; correctedAt: string }> | null
  }

  function makeGetMeService(row: Row | null, snapshotMeta: { schemaVersion: number; createdAt: string } | null = null) {
    const findOne = jest.fn(async () => row)
    const profiles = { findOne } as unknown as Repository<ProfileEntity>
    // #2062.1 — `getMe` lit la PROVENANCE de l'instantané (version de schéma +
    // date) dès qu'un contexte est stocké : sans ce double, la garde de lecture
    // n'aurait rien à interroger.
    const revisions = {
      liveSnapshotMeta: jest.fn(async () => snapshotMeta),
    } as unknown as ProfileContextRevisionService
    return {
      service: new ProfileContextService(
        profiles,
        undefined as never,
        undefined as never,
        undefined as never,
        revisions,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
      ),
    }
  }

  it('expose validatedAt en ISO quand le statut est validated', async () => {
    const { service } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'validated',
      profile_context_validated_at: new Date('2026-09-10T08:00:00.000Z'),
    })

    const snapshot = await service.getMe('u1')

    expect(snapshot.status).toBe('validated')
    expect(snapshot.validatedAt).toBe('2026-09-10T08:00:00.000Z')
  })

  it('rend validatedAt NULL quand le statut n’est plus validated — même si la colonne porte encore une ancienne date', async () => {
    // Le cas réel : `triggerGeneration` a déjà basculé le statut sur
    // 'generating'/'succeeded' sans forcément avoir nettoyé la colonne. Un
    // horodatage fantôme mentirait sur ce que l'écran doit dire.
    const { service } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: new Date('2026-09-01T00:00:00.000Z'),
    })

    const snapshot = await service.getMe('u1')

    expect(snapshot.validatedAt).toBeNull()
  })

  it('rend validatedAt NULL quand aucune ligne n’existe', async () => {
    const { service } = makeGetMeService(null)

    const snapshot = await service.getMe('u1')

    expect(snapshot.status).toBe('not_generated')
    expect(snapshot.validatedAt).toBeNull()
  })

  // #2003.21 — RECETTE : ANCIEN COMPTE SANS AUDIT. Un compte qui n'a jamais
  // déclenché de génération n'a pas de ligne `profiles` exploitable (ou une
  // ligne dont `profile_context` est resté `null`) : la doctrine « jamais de
  // donnée fictive » impose que la lecture le dise, sans deviner un contexte
  // ni fabriquer un `withheld` fantôme. Les deux formes de « rien encore
  // généré » — ligne absente et ligne présente mais vide — rendent le MÊME
  // instantané inerte.
  it('#2003.21 — un ancien compte sans audit rend un instantané EXPLICITEMENT vide, jamais une donnée devinée', async () => {
    const { service: whenRowMissing } = makeGetMeService(null)
    const snapshotWhenMissing = await whenRowMissing.getMe('u1')
    expect(snapshotWhenMissing).toEqual({
      profile_context: null,
      status: 'not_generated',
      failureReason: null,
      withheld: null,
      validatedAt: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      commercialAuditVersion: null,
      sourceHealth: null,
      corrections: {},
    })

    const { service: whenRowEmpty } = makeGetMeService({
      user_id: 'u1',
      profile_context: null,
      profile_context_status: 'not_generated',
      profile_context_validated_at: null,
    })
    const snapshotWhenEmpty = await whenRowEmpty.getMe('u1')
    expect(snapshotWhenEmpty).toEqual(snapshotWhenMissing)
  })

  // #2908 (#2011.4) — `getMe` expose l'EMPREINTE DE CONTENU stockée, colonne
  // séparée du champ calculé et du compteur, jamais recalculée à la lecture.
  it('#2908 — expose commercialAuditVersion tel que stocké, null tant qu’aucune génération ne l’a posé', async () => {
    const { service: withVersion } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
      commercial_audit_version: 'abc-123-def',
    })
    expect((await withVersion.getMe('u1')).commercialAuditVersion).toBe('abc-123-def')

    const { service: withoutVersion } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
    })
    expect((await withoutVersion.getMe('u1')).commercialAuditVersion).toBeNull()
  })

  // #2012.12 (épopée #2776) — `getMe` expose désormais `source_health`, la
  // couverture réduite du Profileur par source facultative — jusque-là
  // jetée à cette même frontière (constat des lots précédents).
  it('#2012.12 — expose sourceHealth tel que stocké, null tant qu’aucune génération ne l’a posé', async () => {
    const { service: withHealth } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
      source_health: { market_memory: 'down' },
    })
    expect((await withHealth.getMe('u1')).sourceHealth).toEqual({ market_memory: 'down' })

    const { service: withoutHealth } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
    })
    expect((await withoutHealth.getMe('u1')).sourceHealth).toBeNull()
  })

  // #2908 (#2010.4) — `getMe` applique la correction PAR-DESSUS le contenu
  // généré, colonne séparée jamais réécrite par une régénération.
  it('#2908 — expose la correction dans corrections ET l’applique sur profile_context', async () => {
    const CONTEXT_WITH_SUMMARY = {
      ...CONTEXT,
      welcomeSummary: { profileRecap: 'Généré par le modèle.' },
    } as unknown as ProfileContext
    const { service } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT_WITH_SUMMARY,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
      profile_context_corrections: {
        'welcomeSummary.profileRecap': { value: 'Corrigé par le commercial.', correctedAt: '2026-09-26T20:00:00.000Z' },
      },
    })

    const snapshot = await service.getMe('u1')

    expect(snapshot.corrections['welcomeSummary.profileRecap']?.value).toBe('Corrigé par le commercial.')
    expect(snapshot.profile_context?.welcomeSummary?.profileRecap).toBe('Corrigé par le commercial.')
  })

  it('#2908 — corrections rend {} tant qu’aucune correction n’a été posée', async () => {
    const { service } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
    })
    expect((await service.getMe('u1')).corrections).toEqual({})
  })

  // ──────────────────────────────────────────────────────────────────────
  // #2062.1 / #2069.1 — LA GARDE DE LECTURE EST-ELLE BRANCHÉE ?
  //
  // `withheldStoredContext` est juste et testée à côté ; le défaut qui revient
  // dans ce dépôt est du code juste que personne n'appelle. Ces trois tests ne
  // l'appellent pas : ils passent par `getMe`, le seul chemin que `/welcome`
  // emprunte, avec le texte MESURÉ en production le 15/09/2026.
  // ──────────────────────────────────────────────────────────────────────
  const PROD_PHRASE =
    "Le scoring évaluera la couverture stakeholders IT, la probabilité d'un besoin urgent en Data/Cloud, et l'alignement avec tes secteurs."

  function storedRow(welcomeSummary: Record<string, unknown>): Row {
    return {
      user_id: 'u1',
      profile_context: { esnArchetype: 'boutiqueExpert', welcomeSummary } as unknown as ProfileContext,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
    } as Row
  }

  it('ne sert pas la phrase de probabilité stockée, et NOMME ce qu’elle retient avec sa date', async () => {
    const { service } = makeGetMeService(
      storedRow({ scoringPersonalization: PROD_PHRASE, firstAnalysisSuggestions: [] }),
      { schemaVersion: 2, createdAt: '2026-09-02T09:30:00.000Z' },
    )

    const snapshot = await service.getMe('u1')

    expect(snapshot.profile_context?.welcomeSummary?.scoringPersonalization).toBe('')
    expect(snapshot.withheld).toEqual({
      fields: ['welcomeSummary.scoringPersonalization'],
      storedAt: '2026-09-02T09:30:00.000Z',
    })
  })

  it('ne sert pas les noms d’entreprises d’un instantané antérieur à la preuve', async () => {
    const { service } = makeGetMeService(
      storedRow({
        scoringPersonalization: "Le scoring évaluera l'urgence du besoin.",
        firstAnalysisSuggestions: [{ companyName: 'BNP Paribas', sector: 'Banque', reason: 'Nom connu.' }],
      }),
      { schemaVersion: 1, createdAt: '2026-08-20T09:30:00.000Z' },
    )

    const snapshot = await service.getMe('u1')

    expect(snapshot.profile_context?.welcomeSummary?.firstAnalysisSuggestions).toEqual([])
    expect(snapshot.withheld?.fields).toEqual(['welcomeSummary.firstAnalysisSuggestions'])
    expect(snapshot.withheld?.storedAt).toBe('2026-08-20T09:30:00.000Z')
  })

  it('TÉMOIN : un contexte conforme traverse `getMe` intact et ne nomme rien', async () => {
    const summary = {
      scoringPersonalization: "Le scoring évaluera l'urgence du besoin en Data et Cloud.",
      firstAnalysisSuggestions: [{ companyName: 'Société Générale', sector: 'Banque', reason: 'Pile cloud.' }],
    }
    const { service } = makeGetMeService(storedRow(summary), {
      schemaVersion: 2,
      createdAt: '2026-09-15T09:30:00.000Z',
    })

    const snapshot = await service.getMe('u1')

    expect(snapshot.profile_context?.welcomeSummary).toEqual(summary)
    expect(snapshot.withheld).toBeNull()
  })

  // #2073.8 — LA STRATÉGIE CHOISIE, distincte du champ CALCULÉ. `getMe` la lit
  // sur la MÊME ligne, une colonne séparée de `profile_context`.
  it('#2073.8 — expose chosenEntryStrategy quand la colonne porte un choix', async () => {
    const { service } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
      chosen_entry_strategy: 'multiThread',
    })

    const snapshot = await service.getMe('u1')

    expect(snapshot.chosenEntryStrategy).toBe('multiThread')
  })

  it('#2073.8 — rend chosenEntryStrategy NULL quand rien n’a été choisi, jamais une valeur devinée', async () => {
    const { service } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
      chosen_entry_strategy: null,
    })

    const snapshot = await service.getMe('u1')

    expect(snapshot.chosenEntryStrategy).toBeNull()
  })

  // #2074.16 — LES DÉCISIONS HUMAINES sur les mouvements d'audit proposés.
  // `getMe` les lit sur la MÊME ligne, une colonne séparée de `profile_context`.
  it('#2074.16 — expose auditMoveDecisions quand la colonne porte des décisions', async () => {
    const { service } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
      audit_move_decisions: { no_contact_reached: { status: 'valide', decidedAt: '2026-09-22T20:00:00.000Z' } },
    })

    const snapshot = await service.getMe('u1')

    expect(snapshot.auditMoveDecisions).toEqual({
      no_contact_reached: { status: 'valide', decidedAt: '2026-09-22T20:00:00.000Z' },
    })
  })

  it('#2074.16 — rend auditMoveDecisions VIDE quand la colonne est NULL, jamais une décision devinée', async () => {
    const { service } = makeGetMeService({
      user_id: 'u1',
      profile_context: CONTEXT,
      profile_context_status: 'succeeded',
      profile_context_validated_at: null,
      audit_move_decisions: null,
    })

    const snapshot = await service.getMe('u1')

    expect(snapshot.auditMoveDecisions).toEqual({})
  })
})

describe('ProfileContextService.chooseEntryStrategy (#2073.8)', () => {
  type Row = {
    user_id: string
    profile_context: ProfileContext | null
    profile_context_status: string
    profile_context_validated_at: Date | null
    chosen_entry_strategy: string | null
  }

  function makeChooseRepo(rows: Row[]) {
    const update = jest.fn(async (where: { user_id: string }, patch: Partial<Row>) => {
      const row = rows.find(r => r.user_id === where.user_id)
      if (row) Object.assign(row, patch)
      return { affected: row ? 1 : 0 }
    })
    const findOne = jest.fn(
      async ({ where }: { where: { user_id: string } }) => rows.find(r => r.user_id === where.user_id) ?? null,
    )
    return { update, findOne } as unknown as Repository<ProfileEntity>
  }

  function makeChooseService(rows: Row[]) {
    const profiles = makeChooseRepo(rows)
    return {
      service: new ProfileContextService(
        profiles,
        undefined as never,
        undefined as never,
        undefined as never,
        { liveSnapshotMeta: jest.fn(async () => null) } as unknown as ProfileContextRevisionService,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
      ),
      profiles,
    }
  }

  it('persiste le choix dans SA PROPRE colonne, jamais dans profile_context', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: CONTEXT,
        profile_context_status: 'succeeded',
        profile_context_validated_at: null,
        chosen_entry_strategy: null,
      },
    ]
    const { service, profiles } = makeChooseService(rows)

    const snapshot = await service.chooseEntryStrategy('u1', 'multiThread')

    expect(profiles.update).toHaveBeenCalledWith({ user_id: 'u1' }, { chosen_entry_strategy: 'multiThread' })
    expect(snapshot.chosenEntryStrategy).toBe('multiThread')
    // Une correction humaine gagne toujours, mais elle vit dans SA colonne :
    // le champ CALCULÉ par le profileur n'est pas touché par ce geste.
    expect(rows[0]?.profile_context).toEqual(CONTEXT)
  })

  it('cloisonné : n’écrit que la ligne de l’appelant, jamais un autre user_id', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        chosen_entry_strategy: null,
      },
      {
        user_id: 'u2',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        chosen_entry_strategy: null,
      },
    ]
    const { service, profiles } = makeChooseService(rows)

    await service.chooseEntryStrategy('u1', 'topDown')

    expect(profiles.update).toHaveBeenCalledTimes(1)
    expect(profiles.update).toHaveBeenCalledWith({ user_id: 'u1' }, expect.anything())
    expect(rows.find(r => r.user_id === 'u2')?.chosen_entry_strategy).toBeNull()
  })

  it('un second choix REMPLACE le premier — le dernier clic de l’utilisateur gagne', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        chosen_entry_strategy: 'bottomUp',
      },
    ]
    const { service } = makeChooseService(rows)

    const snapshot = await service.chooseEntryStrategy('u1', 'referral')

    expect(snapshot.chosenEntryStrategy).toBe('referral')
  })
})

// #2074.16 — « L'utilisateur VALIDE ou MODIFIE avant création dans Actions » :
// même geste auto-approuvé que `chooseEntryStrategy` (un clic sur SA PROPRE
// ligne), mais une colonne JSONB keyée par `ruleId` plutôt qu'un scalaire —
// une décision REMPLACE la sienne, les autres décisions ne bougent pas.
describe('ProfileContextService.recordAuditMoveDecision (#2074.16)', () => {
  type Row = {
    user_id: string
    profile_context: ProfileContext | null
    profile_context_status: string
    profile_context_validated_at: Date | null
    audit_move_decisions: Record<string, { status: string; decidedAt: string }> | null
  }

  function makeRecordRepo(rows: Row[]) {
    const findOne = jest.fn(
      async ({ where }: { where: { user_id: string } }) => rows.find(r => r.user_id === where.user_id) ?? null,
    )
    const update = jest.fn(async (where: { user_id: string }, patch: Partial<Row>) => {
      const row = rows.find(r => r.user_id === where.user_id)
      if (row) Object.assign(row, patch)
      return { affected: row ? 1 : 0 }
    })
    return { findOne, update } as unknown as Repository<ProfileEntity>
  }

  function makeRecordService(rows: Row[]) {
    const profiles = makeRecordRepo(rows)
    return {
      service: new ProfileContextService(
        profiles,
        undefined as never,
        undefined as never,
        undefined as never,
        { liveSnapshotMeta: jest.fn(async () => null) } as unknown as ProfileContextRevisionService,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
      ),
      profiles,
    }
  }

  it('persiste la décision, clé sur ruleId, dans SA PROPRE colonne', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: CONTEXT,
        profile_context_status: 'succeeded',
        profile_context_validated_at: null,
        audit_move_decisions: null,
      },
    ]
    const { service } = makeRecordService(rows)

    const snapshot = await service.recordAuditMoveDecision('u1', 'no_contact_reached', 'valide')

    expect(snapshot.auditMoveDecisions.no_contact_reached?.status).toBe('valide')
    // Une correction humaine gagne toujours, mais vit dans SA colonne : le
    // champ CALCULÉ par le profileur n'est pas touché par ce geste.
    expect(rows[0]?.profile_context).toEqual(CONTEXT)
  })

  it('une décision REMPLACE la sienne SEULE, les autres ruleId ne bougent pas', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        audit_move_decisions: {
          no_contact_reached: { status: 'valide', decidedAt: '2026-09-20T08:00:00.000Z' },
          stalled_after_meeting: { status: 'ecarte', decidedAt: '2026-09-20T08:00:00.000Z' },
        },
      },
    ]
    const { service } = makeRecordService(rows)

    const snapshot = await service.recordAuditMoveDecision('u1', 'no_contact_reached', 'modifie')

    expect(snapshot.auditMoveDecisions.no_contact_reached?.status).toBe('modifie')
    expect(snapshot.auditMoveDecisions.stalled_after_meeting).toEqual({
      status: 'ecarte',
      decidedAt: '2026-09-20T08:00:00.000Z',
    })
  })

  it('cloisonné : n’écrit que la ligne de l’appelant, jamais un autre user_id', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        audit_move_decisions: null,
      },
      {
        user_id: 'u2',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        audit_move_decisions: null,
      },
    ]
    const { service, profiles } = makeRecordService(rows)

    await service.recordAuditMoveDecision('u1', 'no_contact_reached', 'valide')

    expect(profiles.update).toHaveBeenCalledTimes(1)
    expect(profiles.update).toHaveBeenCalledWith({ user_id: 'u1' }, expect.anything())
    expect(rows.find(r => r.user_id === 'u2')?.audit_move_decisions).toBeNull()
  })
})

// #2908 (#2010.4) — « Corriger ce champ » : même geste auto-approuvé que
// `recordAuditMoveDecision` (un clic sur SA PROPRE ligne), colonne JSONB
// keyée par le chemin du champ — une correction REMPLACE la sienne, les
// autres champs corrigés ne bougent pas, et `profile_context` lui-même
// n'est jamais touché par ce geste.
describe('ProfileContextService.correctField (#2908 / #2010.4)', () => {
  type Row = {
    user_id: string
    profile_context: ProfileContext | null
    profile_context_status: string
    profile_context_validated_at: Date | null
    profile_context_corrections: Record<string, { value: string; correctedAt: string }> | null
  }

  function makeCorrectionRepo(rows: Row[]) {
    const findOne = jest.fn(
      async ({ where }: { where: { user_id: string } }) => rows.find(r => r.user_id === where.user_id) ?? null,
    )
    const update = jest.fn(async (where: { user_id: string }, patch: Partial<Row>) => {
      const row = rows.find(r => r.user_id === where.user_id)
      if (row) Object.assign(row, patch)
      return { affected: row ? 1 : 0 }
    })
    return { findOne, update } as unknown as Repository<ProfileEntity>
  }

  function makeCorrectionService(rows: Row[]) {
    const profiles = makeCorrectionRepo(rows)
    return {
      service: new ProfileContextService(
        profiles,
        undefined as never,
        undefined as never,
        undefined as never,
        { liveSnapshotMeta: jest.fn(async () => null) } as unknown as ProfileContextRevisionService,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
      ),
      profiles,
    }
  }

  it('persiste la correction, clé sur le champ, dans SA PROPRE colonne', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: { ...CONTEXT, welcomeSummary: { profileRecap: 'Généré par le modèle.' } } as ProfileContext,
        profile_context_status: 'succeeded',
        profile_context_validated_at: null,
        profile_context_corrections: null,
      },
    ]
    const { service } = makeCorrectionService(rows)

    const snapshot = await service.correctField('u1', 'welcomeSummary.profileRecap', 'Corrigé par le commercial.')

    expect(snapshot.corrections['welcomeSummary.profileRecap']?.value).toBe('Corrigé par le commercial.')
    // Une correction humaine gagne toujours, mais vit dans SA colonne : le
    // contenu généré n'est pas réécrit par ce geste.
    expect(rows[0]?.profile_context?.welcomeSummary?.profileRecap).toBe('Généré par le modèle.')
    // La LECTURE, elle, applique la correction par-dessus.
    expect(snapshot.profile_context?.welcomeSummary?.profileRecap).toBe('Corrigé par le commercial.')
  })

  it('une correction REMPLACE la sienne SEULE — un second appel ne perd rien d’autre', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        profile_context_corrections: {
          'welcomeSummary.profileRecap': { value: 'Première correction', correctedAt: '2026-09-20T08:00:00.000Z' },
        },
      },
    ]
    const { service } = makeCorrectionService(rows)

    const snapshot = await service.correctField('u1', 'welcomeSummary.profileRecap', 'Seconde correction')

    expect(snapshot.corrections['welcomeSummary.profileRecap']?.value).toBe('Seconde correction')
  })

  it('cloisonné : n’écrit que la ligne de l’appelant, jamais un autre user_id', async () => {
    const rows: Row[] = [
      {
        user_id: 'u1',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        profile_context_corrections: null,
      },
      {
        user_id: 'u2',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        profile_context_corrections: null,
      },
    ]
    const { service, profiles } = makeCorrectionService(rows)

    await service.correctField('u1', 'welcomeSummary.profileRecap', 'Corrigé')

    expect(profiles.update).toHaveBeenCalledTimes(1)
    expect(profiles.update).toHaveBeenCalledWith({ user_id: 'u1' }, expect.anything())
    expect(rows.find(r => r.user_id === 'u2')?.profile_context_corrections).toBeNull()
  })
})

describe('ProfileContextService.regenerateSection (#2908 / #2010.16 / #2011.10)', () => {
  type Row = {
    user_id: string
    first_name?: string
    profile_context: ProfileContext | null
    commercial_audit_version?: string | null
    source_health?: unknown
  }

  function makeSectionRepo(rows: Row[]) {
    const findOne = jest.fn(
      async ({ where }: { where: { user_id: string } }) => rows.find(r => r.user_id === where.user_id) ?? null,
    )
    const update = jest.fn(async (where: { user_id: string }, patch: Partial<Row>) => {
      const row = rows.find(r => r.user_id === where.user_id)
      if (row) Object.assign(row, patch)
      return { affected: row ? 1 : 0 }
    })
    return { findOne, update } as unknown as Repository<ProfileEntity>
  }

  function makeSectionService(rows: Row[], iaClient: IaClient) {
    const profiles = makeSectionRepo(rows)
    // `recordNewVersion` is where the REAL service writes `profile_context`
    // back onto the row (snapshotting a revision in the same breath) — the
    // mock mirrors that one side effect, nothing else about revisions.
    const revisions = {
      recordNewVersion: jest.fn(async (userId: string, context: ProfileContext) => {
        const row = rows.find(r => r.user_id === userId)
        if (row) row.profile_context = context
      }),
      liveSnapshotMeta: jest.fn(async () => null),
    }
    const service = new ProfileContextService(
      profiles,
      iaClient,
      { buildCallback: jest.fn() } as unknown as ProfilerProgressService,
      {
        emitDone: jest.fn(async () => undefined),
        emitError: jest.fn(async () => undefined),
      } as unknown as ProfilerGateway,
      revisions as unknown as ProfileContextRevisionService,
      makeConnectedTools(),
      makeWorkspaceReader(),
      makeAnswerMetaReader(),
      makeBusinessUnitsReader(),
      makeSkippedQuestionsReader(),
    )
    return { service, profiles, revisions }
  }

  const STORED = {
    ...CONTEXT,
    welcomeSummary: { profileRecap: 'Ancien recap', firstAnalysisSuggestions: [] },
    coachingInsights: { mainWeakness: 'Ancienne fragilité', keyAdvice: 'Ancien conseil' },
  } as unknown as ProfileContext

  const REGENERATED = {
    ...CONTEXT,
    welcomeSummary: { profileRecap: 'Nouveau recap', firstAnalysisSuggestions: [] },
    coachingInsights: { mainWeakness: 'Nouvelle fragilité', keyAdvice: 'Nouveau conseil' },
  } as unknown as ProfileContext

  it('ne retient que la section demandée — le reste du contenu persisté ne bouge pas', async () => {
    const rows: Row[] = [{ user_id: 'u1', profile_context: STORED }]
    const iaClient = makeIaClient(async () => ({ status: 'success', data: REGENERATED }) as unknown as ProfilerEnvelope)
    const { service } = makeSectionService(rows, iaClient)

    const snapshot = await service.regenerateSection('u1', ANSWERS_A, 'coachingInsights')

    expect(rows[0]?.profile_context?.coachingInsights).toEqual(REGENERATED.coachingInsights)
    // La section NON demandée reste celle stockée, au caractère près.
    expect(rows[0]?.profile_context?.welcomeSummary).toEqual(STORED.welcomeSummary)
    expect(snapshot.profile_context?.coachingInsights).toEqual(REGENERATED.coachingInsights)
  })

  it('pose une empreinte de contenu (#2011.4) sur le résultat FUSIONNÉ, pas sur la génération brute', async () => {
    const rows: Row[] = [{ user_id: 'u1', profile_context: STORED }]
    const iaClient = makeIaClient(async () => ({ status: 'success', data: REGENERATED }) as unknown as ProfilerEnvelope)
    const { service, profiles } = makeSectionService(rows, iaClient)

    await service.regenerateSection('u1', ANSWERS_A, 'welcomeSummary')

    expect(profiles.update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      expect.objectContaining({ commercial_audit_version: expect.any(String) }),
    )
  })

  it('rien à fusionner (aucun profil encore généré) : la section régénérée fait foi en entier', async () => {
    const rows: Row[] = [{ user_id: 'u1', profile_context: null }]
    const iaClient = makeIaClient(async () => ({ status: 'success', data: REGENERATED }) as unknown as ProfilerEnvelope)
    const { service } = makeSectionService(rows, iaClient)

    const snapshot = await service.regenerateSection('u1', ANSWERS_A, 'welcomeSummary')

    expect(snapshot.profile_context).toEqual(REGENERATED)
  })

  it('un échec du modèle ne touche pas le contenu déjà persisté', async () => {
    const rows: Row[] = [{ user_id: 'u1', profile_context: STORED }]
    const iaClient = makeIaClient(async () => failureEnvelope())
    const { service } = makeSectionService(rows, iaClient)

    const snapshot = await service.regenerateSection('u1', ANSWERS_A, 'coachingInsights')

    expect(rows[0]?.profile_context).toEqual(STORED)
    expect(snapshot.profile_context).toEqual(STORED)
  })
})

// #2074.16 — la décision crée l'action dans Actions (une TÂCHE, voir la
// migration 1796900103000) : « Valider »/« Modifier » la posent, « Écarter »
// jamais ; la clé d'idempotence est `<ruleId>:<cible>`.
describe('ProfileContextService.recordAuditMoveDecision → tâche (#2074.16)', () => {
  function makeService(writer: { createOnce: jest.Mock } | undefined) {
    const rows = [
      {
        user_id: 'u1',
        profile_context: null,
        profile_context_status: 'not_generated',
        profile_context_validated_at: null,
        audit_move_decisions: null as Record<string, { status: string; decidedAt: string }> | null,
      },
    ]
    const profiles = {
      findOne: jest.fn(
        async ({ where }: { where: { user_id: string } }) => rows.find(r => r.user_id === where.user_id) ?? null,
      ),
      update: jest.fn(async () => ({ affected: 1 })),
    } as unknown as Repository<ProfileEntity>
    return new ProfileContextService(
      profiles,
      undefined as never,
      undefined as never,
      undefined as never,
      { liveSnapshotMeta: jest.fn(async () => null) } as unknown as ProfileContextRevisionService,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined,
      writer as never,
    )
  }
  const MOVE = { subject: 'Joindre le DSI', reason: 'Aucun chemin d’accès', expectedResult: 'Un premier échange' }

  it('valider → la tâche est demandée, à l’appelant, clé ruleId + cible', async () => {
    const writer = { createOnce: jest.fn(async () => ({ created: true })) }
    await makeService(writer).recordAuditMoveDecision('u1', 'keyAccountsWithoutAccessPath', 'valide', MOVE)

    expect(writer.createOnce).toHaveBeenCalledTimes(1)
    expect(writer.createOnce).toHaveBeenCalledWith('u1', {
      sourceKey: 'keyAccountsWithoutAccessPath:contact',
      title: MOVE.subject,
      objective: MOVE.reason,
      expectedResult: MOVE.expectedResult,
    })
  })

  it('une règle sans cible canonique porte la clé `:aucune`, jamais une cible devinée', async () => {
    const writer = { createOnce: jest.fn(async () => ({ created: true })) }
    await makeService(writer).recordAuditMoveDecision('u1', 'offerWithoutProof', 'modifie', MOVE)
    expect(writer.createOnce).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ sourceKey: 'offerWithoutProof:aucune' }),
    )
  })

  it('écarter → aucune tâche', async () => {
    const writer = { createOnce: jest.fn(async () => ({ created: true })) }
    await makeService(writer).recordAuditMoveDecision('u1', 'offerWithoutProof', 'ecarte', MOVE)
    expect(writer.createOnce).not.toHaveBeenCalled()
  })

  it('sans objet transmis → aucune tâche : un titre ne s’invente pas', async () => {
    const writer = { createOnce: jest.fn(async () => ({ created: true })) }
    await makeService(writer).recordAuditMoveDecision('u1', 'offerWithoutProof', 'valide')
    expect(writer.createOnce).not.toHaveBeenCalled()
  })

  it('une écriture ratée de la tâche ne perd PAS la décision (re-valider la rejoue, idempotente)', async () => {
    const writer = { createOnce: jest.fn(async () => Promise.reject(new Error('db down'))) }
    const snapshot = await makeService(writer).recordAuditMoveDecision('u1', 'offerWithoutProof', 'valide', MOVE)
    expect(snapshot).toBeDefined()
  })
})
