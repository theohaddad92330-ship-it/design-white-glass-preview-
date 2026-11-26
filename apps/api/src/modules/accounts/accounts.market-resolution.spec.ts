import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AccountsController } from './accounts.controller'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { AccountsService } from './accounts.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #1617.4 — `PUT /accounts/:id/market-resolution`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS GARDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas la règle de superposition (elle vit dans `market-resolution-override.ts`),
 * pas l'écriture elle-même (elle vit dans `market-memory.service.spec.ts`) :
 * les TROIS décisions du contrôleur, et elles seules.
 *
 * 1. **La porte d'appartenance passe AVANT l'écriture.** Un compte d'une autre
 *    ESN ne se corrige pas, et le 404 doit tomber avant que la moindre ligne
 *    soit écrite — une décision enregistrée puis refusée laisserait une trace
 *    dans un espace qui n'a rien demandé.
 * 2. **L'espace et l'auteur viennent du JETON**, jamais du corps. Les laisser
 *    entrer par la requête ferait écrire n'importe qui au nom de n'importe quel
 *    espace, sur une table dont c'est précisément la raison d'être de cloisonner
 *    des concurrents.
 * 3. **Une dépendance absente le DIT.** `MarketMemoryService` est `@Optional()`
 *    sur ce contrôleur : sans lui, on rend 503 — jamais un succès silencieux
 *    qui laisserait l'utilisateur croire sa correction enregistrée.
 */

const ACCOUNT_ID = '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55'
const USER = { userId: 'u1' } as never

async function buildController(overrides: {
  findOneForWorkspace?: jest.Mock
  recordResolutionDecision?: jest.Mock
  withMarketMemory?: boolean
}) {
  const findOneForWorkspace =
    overrides.findOneForWorkspace ??
    jest.fn().mockResolvedValue({ type: 'success', output: { id: ACCOUNT_ID, company_name: 'Roche' } })
  const recordResolutionDecision =
    overrides.recordResolutionDecision ??
    jest.fn().mockResolvedValue({
      accountId: ACCOUNT_ID,
      decision: 'confirmed',
      marketCompanyKey: 'roche-holding',
      note: null,
    })

  const providers: Parameters<typeof Test.createTestingModule>[0]['providers'] = [
    AccountsController,
    { provide: AccountsService, useValue: { findOneForWorkspace } },
    {
      provide: WorkspaceContextService,
      useValue: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1', role: 'sales' }) },
    },
    // ⚠️ Une dépendance ABSENTE se déclare `undefined`, elle ne s'omet pas :
    // `useMocker` remplit les jetons non fournis, y compris les `@Optional()`,
    // et un `{}` injecté ferait passer le test « rend 503 » sans que la branche
    // testée soit jamais prise.
    {
      provide: MarketMemoryService,
      useValue: overrides.withMarketMemory === false ? undefined : { recordResolutionDecision },
    },
    // Même raison que ci-dessus : `useMocker` remplirait ce jeton d'un `{}` sans
    // `scopeFor`, et la résolution de périmètre casserait sur un TypeError au
    // lieu de rendre « pas de cloisonnement ».
    { provide: BusinessUnitService, useValue: { scopeFor: jest.fn().mockResolvedValue(null) } },
  ]

  const moduleRef = await Test.createTestingModule({ providers })
    .useMocker(() => ({}))
    .compile()

  return { controller: moduleRef.get(AccountsController), findOneForWorkspace, recordResolutionDecision }
}

describe('#1617.4 — PUT /accounts/:id/market-resolution', () => {
  it('enregistre un ACCORD avec la clé du corpus, l’espace du jeton et son auteur', async () => {
    const { controller, recordResolutionDecision } = await buildController({})

    const record = await controller.recordMarketResolution(ACCOUNT_ID, USER, {
      decision: 'confirmed',
      marketCompanyKey: 'roche-holding',
    })

    expect(recordResolutionDecision).toHaveBeenCalledWith({
      workspaceId: 'w1',
      accountId: ACCOUNT_ID,
      reviewedBy: 'u1',
      decision: { decision: 'confirmed', marketCompanyKey: 'roche-holding' },
    })
    expect(record).toEqual({
      accountId: ACCOUNT_ID,
      decision: 'confirmed',
      marketCompanyKey: 'roche-holding',
      note: null,
    })
  })

  it('enregistre un REJET sans clé — « ce n’est pas exact » est une réponse complète', async () => {
    const { controller, recordResolutionDecision } = await buildController({
      recordResolutionDecision: jest
        .fn()
        .mockResolvedValue({ accountId: ACCOUNT_ID, decision: 'dismissed', marketCompanyKey: null, note: null }),
    })

    await controller.recordMarketResolution(ACCOUNT_ID, USER, { decision: 'dismissed' })

    expect(recordResolutionDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: { decision: 'dismissed' } }),
    )
  })

  it('⚠️ vérifie l’APPARTENANCE avant d’écrire — un compte d’une autre ESN ne se corrige pas', async () => {
    const { controller, findOneForWorkspace, recordResolutionDecision } = await buildController({
      findOneForWorkspace: jest
        .fn()
        .mockResolvedValue({ type: 'failure', problem: { code: 'not_found', message: 'Compte introuvable' } }),
    })

    await expect(controller.recordMarketResolution(ACCOUNT_ID, USER, { decision: 'dismissed' })).rejects.toBeInstanceOf(
      NotFoundException,
    )

    expect(findOneForWorkspace).toHaveBeenCalledWith(ACCOUNT_ID, 'w1', null)
    // Le point du test : RIEN n'a été écrit. Une décision enregistrée puis
    // refusée laisserait une trace dans un espace qui n'a rien demandé.
    expect(recordResolutionDecision).not.toHaveBeenCalled()
  })

  it('REFUSE un corps qui ne dit pas ce qu’il désigne — un accord sans clé ne désigne rien', async () => {
    const { controller, recordResolutionDecision } = await buildController({})

    await expect(controller.recordMarketResolution(ACCOUNT_ID, USER, { decision: 'confirmed' })).rejects.toBeTruthy()
    expect(recordResolutionDecision).not.toHaveBeenCalled()
  })

  it('n’EMPORTE PAS la clé d’un rejet — elle dirait le contraire de la décision', async () => {
    const { controller, recordResolutionDecision } = await buildController({
      recordResolutionDecision: jest
        .fn()
        .mockResolvedValue({ accountId: ACCOUNT_ID, decision: 'dismissed', marketCompanyKey: null, note: null }),
    })

    await controller.recordMarketResolution(ACCOUNT_ID, USER, {
      decision: 'dismissed',
      marketCompanyKey: 'roche-holding',
    })

    // Le schéma la retire du corps ; le service écrirait `null` de toute façon.
    // Les deux se répondent, et le CHECK croisé de la table ne peut pas rendre
    // un 500 sur un geste par ailleurs légitime.
    expect(recordResolutionDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: { decision: 'dismissed' } }),
    )
  })

  it('n’accepte NI espace NI auteur venus du corps — ils viennent du jeton', async () => {
    const { controller, recordResolutionDecision } = await buildController({})

    await controller.recordMarketResolution(ACCOUNT_ID, USER, {
      decision: 'dismissed',
      workspaceId: 'espace-d-en-face',
      reviewedBy: 'quelqu-un-d-autre',
    })

    expect(recordResolutionDecision).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', reviewedBy: 'u1' }),
    )
  })

  it('rend 503 quand la mémoire marché n’est pas montée — jamais un succès silencieux', async () => {
    const { controller } = await buildController({ withMarketMemory: false })

    await expect(controller.recordMarketResolution(ACCOUNT_ID, USER, { decision: 'dismissed' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })
})
