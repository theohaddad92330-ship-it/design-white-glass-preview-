import { CopilotTeamPolicyController } from './copilot-team-policy.controller'
import { CopilotTeamPolicyDto } from './dto/copilot-bridge.dto'

const USER = '99999999-9999-4999-8999-999999999999'

// #2770.37 — Laura lit LA politique d'équipe de l'écran Réglages › Équipe
// (`WorkspaceTeamPolicySettingsService`), jamais un second réglage.
describe('CopilotTeamPolicyController (#2770.37)', () => {
  const build = (result: unknown) => {
    const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1', role: 'member' })) }
    const settings = { forLaura: jest.fn(async () => result) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doubles de test
    const controller = new CopilotTeamPolicyController(workspaceContext as any, settings as any)
    return { controller, workspaceContext, settings }
  }

  it('lit la politique de l’espace ACTIF du demandeur', async () => {
    const policy = { prospectingWindows: [], forbiddenWindows: [], maxMeetingsPerDay: 4, dailyCallTarget: null }
    const { controller, workspaceContext, settings } = build({ policy })
    await expect(controller.teamPolicy({ userId: USER })).resolves.toEqual({ policy })
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith(USER)
    expect(settings.forLaura).toHaveBeenCalledWith('ws-1')
  })

  it('rien saisi se DIT (`policy: null`), jamais une politique vide maquillée', async () => {
    const { controller } = build({ policy: null })
    await expect(controller.teamPolicy({ userId: USER })).resolves.toEqual({ policy: null })
  })

  it('refuse un espace glissé par l’appelant', () => {
    expect(CopilotTeamPolicyDto.schema.safeParse({ userId: USER }).success).toBe(true)
    expect(CopilotTeamPolicyDto.schema.safeParse({ userId: USER, workspaceId: 'x' }).success).toBe(false)
  })
})
