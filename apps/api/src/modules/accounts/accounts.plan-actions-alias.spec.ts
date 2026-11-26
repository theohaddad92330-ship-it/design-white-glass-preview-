import 'reflect-metadata'
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { failure } from '@bellum/utils'
import { AccountsController } from './accounts.controller'

type AliasThis = {
  planItems?: { createFromLegacyPlanAction: jest.Mock }
  accountsService: Record<string, jest.Mock>
  workspaceContext?: { resolveActiveWorkspace: jest.Mock }
  businessUnits?: { scopeFor: jest.Mock }
}

const addPlanAction = AccountsController.prototype.addPlanAction as unknown as (
  this: AliasThis,
  id: string,
  user: { userId: string },
  dto: { text: string },
) => Promise<unknown>

/**
 * #2084.24 — l'alias porte désormais la PORTE DE PÉRIMÈTRE, comme les cinq
 * autres écritures du contrôleur. Ces specs appellent la méthode sur un `this`
 * fabriqué à la main : il doit donc hériter du prototype, sinon
 * `assertAccountInScope` — une méthode privée, bien réelle — est `undefined` et
 * le test mesure un `TypeError` au lieu de la règle.
 *
 * Le périmètre par défaut est `null` (`business_unit_access: 'workspace'`), le
 * niveau de tout le monde à cette heure : la porte s'efface, aucune lecture de
 * compte de plus, et ces quatre cas mesurent exactement ce qu'ils mesuraient.
 */
const alias = (parts: Partial<AliasThis>): AliasThis =>
  Object.assign(Object.create(AccountsController.prototype) as object, {
    accountsService: {},
    workspaceContext: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) },
    businessUnits: { scopeFor: jest.fn().mockResolvedValue(null) },
    ...parts,
  }) as AliasThis

/**
 * #2123.46 — `POST /accounts/:id/plan/actions`, ALIAS DÉPRÉCIÉ le 17/09.
 *
 * Le web (Vercel) et l'API (Railway) ne basculent pas au même instant, et un
 * onglet ouvert garde l'ancien bundle : retirer la route rendait une 404 sur
 * « Ajouter au plan » pendant la fenêtre de déploiement. L'alias traduit
 * l'ancien corps et appelle la MÊME porte que `POST /plan-items` — il n'écrit
 * jamais `raw_analysis.user_plan_actions` (une seule écriture, GA-26).
 */
describe('#2123.46 — alias déprécié POST :id/plan/actions', () => {
  it('délègue à la porte canonique des actions, pour l’appelant du jeton', async () => {
    const createFromLegacyPlanAction = jest.fn().mockResolvedValue({ raw_analysis: {}, added: true })
    const self = alias({ planItems: { createFromLegacyPlanAction } })

    const response = await addPlanAction.call(self, 'acc-1', { userId: 'user-1' }, { text: 'Relancer' })

    expect(createFromLegacyPlanAction).toHaveBeenCalledWith('user-1', 'acc-1', { text: 'Relancer' })
    expect(response).toEqual({ raw_analysis: {}, added: true })
  })

  it('SAIT DIRE NON — n’écrit jamais par le service des comptes (le blob de l’analyse)', async () => {
    const appendUserAttackAngle = jest.fn()
    const self = alias({
      planItems: { createFromLegacyPlanAction: jest.fn().mockResolvedValue({ raw_analysis: {}, added: true }) },
      accountsService: { appendUserAttackAngle },
    })

    await addPlanAction.call(self, 'acc-1', { userId: 'user-1' }, { text: 'Relancer' })

    expect(appendUserAttackAngle).not.toHaveBeenCalled()
    expect((AccountsController.prototype as unknown as Record<string, unknown>)['appendUserPlanAction']).toBeUndefined()
  })

  it('un compte hors de mon espace reste un 404', async () => {
    const self = alias({
      planItems: { createFromLegacyPlanAction: jest.fn().mockRejectedValue(new NotFoundException()) },
    })

    await expect(addPlanAction.call(self, 'acc-9', { userId: 'user-1' }, { text: 'Relancer' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('sans la porte canonique câblée, répond 503 — jamais une écriture de repli', async () => {
    const self = alias({ planItems: undefined })

    await expect(addPlanAction.call(self, 'acc-1', { userId: 'user-1' }, { text: 'Relancer' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })

  it('#2084.24 — un compte d’une AUTRE unité opérationnelle est refusé AVANT la porte canonique', async () => {
    // La porte de périmètre passe avant le 503 comme avant l’écriture : ni le
    // service des actions, ni « indisponible » ne doivent devenir l’aveu qu’un
    // compte existe ailleurs dans l’espace.
    const createFromLegacyPlanAction = jest.fn()
    const self = alias({
      planItems: { createFromLegacyPlanAction },
      accountsService: {
        findOneForWorkspace: jest.fn().mockResolvedValue(failure({ code: 'not_found', message: 'Account not found' })),
      },
      businessUnits: {
        scopeFor: jest.fn().mockResolvedValue({ businessUnitIds: ['bu-lyon'], includeUnassigned: true }),
      },
    })

    await expect(addPlanAction.call(self, 'acc-9', { userId: 'user-1' }, { text: 'Relancer' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(createFromLegacyPlanAction).not.toHaveBeenCalled()
  })
})
