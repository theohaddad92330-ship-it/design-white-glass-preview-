import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #3345 (recette prod 03/10) — Laura retrouve une piste par son LIBELLÉ : la
 * lecture est scopée à l'espace ACTIF, et rend les lignes d'intake seulement.
 */
describe('CopilotBridgeController.resolveQualificationLead (#3345)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
  const rows = [
    {
      id: 'p1',
      label: 'Risque de ralentissement du time-to-market',
      company_name: 'ACTIA Group',
      stage: 'detected',
      account_id: 'a-1',
    },
    { id: 'p2', label: 'Refonte SI', company_name: 'ACTIA Group', stage: 'qualified', account_id: 'a-1' },
  ]

  function call(projects: unknown, dto: Record<string, unknown>) {
    return CopilotBridgeController.prototype.resolveQualificationLead.call(
      { projects, workspaceContext } as never,
      {
        userId: 'u-1',
        ...dto,
      } as never,
    )
  }

  it('lit l’espace actif et rend la piste désignée par son libellé', async () => {
    const projects = { listForWorkspace: jest.fn().mockResolvedValue(rows) }
    const out = await call(projects, { label: 'piste ACTIA Group' })
    expect(projects.listForWorkspace).toHaveBeenCalledWith('w-1', undefined)
    expect(out).toEqual({
      matched_on: 'account',
      matches: [
        {
          lead_key: 'p1',
          label: 'Risque de ralentissement du time-to-market',
          account_id: 'a-1',
          company_name: 'ACTIA Group',
        },
      ],
    })
  })

  it('sans le service, le dit — jamais une liste vide', async () => {
    expect(await call(undefined, { label: 'x' })).toEqual({ error: 'projects_unavailable' })
  })
})
