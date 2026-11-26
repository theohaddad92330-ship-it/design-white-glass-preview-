import { isFailure, isSuccess, success, failure } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { IaClient } from '../ia/ia.client'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { AnalysisPersistenceService } from './analysis.persistence'
import { CrmReadService } from '../crm/crm-read.service'
import { RelationAxisReaderService } from './relation-axis-reader.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #2298.4 (19/09/2026, lot I3) — « Recalculer la relation (gratuit) ».
 *
 * TROIS preuves rouges que ce fichier tient, chacune cassée puis corrigée
 * pendant l'écriture (voir le commit) :
 *  1. ZÉRO appel sortant — ni CRM (`CrmReadService`), ni recherche/contacts
 *     payants (`ia.research`/`ia.contacts`) ;
 *  2. jamais de downgrade — un axe relation déjà mesuré (CRM, à la dernière
 *     analyse complète) survit à un recalcul qui ne trouve rien de neuf ;
 *  3. une correction humaine posée APRÈS le dernier calcul stocké entre bien
 *     dans le recalcul — elle ne peut jamais être écrasée par lui, elle y
 *     entre à chaque appel.
 */

const esnProfileStub = () => ({ getAnswers: jest.fn(), resolveProfileData: jest.fn() }) as unknown as EsnProfileReader

type Ctor = ConstructorParameters<typeof AnalysisOnDemandService>

function buildService(opts: {
  account: AccountEntity
  signals?: { missionsCount?: number; lastMeetingAt?: string; lastEmailAt?: string; knownContactsCount?: number }
  recalc?: {
    score: number | null
    max: number
    unmeasured: string[]
    factors: { axis: string; label: string; points: number; evidence: string }[]
  }
  isDemoWorkspace?: boolean
}) {
  const accounts = {
    findOne: jest.fn().mockResolvedValue(success(opts.account)),
    applyAddressabilityRelationRecalc: jest.fn().mockResolvedValue(undefined),
  }
  const contacts = { findByAccount: jest.fn() }
  const ia = {
    recalculateRelationAxis: jest
      .fn()
      .mockResolvedValue(opts.recalc ?? { score: null, max: 0, unmeasured: ['relation'], factors: [] }),
    research: jest.fn(),
    contacts: jest.fn(),
  }
  const persistence = {}
  const crmRead = {
    describeAccountHistory: jest.fn(),
    findAccountPresence: jest.fn(),
  }
  const relationAxis = {
    relationSignalsFor: jest.fn().mockResolvedValue(opts.signals ?? {}),
  }
  const workspaceContext = { isDemoWorkspace: jest.fn().mockResolvedValue(opts.isDemoWorkspace ?? false) }

  const service = new AnalysisOnDemandService(
    accounts as unknown as AccountsService,
    contacts as unknown as ContactsService,
    ia as unknown as IaClient,
    persistence as unknown as AnalysisPersistenceService,
    esnProfileStub(),
    undefined, // accountFeedback
    workspaceContext as unknown as Ctor[6],
    crmRead as unknown as CrmReadService,
    undefined, // signalHistory
    undefined, // orgGraph
    undefined, // runs
    undefined, // credits
    undefined, // orgRebuildQueue
    undefined, // marketMemory
    relationAxis as unknown as RelationAxisReaderService,
  )
  return { service, accounts, ia, crmRead, relationAxis, workspaceContext }
}

const baseAccount = (raw: Record<string, unknown> = {}) =>
  ({
    id: 'acc-1',
    user_id: 'u-1',
    company_name: 'Nova Logistique',
    raw_analysis: raw,
    relationship_memory: null,
  }) as unknown as AccountEntity

describe('AnalysisOnDemandService.recalculateRelationAxis', () => {
  it('ne fait AUCUN appel sortant — ni CRM, ni recherche/contacts payants', async () => {
    const { service, ia, crmRead } = buildService({
      account: baseAccount(),
      signals: { missionsCount: 3 },
      recalc: {
        score: 3,
        max: 3,
        unmeasured: [],
        factors: [{ axis: 'relation', label: 'Relation', points: 3, evidence: '3 missions…' }],
      },
    })

    const result = await service.recalculateRelationAxis('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    expect(crmRead.describeAccountHistory).not.toHaveBeenCalled()
    expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    expect(ia.research).not.toHaveBeenCalled()
    expect(ia.contacts).not.toHaveBeenCalled()
    // Le seul appel IA autorisé : le recalcul gratuit, exactement une fois.
    expect(ia.recalculateRelationAxis).toHaveBeenCalledTimes(1)
  })

  it('écrit le facteur relation frais et stampe sa propre date de recalcul', async () => {
    const { service, accounts } = buildService({
      account: baseAccount({ addressability: { score: null, max: 0, unmeasured: ['relation'], factors: [] } }),
      signals: { missionsCount: 12 },
      recalc: {
        score: 3,
        max: 3,
        unmeasured: [],
        factors: [{ axis: 'relation', label: 'Relation', points: 3, evidence: '12 missions en cours ou passées' }],
      },
    })

    const result = await service.recalculateRelationAxis('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output.measured).toBe(true)
    expect(accounts.applyAddressabilityRelationRecalc).toHaveBeenCalledTimes(1)
    const [accountId, merged, at] = accounts.applyAddressabilityRelationRecalc.mock.calls[0]
    expect(accountId).toBe('acc-1')
    expect(merged.unmeasured).not.toContain('relation')
    expect(merged.factors).toEqual([
      expect.objectContaining({ axis: 'relation', evidence: '12 missions en cours ou passées' }),
    ])
    expect(at).toBeInstanceOf(Date)
  })

  it('NE DOWNGRADE JAMAIS un axe déjà mesuré par le CRM quand ce recalcul ne trouve rien de neuf', async () => {
    const storedCrmFactor = {
      axis: 'relation',
      label: 'Relation',
      points: 3,
      evidence: 'ton CRM connecté a retrouvé ce compte : au moins un contact ou un deal ouvert y est enregistré',
    }
    const { service, accounts } = buildService({
      account: baseAccount({
        addressability: { score: 14, max: 17, unmeasured: ['path'], factors: [storedCrmFactor] },
      }),
      signals: {}, // aucune mission, aucun rendez-vous, aucun e-mail
      recalc: { score: null, max: 0, unmeasured: ['relation'], factors: [] }, // rien trouvé côté DB
    })

    const result = await service.recalculateRelationAxis('acc-1', 'u-1')

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output.measured).toBe(true)
    const [, merged] = accounts.applyAddressabilityRelationRecalc.mock.calls[0]
    // Le facteur CRM stocké survit tel quel — jamais effacé pour un « non
    // mesuré » qui ne ferait que refléter l'angle mort de ce chemin gratuit.
    expect(merged.factors).toEqual([storedCrmFactor])
    expect(merged.unmeasured).not.toContain('relation')
  })

  it('une correction humaine posée depuis la dernière analyse entre dans le recalcul', async () => {
    const account = baseAccount({ addressability: { score: null, max: 0, unmeasured: ['relation'], factors: [] } })
    ;(account as unknown as { relationship_memory: { relation: string } }).relationship_memory = {
      relation: 'ancien client, référé par Marc',
    }
    const { service, ia } = buildService({
      account,
      recalc: {
        score: 3,
        max: 3,
        unmeasured: [],
        factors: [{ axis: 'relation', label: 'Relation', points: 3, evidence: 'correction posée par ton équipe : …' }],
      },
    })

    await service.recalculateRelationAxis('acc-1', 'u-1')

    expect(ia.recalculateRelationAxis).toHaveBeenCalledWith(
      expect.objectContaining({ humanCorrection: 'ancien client, référé par Marc' }),
    )
  })

  // #4680 — la quatrième source en base : les contacts CONNUS (import / CRM) rattachés au compte.
  it('transmet le NOMBRE de contacts connus à l’IA, sans le moindre appel sortant', async () => {
    const { service, ia, crmRead } = buildService({
      account: baseAccount(),
      signals: { knownContactsCount: 2 },
      recalc: {
        score: 3,
        max: 3,
        unmeasured: [],
        factors: [{ axis: 'relation', label: 'Relation', points: 3, evidence: '2 contacts connus…' }],
      },
    })

    await service.recalculateRelationAxis('acc-1', 'u-1')

    expect(ia.recalculateRelationAxis).toHaveBeenCalledWith(expect.objectContaining({ knownContactsCount: 2 }))
    expect(crmRead.findAccountPresence).not.toHaveBeenCalled()
    expect(ia.research).not.toHaveBeenCalled()
    expect(ia.contacts).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON — sans contact connu, aucun nombre n’est transmis (jamais « 0 »)', async () => {
    const { service, ia } = buildService({ account: baseAccount(), signals: {} })

    await service.recalculateRelationAxis('acc-1', 'u-1')

    expect(ia.recalculateRelationAxis).toHaveBeenCalledWith(expect.objectContaining({ knownContactsCount: undefined }))
  })

  it('ne downgrade JAMAIS : un facteur relation déjà mesuré survit à un recalcul sans contact connu', async () => {
    const factor = { axis: 'relation', label: 'Relation', points: 3, evidence: 'via le CRM' }
    const { service, accounts } = buildService({
      account: baseAccount({ addressability: { score: 3, max: 3, unmeasured: [], factors: [factor] } }),
      signals: {},
    })

    await service.recalculateRelationAxis('acc-1', 'u-1')

    const merged = accounts.applyAddressabilityRelationRecalc.mock.calls[0]?.[1]
    expect(merged.factors).toEqual([factor])
  })

  it('un espace de démonstration refuse SANS appeler l’IA', async () => {
    const { service, ia } = buildService({ account: baseAccount(), isDemoWorkspace: true })

    const result = await service.recalculateRelationAxis('acc-1', 'u-1')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('precondition_failed')
    expect(ia.recalculateRelationAxis).not.toHaveBeenCalled()
  })

  it('rend not_found quand le compte est absent ou appartient à un autre espace', async () => {
    const accounts = {
      findOne: jest.fn().mockResolvedValue(failure({ code: 'not_found', message: 'gone' })),
      applyAddressabilityRelationRecalc: jest.fn(),
    }
    const ia = { recalculateRelationAxis: jest.fn() }
    const service = new AnalysisOnDemandService(
      accounts as unknown as AccountsService,
      {} as unknown as ContactsService,
      ia as unknown as IaClient,
      {} as unknown as AnalysisPersistenceService,
      esnProfileStub(),
    )

    const result = await service.recalculateRelationAxis('ghost', 'u-1')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('not_found')
    expect(ia.recalculateRelationAxis).not.toHaveBeenCalled()
  })
})
