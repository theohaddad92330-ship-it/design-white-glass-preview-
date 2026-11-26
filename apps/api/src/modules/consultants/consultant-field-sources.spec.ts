import type { ConsultantsService } from './consultants.service'
import type { ProvenanceService } from '../crm-core/provenance.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ConsultantsController } from './consultants.controller'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

/**
 * #4577.3 — la fiche DIT d'où vient chaque champ : `GET /consultants/:id` joint la provenance courante
 * (`field_sources`), lue par le contrôleur (GA-07 : un service n'importe pas `ProvenanceService`).
 * « saisi à la main » = source `human` ; un champ sans ligne de provenance reste ABSENT, jamais deviné.
 */
function makeController(sources: Record<string, { source: string; observedAt: string }>, found: unknown) {
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE, role: 'sales' })),
  } as unknown as WorkspaceContextService
  const consultants = {
    hidesTalentContacts: jest.fn(async () => false),
    findOneScoped: jest.fn(async () => found),
  } as unknown as ConsultantsService
  const provenance = { currentSourcesDetailed: jest.fn(async () => sources) } as unknown as ProvenanceService
  const controller = new ConsultantsController(
    consultants,
    workspaceContext,
    {} as never,
    provenance,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return { controller, provenance }
}

describe('GET /consultants/:id — field_sources (#4577.3)', () => {
  it('joint la source de chaque champ : un tjm corrigé à la main sort `human`, le titre importé `connector`', async () => {
    const { controller, provenance } = makeController(
      {
        tjm_cents: { source: 'human', observedAt: '2026-10-30T10:00:00.000Z' },
        title: { source: 'connector', observedAt: '2026-10-29T10:00:00.000Z' },
      },
      { id: TALENT, full_name: 'Jeanne' },
    )

    const result = (await controller.findOne(TALENT, { userId: USER } as never)) as { field_sources?: unknown }

    expect(provenance.currentSourcesDetailed).toHaveBeenCalledWith('consultant', TALENT)
    expect(result.field_sources).toEqual({ tjm_cents: 'human', title: 'connector' })
  })

  it('aucune provenance : `field_sources` vide, aucune source inventée', async () => {
    const { controller } = makeController({}, { id: TALENT })
    const result = (await controller.findOne(TALENT, { userId: USER } as never)) as { field_sources?: unknown }
    expect(result.field_sources).toEqual({})
  })

  it('fiche introuvable : 404, la provenance n’est pas lue', async () => {
    const { controller, provenance } = makeController({}, null)
    await expect(controller.findOne(TALENT, { userId: USER } as never)).rejects.toThrow('Consultant introuvable')
    expect(provenance.currentSourcesDetailed).not.toHaveBeenCalled()
  })
})
