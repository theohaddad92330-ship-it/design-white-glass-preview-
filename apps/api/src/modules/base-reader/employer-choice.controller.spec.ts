import { EmployerChoiceController } from './employer-choice.controller'
import type { EmployerChoiceDto } from './dto/base-reader-choice.dto'
import type { BaseReaderService } from './base-reader.service'

/** #4419.8 — le choix s'écrit sous l'espace ACTIF de l'appelant, jamais sous un espace venu du client. */
describe('#4419.8 — PUT discover/employer-choice', () => {
  it("écrit sous l'espace actif et la personne de l'appelant", async () => {
    const chooseIdentity = jest.fn(async () => undefined)
    const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-A', role: 'member' })) }
    const controller = new EmployerChoiceController(
      { chooseIdentity } as unknown as BaseReaderService,
      workspaceContext as never,
    )
    const dto = { employerName: 'CGI', siren: '111111118', legalName: 'CGI FRANCE', workspaceId: 'ws-B' }
    await expect(
      controller.choose({ userId: 'user-1' } as never, dto as unknown as EmployerChoiceDto),
    ).resolves.toEqual({
      chosen: true,
    })
    expect(chooseIdentity).toHaveBeenCalledWith({ workspaceId: 'ws-A', businessUnitScope: null }, 'user-1', 'CGI', {
      siren: '111111118',
      name: 'CGI FRANCE',
    })
  })
})
