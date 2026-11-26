import { HttpException } from '@nestjs/common'
import { ConsultantsController } from './consultants.controller'
import type { ConsultantsService } from './consultants.service'
import type { ProvenanceService } from '../crm-core/provenance.service'
import type { CvParseService } from './cv-parse.service'
import type { CvStudioService } from './cv-studio.service'
import type { SkillAliasService } from './skill-alias.service'
import type { CreditsService } from '../credits/credits.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande : la marque
 *  du PRODUIT, c'est-à-dire un espace qui n'a rien posé. */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * La réécriture de CV coûte 1 crédit (décision Louis 31/07) — c'est le seul
 * appel modèle du vivier, et il rend un livrable envoyé tel quel.
 *
 * Les deux règles qui comptent sont des règles d'HONNÊTETÉ, pas de comptabilité :
 * on refuse AVANT d'appeler le modèle quand le solde est vide (le client ne paie
 * pas une attente pour rien), et on ne débite QU'APRÈS un CV réellement produit
 * (un échec IA ne coûte rien — même règle que l'enrichissement).
 */
describe('réécriture de CV — débit d’un crédit', () => {
  const rewrite = { summary: 'CV adapté' }

  function setup(overrides: { hasCredit?: boolean; result?: unknown } = {}) {
    const consultants = {
      rewriteCv: jest.fn().mockResolvedValue(overrides.result ?? { ok: true, rewrite }),
    } as unknown as ConsultantsService
    const credits = {
      hasEnrichmentCredit: jest.fn().mockResolvedValue(overrides.hasCredit ?? true),
      consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }),
    } as unknown as CreditsService
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    } as unknown as WorkspaceContextService

    const provenance = { commit: jest.fn().mockResolvedValue(undefined) } as unknown as ProvenanceService

    return {
      controller: new ConsultantsController(
        consultants,
        workspaceContext,
        credits,
        provenance,
        { propose: jest.fn(), commit: jest.fn() } as unknown as CvParseService,
        { generate: jest.fn(), listVersions: jest.fn() } as unknown as CvStudioService,
        { observe: jest.fn().mockResolvedValue(undefined) } as unknown as SkillAliasService,
        brandsStub as never,
        {} as never,
      ),
      consultants,
      credits,
    }
  }

  const user = { userId: 'user-1' } as never
  const body = { opportunity_id: 'opp-1' } as never

  it('débite 1 crédit quand un CV est réellement produit', async () => {
    const { controller, credits } = setup()

    await expect(controller.rewriteCv('c-1', body, user)).resolves.toEqual(rewrite)

    expect(credits.consumeEnrichmentCredit).toHaveBeenCalledWith('user-1', { reason: 'cv_rewrite' })
  })

  it('refuse AVANT d’appeler le modèle quand le solde est vide (402)', async () => {
    const { controller, consultants, credits } = setup({ hasCredit: false })

    await expect(controller.rewriteCv('c-1', body, user)).rejects.toBeInstanceOf(HttpException)
    // Le point du garde : aucune seconde d'attente, aucun token dépensé.
    expect(consultants.rewriteCv).not.toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('renvoie 402, pas 500 — le client doit pouvoir agir', async () => {
    const { controller } = setup({ hasCredit: false })

    await expect(controller.rewriteCv('c-1', body, user)).rejects.toMatchObject({ status: 402 })
  })

  it('ne débite RIEN quand l’IA échoue', async () => {
    const { controller, credits } = setup({ result: { ok: false, code: 'ia_failed' } })

    await expect(controller.rewriteCv('c-1', body, user)).rejects.toBeDefined()

    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('ne débite RIEN quand le consultant n’a pas de CV source', async () => {
    const { controller, credits } = setup({ result: { ok: false, code: 'no_cv' } })

    await expect(controller.rewriteCv('c-1', body, user)).rejects.toBeDefined()

    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })
})
