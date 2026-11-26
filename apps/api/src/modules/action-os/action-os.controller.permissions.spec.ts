import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { ActionOsController } from './action-os.controller'

/**
 * D1 — revue de sécurité du lot Action OS (13/09/2026) : les deux routes de
 * workflow qui EXÉCUTENT déclarent `records:write`.
 *
 * `POST action-os/runs` lance un run (et l'exécute seul quand l'espace est en
 * automatique borné) ; `POST action-os/approvals/:id` exécute, depuis L2, les
 * intents figés du run. Aucune ne déclarait de permission, et
 * `WorkspacePermissionGuard` laisse passer une route sans déclaration : un siège
 * `viewer` lançait puis approuvait lui-même un workflow qui écrit dans le CRM.
 * Le droit PROPRE à chaque effet (envoi, écriture CRM, recherche payante) est
 * vérifié en plus à la porte du routeur (`INTENT_PERMISSION`).
 */

function declared(method: keyof ActionOsController): unknown {
  return Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ActionOsController.prototype[method])
}

describe('ActionOsController — les routes qui exécutent déclarent `records:write` (D1)', () => {
  it('lancer un run et trancher une approbation exigent `records:write`', () => {
    expect(declared('start')).toEqual(['records:write'])
    expect(declared('decide')).toEqual(['records:write'])
  })

  // #2865 — relancer un run MULTI-PAS peut exécuter un pas qui écrit, comme
  // `start` juste au-dessus : même exigence, pour la même raison.
  it('relancer un run multi-pas exige `records:write` (#2865)', () => {
    expect(declared('retryRun')).toEqual(['records:write'])
  })

  it('les six gestes de carte gardent leur déclaration', () => {
    for (const gesture of [
      'confirmCard',
      'rejectCard',
      'snoozeCard',
      'modifyCard',
      'retryCard',
      'cancelCard',
    ] as const) {
      expect(declared(gesture)).toEqual(['records:write'])
    }
  })

  it('#2276 tranche 2 — les quatre gestes du job composite de Laura exigent `records:write`', () => {
    for (const gesture of ['confirmLauraJob', 'approveLauraJobStep', 'resumeLauraJob', 'cancelLauraJob'] as const) {
      expect(declared(gesture)).toEqual(['records:write'])
    }
    // Relire la fiche de son propre job n'écrit rien.
    expect(declared('lauraJob')).toBeUndefined()
  })

  it('n’attrape pas ce qu’elle ne vise pas — le plan et les lectures n’exigent aucune écriture', () => {
    expect(declared('plan')).toBeUndefined()
    expect(declared('listWorkflows')).toBeUndefined()
    expect(declared('listRuns')).toBeUndefined()
    expect(declared('listApprovals')).toBeUndefined()
  })
})

/**
 * #2400.5 / #2449.28-.32 — le dry run avant activation N'ÉCRIT rien (c'est une
 * lecture), mais reste réservé à qui pourrait activer l'automatisation : même
 * droit que `/actions/simulate`, `team:manage`, jamais `records:write` (cette
 * route ne produit aucun effet à autoriser).
 */
describe('ActionOsController — le dry run avant activation exige `team:manage` (#2400.5)', () => {
  it('dryRunAutomation exige `team:manage`, comme `/actions/simulate`', () => {
    expect(declared('dryRunAutomation')).toEqual(['team:manage'])
  })
})
