import type { ActionIntent } from '@bellum/contracts'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { createMockRepository } from '../../database/test-utils'
import { ActionOsController } from './action-os.controller'

/**
 * #2400.5 — LE DRY RUN D'UNE AUTOMATISATION, SUR DES DONNÉES RÉELLES.
 *
 * `GET action-os/workflows/:definitionKey/dry-run` : ce que le niveau
 * « automatiser » ferait des intents RÉELLEMENT figés sur les derniers runs de
 * CE workflow (`workflow_runs.intents`, #1931 D2), sans en exécuter un seul.
 * Read-only : `runs.update`/`save` ne sont JAMAIS appelés par cette route.
 *
 * ⚠️ Sans mesure des six conditions d'« automatiser » (#2449.26-.31, aucun
 * écran ne les pose encore), le verdict est honnêtement « pas prêt » pour tout
 * geste qui ne sort pas déjà par `never_reaches_a_person` — ce test le nomme
 * plutôt que de l'affirmer.
 */

const USER = { userId: 'u1', email: 'rep@esn.fr' }

function run(over: Partial<WorkflowRunEntity> & { intents: WorkflowRunEntity['intents'] }): WorkflowRunEntity {
  return {
    id: 'run-1',
    workspace_id: 'ws-1',
    definition_key: 'crm_hygiene',
    ...over,
  } as WorkflowRunEntity
}

const CRM_NOTE: ActionIntent = { type: 'create_crm_note', contactId: 'c1', note: 'n' }
const SEND_EMAIL: ActionIntent = {
  type: 'send_email',
  contactId: 'c1',
  subject: 's',
  body: 'b',
} as unknown as ActionIntent

function build() {
  const runs = createMockRepository<WorkflowRunEntity>()
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const controller = new ActionOsController(
    {} as never, // runner — jamais appelé par cette route
    workspaceContext as never,
    {} as never, // tools
    runs as never,
    {} as never, // approvals
    {} as never, // accounts
    {} as never, // contacts
    {} as never, // crmConnections
    {} as never, // profiles
    {} as never, // cards
    {} as never, // lauraJobs (#2276 tranche 2)
  )
  return { controller, runs, workspaceContext }
}

describe('ActionOsController — dry run avant activation (#2400.5)', () => {
  it('rejoue les intents RÉELS des derniers runs de ce workflow, pour cet espace', async () => {
    const { controller, runs } = build()
    runs.find.mockResolvedValue([run({ intents: { step1: CRM_NOTE } }), run({ intents: { step1: SEND_EMAIL } })])

    const report = await controller.dryRunAutomation(USER as never, 'crm_hygiene')

    expect(report.level).toBe('automate')
    expect(report.gestures).toHaveLength(2)
    // Aucune des six conditions n'est mesurée nulle part encore (#2449.26-.31) :
    // le geste qui ne sort pas déjà par `never_reaches_a_person` est refusé
    // « pas prêt », jamais un vert inventé.
    expect(report.gestures.find(g => g.intentType === 'create_crm_note')).toMatchObject({
      verdict: 'refused',
      because: 'automation_not_ready',
    })
    // Le copilote n'envoie jamais d'e-mail : aucune des six conditions ne lève
    // cette ligne-là non plus.
    expect(report.gestures.find(g => g.intentType === 'send_email')).toMatchObject({
      verdict: 'refused',
      because: 'never_reaches_a_person',
    })
    expect(report.blocked).toBe(2)
    expect(report.validated).toBe(false)
  })

  it('un workflow jamais lancé rend une simulation VIDE — pas un vert deviné', async () => {
    const { controller, runs } = build()
    runs.find.mockResolvedValue([])

    const report = await controller.dryRunAutomation(USER as never, 'jamais_lance')

    expect(report.gestures).toEqual([])
    expect(report.blocked).toBe(0)
    // Une simulation vide ne valide rien (`simulationValidates`) : zéro geste
    // bloqué sur zéro geste joué est un « non mesuré » affiché comme un succès.
    expect(report.validated).toBe(false)
  })

  it("scope la lecture à L'ESPACE actif et au workflow demandé — jamais un autre", async () => {
    const { controller, runs, workspaceContext } = build()
    runs.find.mockResolvedValue([])

    await controller.dryRunAutomation(USER as never, 'crm_hygiene')

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u1')
    expect(runs.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: 'ws-1', definition_key: 'crm_hygiene' } }),
    )
  })

  it("ne lit rien d'autre : aucune écriture — pas de save/update sur les runs", async () => {
    const { controller, runs } = build()
    runs.find.mockResolvedValue([run({ intents: { step1: CRM_NOTE } })])

    await controller.dryRunAutomation(USER as never, 'crm_hygiene')

    expect(runs.save).not.toHaveBeenCalled()
    expect(runs.update).not.toHaveBeenCalled()
  })
})
