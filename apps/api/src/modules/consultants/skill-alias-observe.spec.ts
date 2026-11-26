import { ConsultantsController } from './consultants.controller'
import type { ConsultantsService } from './consultants.service'
import type { ProvenanceService } from '../crm-core/provenance.service'
import type { CvParseService } from './cv-parse.service'
import type { CvStudioService } from './cv-studio.service'
import type { SkillAliasService } from './skill-alias.service'
import type { CreditsService } from '../credits/credits.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { unknownSkillTerms } from './skill-seed'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande : la marque
 *  du PRODUIT, c'est-à-dire un espace qui n'a rien posé. */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * Ce que le référentiel ne comprend pas doit REMONTER (PDF 3 §5.3).
 *
 * Trouvé en recette : la file d'alias n'était nourrie que par la saisie d'une
 * compétence une par une. Une fiche remplie ou un CV relu y déposaient zéro
 * terme — donc des profils introuvables par la recherche, sans que rien ne le
 * dise.
 */
const USER = 'u0000000-0000-4000-8000-000000000001'

function makeController() {
  const observe = jest.fn().mockResolvedValue(undefined)
  const controller = new ConsultantsController(
    {
      create: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn().mockResolvedValue({ consultant: { id: 'c1' }, changes: [] }),
    } as unknown as ConsultantsService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as unknown as WorkspaceContextService,
    {} as unknown as CreditsService,
    { commit: jest.fn().mockResolvedValue(undefined) } as unknown as ProvenanceService,
    { propose: jest.fn(), commit: jest.fn() } as unknown as CvParseService,
    { generate: jest.fn(), listVersions: jest.fn() } as unknown as CvStudioService,
    { observe } as unknown as SkillAliasService,
    brandsStub as never,
    {} as never,
  )
  return { controller, observe }
}

describe('unknownSkillTerms', () => {
  it('ne retient que ce que le référentiel ne reconnaît pas', () => {
    expect(unknownSkillTerms(['Kubernetes', 'k8s', 'Outil maison Zephyr'])).toEqual(['Outil maison Zephyr'])
  })

  it('rend le libellé ÉCRIT — c’est un humain qui tranche', () => {
    expect(unknownSkillTerms(['Framework Interne ACME'])).toEqual(['Framework Interne ACME'])
  })

  it('déduplique sur la forme normalisée', () => {
    expect(unknownSkillTerms(['Zephyr', 'zephyr', 'ZEPHYR'])).toHaveLength(1)
  })
})

describe('ConsultantsController — file d’alias', () => {
  it('dépose les termes inconnus d’une fiche créée', async () => {
    const { controller, observe } = makeController()
    await controller.create(
      { fullName: 'Nadia', stack: ['Kubernetes', 'Outil maison Zephyr'] } as never,
      {
        userId: USER,
      } as never,
    )
    expect(observe).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledWith('ws-1', 'Outil maison Zephyr', USER)
  })

  it('dépose les termes inconnus d’une fiche modifiée', async () => {
    const { controller, observe } = makeController()
    await controller.update(
      'c1',
      { fullName: 'Nadia', stack: ['Framework Interne ACME'] } as never,
      {
        userId: USER,
      } as never,
    )
    expect(observe).toHaveBeenCalledWith('ws-1', 'Framework Interne ACME', USER)
  })

  it('ne dépose RIEN quand tout est déjà reconnu', async () => {
    const { controller, observe } = makeController()
    await controller.create({ fullName: 'Nadia', stack: ['Kubernetes', 'k8s'] } as never, { userId: USER } as never)
    expect(observe).not.toHaveBeenCalled()
  })
})
