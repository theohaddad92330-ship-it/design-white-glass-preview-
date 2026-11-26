import type { RecordFieldAudit } from '@bellum/contracts'
import type { ConsultantsService } from './consultants.service'
import type { CvParseService } from './cv-parse.service'
import type { CvStudioService } from './cv-studio.service'
import type { SkillAliasService } from './skill-alias.service'
import type { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import type { CreditsService } from '../credits/credits.service'
import type { ProvenanceService } from '../crm-core/provenance.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ConsultantsController } from './consultants.controller'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

function auditRow(over: Partial<RecordFieldAudit> = {}): RecordFieldAudit {
  return {
    id: 'a4e6e9f0-0000-4000-8000-000000000001',
    entityType: 'consultant',
    entityId: TALENT,
    field: 'cv_parse.skills',
    oldValue: null,
    newValue: 'human',
    source: 'human',
    actorId: 'a4e6e9f0-0000-4000-8000-0000000000aa',
    actorName: 'Jeanne Martin',
    createdAt: '2026-09-20T10:00:00.000Z',
    rule: 'cv_parse.review',
    ...over,
  }
}

/**
 * #2184.37 / #2184.38 — `parseCv` (POST :id/parse) compose la PROPOSITION du
 * modèle avec le journal de provenance, sans que `CvParseService` ait à
 * importer `ProvenanceService` (GA-07 fige les imports service → service).
 */
function makeController(history: RecordFieldAudit[] = []) {
  const proposal = { fields: [], sourceChars: 0, cvText: '', canAcceptAll: true, partial: false }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })),
    isDemoWorkspace: jest.fn(async () => false),
  } as unknown as WorkspaceContextService
  const provenance = { history: jest.fn(async () => history) } as unknown as ProvenanceService
  const cvParse = { propose: jest.fn(async () => proposal) } as unknown as CvParseService
  const controller = new ConsultantsController(
    {} as ConsultantsService,
    workspaceContext,
    {} as CreditsService,
    provenance,
    cvParse,
    {} as CvStudioService,
    {} as SkillAliasService,
    {} as WorkspaceBrandService,
    {} as never,
  )
  return { controller, provenance, cvParse }
}

describe('ConsultantsController.parseCv — traçabilité #2184.37/.38', () => {
  it('joint, par détection, la dernière revue du journal (`fieldHistory`)', async () => {
    const { controller, provenance } = makeController([auditRow({ field: 'cv_parse.skills' })])

    const result = await controller.parseCv(TALENT, { userId: USER } as never)

    expect(provenance.history).toHaveBeenCalledWith(WORKSPACE, 'consultant', TALENT)
    expect(result.fieldHistory.skills?.actorName).toBe('Jeanne Martin')
  })

  it('un journal VIDE rend `fieldHistory` vide — aucune détection revue', async () => {
    const { controller } = makeController([])

    const result = await controller.parseCv(TALENT, { userId: USER } as never)

    expect(result.fieldHistory).toEqual({})
  })

  it('ignore les lignes de COLONNE écrite (`full_name`…) — seules les lignes `cv_parse.*` comptent', async () => {
    const { controller } = makeController([auditRow({ field: 'full_name' })])

    const result = await controller.parseCv(TALENT, { userId: USER } as never)

    expect(result.fieldHistory).toEqual({})
  })
})
