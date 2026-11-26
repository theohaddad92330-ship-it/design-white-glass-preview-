/**
 * #2704 — « à deux dans un espace, l'analyse simultanée ne sort pas ».
 *
 * Bedros lance l'analyse d'une société, Adel (même espace, deuxième siège payé)
 * adopte le compte en vol — `start()` le lui rend déjà correctement. Puis Adel
 * recharge son onglet : `GET /analysis/status/:accountId` lisait
 * `WHERE user_id = <appelant>` (`AccountsService.findOne`) et rendait 404. Son
 * écran restait sur « Analyse en cours », 0 %, sans message, indéfiniment.
 *
 * Ce fichier tient les DEUX moitiés de la règle, et la seconde n'est pas
 * facultative : élargir de « mon utilisateur » à « mon ESPACE » ne doit RIEN
 * ouvrir de plus. Un membre d'un autre espace, ou d'une autre unité, reçoit
 * exactement ce qu'il recevait avant — introuvable.
 */
import { getQueueToken } from '@nestjs/bullmq'
import { Test } from '@nestjs/testing'
import { failure, isFailure, isSuccess, success } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { CreditsService } from '../credits/credits.service'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { AnalysisCancellationService } from './analysis-cancellation.service'
import { AnalysisRunsService } from './analysis-runs.service'
import { AnalysisPersistenceService } from './analysis.persistence'
import { AnalysisService } from './analysis.service'

/** L'espace payé d'Apricot Labs : deux sièges, deux profils. */
const ESPACE = 'ws-apricot'
/** Le lanceur — le compte porte SON `user_id`. */
const BEDROS = 'u-bedros'
/** Le coéquipier : même espace, même unité, il n'a rien lancé. */
const ADEL = 'u-adel'
/** Un commercial d'une AUTRE ESN. Il ne doit jamais rien recevoir. */
const CONCURRENT = 'u-concurrent'
/** Même espace, mais cloisonné sur une autre unité (revue sécurité 15/09). */
const AUTRE_UNITE = 'u-autre-agence'

const COMPTE = {
  id: 'acc-1',
  user_id: BEDROS,
  workspace_id: ESPACE,
  business_unit_id: 'bu-1',
  company_name: 'Orange',
  status: 'analyzing',
  user_context: null,
  // Écrit à l'instant : ce run est VIVANT, aucune réparation à la lecture.
  updated_at: new Date(),
} as unknown as AccountEntity

/** Le jobId du run réel — construit sur le LANCEUR, jamais sur l'appelant. */
const JOB_DU_LANCEUR = `analysis-${BEDROS}-orange`

/**
 * #2704.8 — un run à PÉRIMÈTRE VERROUILLÉ (deux sociétés homonymes
 * désambiguïsées par SIREN au lancement, `start()` suffixe le jobId de ce
 * SIREN). Le compte porte ce même SIREN une fois persisté.
 */
const COMPTE_VERROUILLE = {
  ...COMPTE,
  id: 'acc-verrouille',
  siren: '552120222',
} as unknown as AccountEntity
const JOB_VERROUILLE = `analysis-${BEDROS}-orange-siren-552120222`

type ScopeArg = { businessUnitIds: readonly string[]; includeUnassigned: true } | null

/** Le périmètre tel que le contrôleur le résout : espace actif + unités. */
function perimetre(userId: string): { workspaceId: string; businessUnitScope: ScopeArg } {
  if (userId === CONCURRENT) return { workspaceId: 'ws-autre-esn', businessUnitScope: null }
  if (userId === AUTRE_UNITE) {
    return { workspaceId: ESPACE, businessUnitScope: { businessUnitIds: ['bu-2'], includeUnassigned: true } }
  }
  return { workspaceId: ESPACE, businessUnitScope: null }
}

/**
 * Les deux lectures de compte que le dépôt connaît, avec leurs bornes réelles :
 * `findOne` filtre sur `user_id`, `findOneForWorkspace` sur `workspace_id` (+
 * l'unité quand la clause est posée). Aucun raccourci ici — c'est exactement ce
 * que fait le SQL des deux méthodes.
 */
/** Les comptes connus du dépôt mocké, résolus par id. */
const COMPTES: Record<string, AccountEntity> = {
  [COMPTE.id]: COMPTE,
  [COMPTE_VERROUILLE.id]: COMPTE_VERROUILLE,
}

function accountsServiceMock() {
  return {
    findOne: jest.fn(async (id: string, userId: string) => {
      const compte = COMPTES[id]
      return compte && userId === BEDROS
        ? success(compte)
        : failure({ code: 'not_found' as const, message: `Account ${id} not found` })
    }),
    findOneForWorkspace: jest.fn(async (id: string, workspaceId: string, scope: ScopeArg = null) => {
      const compte = COMPTES[id]
      const dansLEspace = Boolean(compte) && workspaceId === ESPACE
      const dansLUnite = !scope || scope.businessUnitIds.includes('bu-1')
      return dansLEspace && dansLUnite
        ? success(compte)
        : failure({ code: 'not_found' as const, message: `Account ${id} not found` })
    }),
    markAnalyzing: jest.fn().mockResolvedValue(undefined),
    markCancelled: jest.fn().mockResolvedValue(undefined),
    markInterrupted: jest.fn().mockResolvedValue(false),
  }
}

function runsServiceMock() {
  return {
    recordStart: jest.fn().mockResolvedValue(null),
    completeLatest: jest.fn().mockResolvedValue(undefined),
    listForAccount: jest.fn().mockResolvedValue([]),
    recordSellerContext: jest.fn().mockResolvedValue(undefined),
    recordProfileProvenance: jest.fn().mockResolvedValue(undefined),
    getSellerContext: jest.fn().mockResolvedValue(null),
    latestStartedAt: jest.fn().mockResolvedValue(new Date(Date.now() - 60 * 60 * 1000)),
  }
}

async function buildService() {
  const accountsService = accountsServiceMock()
  const cancellation = { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn().mockReturnValue(true) }
  const job = { getState: jest.fn().mockResolvedValue('active'), remove: jest.fn().mockResolvedValue(undefined) }
  const add = jest.fn().mockResolvedValue({ id: JOB_DU_LANCEUR })
  const credits = {
    consumeAnalysisSlot: jest.fn().mockResolvedValue({ ok: true, used: 1, limit: 3 }),
    refundAnalysisSlot: jest.fn().mockResolvedValue(undefined),
    attachAnalysisDebit: jest.fn().mockResolvedValue(undefined),
    hasOutstandingAnalysisDebit: jest.fn().mockResolvedValue(true),
  }
  const contacts = { findByAccount: jest.fn().mockResolvedValue([]) }

  const moduleRef = await Test.createTestingModule({
    providers: [
      AnalysisService,
      { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(job), add } },
      { provide: AccountsService, useValue: accountsService },
      { provide: ContactsService, useValue: contacts },
      { provide: AnalysisCancellationService, useValue: cancellation },
      {
        provide: EsnProfileReader,
        useValue: {
          getAnswers: jest.fn().mockResolvedValue(null),
          resolveProfileData: jest.fn().mockResolvedValue({}),
        },
      },
      { provide: CreditsService, useValue: credits },
      { provide: AnalysisRunsService, useValue: runsServiceMock() },
      {
        provide: AnalysisPersistenceService,
        useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
      },
    ],
  }).compile()

  return { service: moduleRef.get(AnalysisService), accountsService, cancellation, credits, contacts, add, job }
}

describe("#2704 — deux membres d'un même espace, une seule analyse", () => {
  describe('getStatus', () => {
    it("rend le statut au coéquipier qui n'a pas lancé le run (même espace)", async () => {
      const { service } = await buildService()

      const statut = await service.getStatus(COMPTE.id, ADEL, perimetre(ADEL))

      expect(isSuccess(statut)).toBe(true)
      if (isSuccess(statut)) {
        expect(statut.output.state).toBe('active')
        // ⚠️ Le cœur du défaut : reconstruit avec l'appelant, ce jobId ne
        // désigne AUCUN job — le statut d'Adel restait « pas de run ».
        expect(statut.output.jobId).toBe(JOB_DU_LANCEUR)
      }
    })

    it('lit les contacts du dossier au nom du LANCEUR, pas de celui qui regarde', async () => {
      const { service, contacts } = await buildService()

      await service.getStatus(COMPTE.id, ADEL, perimetre(ADEL))

      expect(contacts.findByAccount).toHaveBeenCalledWith(COMPTE.id, BEDROS)
    })

    it("refuse un membre d'un AUTRE espace — introuvable, comme avant", async () => {
      const { service } = await buildService()

      const statut = await service.getStatus(COMPTE.id, CONCURRENT, perimetre(CONCURRENT))

      expect(isFailure(statut)).toBe(true)
      if (isFailure(statut)) expect(statut.problem.code).toBe('not_found')
    })

    it('refuse un membre du même espace cloisonné sur une AUTRE unité', async () => {
      const { service } = await buildService()

      const statut = await service.getStatus(COMPTE.id, AUTRE_UNITE, perimetre(AUTRE_UNITE))

      expect(isFailure(statut)).toBe(true)
    })

    it('sans périmètre (appel interne, specs), la lecture reste celle du propriétaire', async () => {
      const { service } = await buildService()

      expect(isSuccess(await service.getStatus(COMPTE.id, BEDROS))).toBe(true)
      expect(isFailure(await service.getStatus(COMPTE.id, ADEL))).toBe(true)
    })
  })

  describe('resume', () => {
    it('reprend le run du lanceur : même jobId, même propriétaire dans la charge', async () => {
      const { service, accountsService, add } = await buildService()
      // Aucun job en vol : la reprise doit ré-enfiler.
      const queue = (service as unknown as { analysisQueue: { getJob: jest.Mock } }).analysisQueue
      queue.getJob.mockResolvedValue(undefined)

      const res = await service.resume(COMPTE.id, ADEL, perimetre(ADEL))

      expect(isSuccess(res)).toBe(true)
      if (isSuccess(res)) expect(res.output.jobId).toBe(JOB_DU_LANCEUR)
      // `markAnalyzing` filtre sur `user_id` : passé l'appelant, il n'écrit
      // RIEN et la bannière d'erreur ne disparaît jamais de l'écran.
      expect(accountsService.markAnalyzing).toHaveBeenCalledWith(COMPTE.id, BEDROS)
      expect(add.mock.calls[0]?.[1]).toMatchObject({ accountId: COMPTE.id, userId: BEDROS })
    })

    it("refuse la reprise à un membre d'un autre espace", async () => {
      const { service, add } = await buildService()

      const res = await service.resume(COMPTE.id, CONCURRENT, perimetre(CONCURRENT))

      expect(isFailure(res)).toBe(true)
      expect(add).not.toHaveBeenCalled()
    })
  })

  describe('cancelByUser', () => {
    it("annule le run du lanceur quand c'est le coéquipier qui clique", async () => {
      const { service, cancellation, accountsService, credits } = await buildService()

      const res = await service.cancelByUser(COMPTE.id, ADEL, perimetre(ADEL))

      expect(isSuccess(res)).toBe(true)
      expect(cancellation.cancel).toHaveBeenCalledWith(JOB_DU_LANCEUR, 'user_cancelled')
      expect(accountsService.markCancelled).toHaveBeenCalledWith(COMPTE.id, BEDROS)
      // Le crédit revient à qui a été débité — le lanceur —, jamais à qui annule.
      expect(credits.refundAnalysisSlot).toHaveBeenCalledWith(BEDROS, {
        reason: 'annulation: Orange',
        accountId: COMPTE.id,
        requireLedgerDebit: true,
      })
    })

    it("n'annule rien pour un membre d'un autre espace", async () => {
      const { service, cancellation, accountsService } = await buildService()

      const res = await service.cancelByUser(COMPTE.id, CONCURRENT, perimetre(CONCURRENT))

      expect(isFailure(res)).toBe(true)
      expect(cancellation.cancel).not.toHaveBeenCalled()
      expect(accountsService.markCancelled).not.toHaveBeenCalled()
    })
  })

  /**
   * #2704.8 — un run à PÉRIMÈTRE VERROUILLÉ (deux sociétés homonymes
   * désambiguïsées par SIREN, comme le distingue déjà `start()` en construisant
   * `buildJobId(userId, company, dto.siren)`) devait déjà aujourd'hui un jobId
   * reconstruit SANS ce SIREN au statut/à la reprise/à l'annulation — ces trois
   * chemins visaient un jobId qui ne désignait AUCUN job. Même patron que
   * `cancelByAdmin` (seul chemin déjà correct avant ce lot, `account.siren`).
   */
  describe('#2704.8 — le SIREN accompagne le jobId reconstruit', () => {
    it('getStatus reconstruit le jobId AVEC le SIREN du compte verrouillé', async () => {
      const { service } = await buildService()

      const statut = await service.getStatus(COMPTE_VERROUILLE.id, BEDROS, perimetre(BEDROS))

      expect(isSuccess(statut)).toBe(true)
      if (isSuccess(statut)) expect(statut.output.jobId).toBe(JOB_VERROUILLE)
    })

    it('resume enfile le job AVEC le SIREN du compte verrouillé', async () => {
      const { service, add } = await buildService()
      const queue = (service as unknown as { analysisQueue: { getJob: jest.Mock } }).analysisQueue
      queue.getJob.mockResolvedValue(undefined)

      const res = await service.resume(COMPTE_VERROUILLE.id, BEDROS, perimetre(BEDROS))

      expect(isSuccess(res)).toBe(true)
      expect(add.mock.calls[0]?.[2]).toMatchObject({ jobId: JOB_VERROUILLE })
    })

    it('cancelByUser annule le job AVEC le SIREN du compte verrouillé', async () => {
      const { service, cancellation } = await buildService()

      const res = await service.cancelByUser(COMPTE_VERROUILLE.id, BEDROS, perimetre(BEDROS))

      expect(isSuccess(res)).toBe(true)
      expect(cancellation.cancel).toHaveBeenCalledWith(JOB_VERROUILLE, 'user_cancelled')
    })
  })
})

/**
 * #2704.8 — le SIREN manque au jobId reconstruit. `start()` suffixe le jobId
 * avec le SIREN pour un run à périmètre verrouillé (deux sociétés homonymes,
 * cf. #2704.7) ; `getStatus`/`resume`/`cancelByUser` le reconstruisaient SANS
 * lui — un run à périmètre verrouillé avait donc déjà un statut et une
 * annulation qui visaient un jobId que la file n'a jamais eu.
 */
const COMPTE_SIREN = {
  ...COMPTE,
  id: 'acc-2',
  company_name: 'Société Générale',
  siren: '552120222',
} as unknown as AccountEntity

const JOB_DU_LANCEUR_SIREN = `analysis-${BEDROS}-societe-generale-siren-552120222`

function accountsServiceMockAvecSiren() {
  return {
    findOne: jest.fn(async (id: string, userId: string) =>
      id === COMPTE_SIREN.id && userId === BEDROS
        ? success(COMPTE_SIREN)
        : failure({ code: 'not_found' as const, message: `Account ${id} not found` }),
    ),
    findOneForWorkspace: jest.fn(async (id: string, workspaceId: string) =>
      id === COMPTE_SIREN.id && workspaceId === ESPACE
        ? success(COMPTE_SIREN)
        : failure({ code: 'not_found' as const, message: `Account ${id} not found` }),
    ),
    markAnalyzing: jest.fn().mockResolvedValue(undefined),
    markCancelled: jest.fn().mockResolvedValue(undefined),
    markInterrupted: jest.fn().mockResolvedValue(false),
  }
}

async function buildServiceAvecSiren() {
  const accountsService = accountsServiceMockAvecSiren()
  const cancellation = { register: jest.fn(), unregister: jest.fn(), cancel: jest.fn().mockReturnValue(true) }
  const job = { getState: jest.fn().mockResolvedValue('active'), remove: jest.fn().mockResolvedValue(undefined) }
  const add = jest.fn().mockResolvedValue({ id: JOB_DU_LANCEUR_SIREN })
  const credits = {
    consumeAnalysisSlot: jest.fn().mockResolvedValue({ ok: true, used: 1, limit: 3 }),
    refundAnalysisSlot: jest.fn().mockResolvedValue(undefined),
    attachAnalysisDebit: jest.fn().mockResolvedValue(undefined),
    hasOutstandingAnalysisDebit: jest.fn().mockResolvedValue(true),
  }
  const contacts = { findByAccount: jest.fn().mockResolvedValue([]) }

  const moduleRef = await Test.createTestingModule({
    providers: [
      AnalysisService,
      { provide: getQueueToken('analysis'), useValue: { getJob: jest.fn().mockResolvedValue(job), add } },
      { provide: AccountsService, useValue: accountsService },
      { provide: ContactsService, useValue: contacts },
      { provide: AnalysisCancellationService, useValue: cancellation },
      {
        provide: EsnProfileReader,
        useValue: {
          getAnswers: jest.fn().mockResolvedValue(null),
          resolveProfileData: jest.fn().mockResolvedValue({}),
        },
      },
      { provide: CreditsService, useValue: credits },
      { provide: AnalysisRunsService, useValue: runsServiceMock() },
      {
        provide: AnalysisPersistenceService,
        useValue: { recordAnalysisStarted: jest.fn().mockResolvedValue(undefined) },
      },
    ],
  }).compile()

  return { service: moduleRef.get(AnalysisService), accountsService, cancellation, credits, contacts, add, job }
}

describe('#2704.8 — le jobId reconstruit porte le SIREN, comme celui que `start()` a enqueué', () => {
  it('getStatus retrouve le job à périmètre verrouillé (jobId avec siren)', async () => {
    const { service } = await buildServiceAvecSiren()

    const statut = await service.getStatus(COMPTE_SIREN.id, BEDROS)

    expect(isSuccess(statut)).toBe(true)
    if (isSuccess(statut)) expect(statut.output.jobId).toBe(JOB_DU_LANCEUR_SIREN)
  })

  it('resume ré-enfile sous le MÊME jobId avec siren, pas un jobId fantôme', async () => {
    const { service, add } = await buildServiceAvecSiren()
    const queue = (service as unknown as { analysisQueue: { getJob: jest.Mock } }).analysisQueue
    queue.getJob.mockResolvedValue(undefined)

    const res = await service.resume(COMPTE_SIREN.id, BEDROS)

    expect(isSuccess(res)).toBe(true)
    if (isSuccess(res)) expect(res.output.jobId).toBe(JOB_DU_LANCEUR_SIREN)
  })

  it("cancelByUser annule le job avec siren, pas le jobId sans siren que start() n'a jamais enqueué", async () => {
    const { service, cancellation } = await buildServiceAvecSiren()

    const res = await service.cancelByUser(COMPTE_SIREN.id, BEDROS)

    expect(isSuccess(res)).toBe(true)
    expect(cancellation.cancel).toHaveBeenCalledWith(JOB_DU_LANCEUR_SIREN, 'user_cancelled')
  })
})
