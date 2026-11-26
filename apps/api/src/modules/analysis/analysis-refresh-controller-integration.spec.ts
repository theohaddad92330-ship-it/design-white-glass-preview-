import { ConflictException } from '@nestjs/common'
import { success } from '@bellum/utils'
import { AnalysisController } from './analysis.controller'
import { AnalysisRefreshService } from './analysis-refresh.service'
import { AnalysisOnDemandService, type OnDemandFailure } from './analysis-ondemand.service'
import { CreditsService } from '../credits/credits.service'
import { createMockQueryBuilder } from '../../database/test-utils'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { RefreshAnalysisDto } from './dto/refresh-analysis.dto'

/**
 * #2130.42 (épopée #3000, porte NO-GO) — RECETTE : « le refresh ciblé d'un axe
 * ne rejoue jamais silencieusement un axe déjà à jour ». Réfuté ce lot :
 * `analysis-refresh.service.spec.ts` teste le SERVICE seul (jamais le
 * contrôleur), et aucune spec n'existe pour `AnalysisController` — la
 * traduction HTTP de `refreshed_recently` (409, jamais un 200 silencieux
 * ni un 429 qui ferait réessayer, voir `throwRefreshFailure`) n'était donc
 * vérifiée NULLE PART. Pas de scénario Playwright possible dans cet
 * environnement (aucun serveur web+api+DB monté) : ce test d'INTÉGRATION
 * appelle le VRAI contrôleur, avec le VRAI service de refresh, et ne
 * mocke que la frontière d'E/S réelle (repository + crédits + phases
 * on-demand) — même patron que `analysis-refresh.service.spec.ts`, un cran
 * plus haut (le contrôleur fait aussi partie du geste empêché).
 *
 * `AnalysisController` prend ~15 dépendances positionnelles ; seule la
 * troisième (`refreshService`) est utilisée par la route testée — les autres
 * sont des bouchons, jamais lus par ce chemin de code.
 */

const USER: CurrentUserPayload = { userId: 'u-1', email: 'sales@example.com' }

function buildController(opts: { account?: Record<string, unknown> } = {}) {
  const onDemand = {
    refreshResearch: jest.fn().mockResolvedValue(success({ refreshed: true })),
    enrichContacts: jest.fn().mockResolvedValue(success({ refreshed: true })),
    enrichOrganigram: jest.fn().mockResolvedValue(success({ refreshed: true })),
    replan: jest.fn().mockResolvedValue(success({ refreshed: true })),
  }

  const credits = {
    hasEnrichmentCredit: jest.fn().mockResolvedValue(true),
    consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 9 }),
  }

  const accounts = {
    findOne: jest.fn().mockResolvedValue(opts.account ?? { id: 'acc-1' }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
  }

  const refreshService = new AnalysisRefreshService(
    onDemand as unknown as AnalysisOnDemandService,
    credits as unknown as CreditsService,
    accounts as never,
  )

  const stub = {} as never
  const controller = new AnalysisController(
    stub, // analysisService — jamais lu par `refresh()`
    stub, // onDemandService — idem (le service de refresh porte sa PROPRE instance, injectée séparément)
    refreshService,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
    stub,
  )

  return { controller, accounts, onDemand, credits }
}

describe('AnalysisController.refresh — intégration (#2130.42, porte NO-GO)', () => {
  it('un axe jamais rafraîchi : la phase tourne, le crédit se débite — jamais un 409 sur un dossier neuf', async () => {
    const { controller, onDemand, credits } = buildController()
    const dto: RefreshAnalysisDto = { dimension: 'contacts' } as RefreshAnalysisDto

    const result = await controller.refresh('acc-1', dto, USER)

    expect(result).toMatchObject({ dimension: 'contacts' })
    expect(onDemand.enrichContacts).toHaveBeenCalledTimes(1)
    expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
  })

  // La PORTE elle-même : un axe rafraîchi il y a une minute reçoit un 409
  // (« déjà à jour »), jamais un 200 qui rejouerait la phase et débiterait un
  // second crédit pour un geste qui n'a rien de neuf à mesurer.
  it('un axe rafraîchi il y a une minute : 409, la phase ne tourne pas, aucun crédit débité', async () => {
    const oneMinuteAgo = new Date(Date.now() - 60_000)
    const { controller, onDemand, credits } = buildController({
      account: { id: 'acc-1', contacts_refreshed_at: oneMinuteAgo, contacts_refresh_lock_at: null },
    })
    const dto: RefreshAnalysisDto = { dimension: 'contacts' } as RefreshAnalysisDto

    await expect(controller.refresh('acc-1', dto, USER)).rejects.toBeInstanceOf(ConflictException)
    expect(onDemand.enrichContacts).not.toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  // Deux dimensions distinctes du MÊME compte : la porte ne ferme jamais le
  // dossier entier, seulement l'axe concerné — un refresh « signaux » reste
  // possible pendant que « contacts » est bloqué.
  it('la porte ferme l’axe demandé, jamais le dossier entier : une AUTRE dimension reste ouverte', async () => {
    const oneMinuteAgo = new Date(Date.now() - 60_000)
    const { controller, onDemand } = buildController({
      account: { id: 'acc-1', contacts_refreshed_at: oneMinuteAgo, signals_refreshed_at: null },
    })

    await expect(
      controller.refresh('acc-1', { dimension: 'contacts' } as RefreshAnalysisDto, USER),
    ).rejects.toBeInstanceOf(ConflictException)

    const result = await controller.refresh('acc-1', { dimension: 'signals' } as RefreshAnalysisDto, USER)
    expect(result).toMatchObject({ dimension: 'signals' })
    expect(onDemand.refreshResearch).toHaveBeenCalledTimes(1)
  })
})
