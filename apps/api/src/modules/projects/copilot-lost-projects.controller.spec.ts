import { CopilotLostProjectsController } from './copilot-lost-projects.controller'

/**
 * #4288.4 — « mes affaires perdues en 2026 » lit la MÊME population que l'écran Projets
 * (`ProjectsService.listForWorkspace`, étape `lost`), jamais les besoins.
 */
describe('CopilotLostProjectsController (#4288.4)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }

  function make(rows: unknown[]) {
    const projects = { listForWorkspace: jest.fn().mockResolvedValue(rows) }
    return { projects, controller: new CopilotLostProjectsController(projects as never, workspaceContext as never) }
  }

  it("ne rend que l'étape perdue de l'espace actif — celles que « Voir les perdues » compte", async () => {
    const { projects, controller } = make([
      { id: 'p-1', label: 'Refonte data', company_name: 'SNCF', stage: 'lost', closed_at: '2026-03-04T10:00:00Z' },
      { id: 'p-2', label: 'Cloud', company_name: 'Orange', stage: 'lost', closed_at: null, stage_entered_at: 'x' },
      { id: 'p-3', label: 'Ouverte', company_name: 'EDF', stage: 'qualified', closed_at: null },
    ])
    const out = await controller.lost({ userId: 'u-1' } as never)
    expect(projects.listForWorkspace).toHaveBeenCalledWith('w-1')
    expect(out).toEqual({
      projects: [
        { id: 'p-1', label: 'Refonte data', companyName: 'SNCF', closedAt: '2026-03-04T10:00:00Z' },
        { id: 'p-2', label: 'Cloud', companyName: 'Orange', closedAt: null },
      ],
      total: 2,
    })
  })

  it('contrôle négatif : aucune perdue ⇒ liste vide ET total 0 (une lecture réussie, pas un silence)', async () => {
    const { controller } = make([{ id: 'p-3', label: 'Ouverte', company_name: 'EDF', stage: 'qualified' }])
    expect(await controller.lost({ userId: 'u-1' } as never)).toEqual({ projects: [], total: 0 })
  })
})
