/**
 * GA-306 — LOT 10 : `GET /internal/telemetry/cost` n'est pas avalée par
 * `:accountId`, PROUVÉ sur le pipeline HTTP réel de Nest.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE, DÉJÀ DOCUMENTÉ DEUX FOIS DANS `internal-telemetry.controller.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Nest/Express apparient les routes dans l'ORDRE de déclaration. Une route
 * littérale (`cost`) déclarée APRÈS une route à paramètre (`:accountId`) sur le
 * même préfixe est capturée par celle-ci : `GET /internal/telemetry/cost`
 * deviendrait un appel à `detail('cost')`, qui 404 (« Analysis cost not
 * found ») — un piège déjà payé sur `kill-switches` et `source-health` dans ce
 * même contrôleur, documenté dans leurs docblocks respectifs.
 *
 * Le test qui existait déjà pour `source-health` (« does not get swallowed by
 * the :accountId route », `internal-telemetry.controller.spec.ts`) appelle
 * `controller.sourceHealth()` DIRECTEMENT — ce qui ne peut jamais détecter ce
 * défaut : appeler une méthode par son nom retrouve toujours la bonne méthode,
 * quel que soit l'ordre des décorateurs `@Get`. Seul le PIPELINE HTTP réel de
 * Nest (où vit l'algorithme d'appariement des routes) peut le voir — la même
 * leçon que GA-178 (`literal-routes-not-captured-by-params.spec.ts`) tire pour
 * les collisions inter-contrôleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Sur le VRAI contrôleur (import direct, aucune classe réécrite) : une
 *    requête HTTP réelle sur `/internal/telemetry/cost` atteint `costMetrics()`
 *    — jamais `detail()`, qui doit rester à zéro appel.
 * 2. Témoin de non-sur-déclenchement : un `:accountId` LÉGITIME (qui n'est pas
 *    `cost`) continue de résoudre par `detail()` — la garde ne casse pas le cas
 *    qu'elle ne vise pas.
 * 3. Preuve que la méthode sait dire NON : un contrôleur JUMEAU, déclaré ICI
 *    avec l'ordre INVERSÉ (le bug exact que la production évite), est monté sur
 *    le même pipeline HTTP et CAPTURE bien `cost` sous `:accountId` — ce que ce
 *    fichier détecterait si `internal-telemetry.controller.ts` régressait un
 *    jour de la même façon.
 */
import { Controller, Get, INestApplication, Param, UseGuards } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AnalysisRunsService } from './analysis-runs.service'
import { AnalysisTelemetryService } from './analysis-telemetry.service'
import { InternalTelemetryController } from './internal-telemetry.controller'
import { IaClient } from '../ia/ia.client'

/** Autorise tout — l'objet de ce fichier est l'ORDRE des routes, pas le
 *  secret interne (déjà couvert par `internal-secret.guard.e2e.spec.ts` et
 *  `manual-provisioning.controller.e2e.spec.ts`). */
const ALLOW_ALL = { canActivate: () => true }

/**
 * Le JUMEAU cassé — mêmes deux routes, ORDRE INVERSÉ. Aucune classe de
 * production n'est modifiée : ce contrôleur n'existe que pour prouver que la
 * méthode de test employée ci-dessous détecte réellement le défaut qu'elle dit
 * garder, sur le MÊME mécanisme Nest (pas une simulation à côté).
 */
@Controller('internal/telemetry')
@UseGuards(InternalSecretGuard)
class ReorderedTelemetryDouble {
  @Get(':accountId')
  detail(@Param('accountId') accountId: string) {
    return { kind: 'detail', echoAccountId: accountId }
  }

  @Get('cost')
  costMetrics() {
    return { kind: 'cost', reachable: true }
  }
}

async function bootstrap(
  controller: typeof InternalTelemetryController | typeof ReorderedTelemetryDouble,
  overrides: { telemetry?: object; runs?: object; ia?: object } = {},
): Promise<{ app: INestApplication; getDetail: jest.Mock }> {
  const getDetail = jest.fn().mockResolvedValue({ accountId: 'acc-real', companyName: 'SNCF' })

  const moduleRef = await Test.createTestingModule({
    controllers: [controller],
    providers: [
      { provide: AnalysisTelemetryService, useValue: { getRecent: jest.fn(), getDetail, ...overrides.telemetry } },
      { provide: AnalysisRunsService, useValue: { sourceHealthReport: jest.fn(), ...overrides.runs } },
      {
        provide: IaClient,
        useValue: { killSwitches: jest.fn(), costMetrics: jest.fn().mockResolvedValue(null), ...overrides.ia },
      },
    ],
  })
    .overrideGuard(InternalSecretGuard)
    .useValue(ALLOW_ALL)
    .compile()

  const app = moduleRef.createNestApplication()
  await app.init()
  return { app, getDetail }
}

describe('GA-306 — /internal/telemetry/cost n’est pas avalée par :accountId (pipeline HTTP réel)', () => {
  let app: INestApplication | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('1. le VRAI contrôleur route `cost` vers costMetrics(), jamais vers detail()', async () => {
    let getDetail: jest.Mock
    ;({ app, getDetail } = await bootstrap(InternalTelemetryController))

    const res = await request(app.getHttpServer()).get('/internal/telemetry/cost')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('reachable')
    // Le fait décisif : si `:accountId` avait capturé la requête, `getDetail`
    // aurait été appelé avec `'cost'` comme identifiant de compte.
    expect(getDetail).not.toHaveBeenCalled()
  })

  it('2. témoin — un :accountId LÉGITIME continue de résoudre par detail() (pas de sur-déclenchement)', async () => {
    let getDetail: jest.Mock
    ;({ app, getDetail } = await bootstrap(InternalTelemetryController))

    const res = await request(app.getHttpServer()).get('/internal/telemetry/acc-real')

    expect(res.status).toBe(200)
    expect(getDetail).toHaveBeenCalledWith('acc-real')
    expect(res.body).toMatchObject({ accountId: 'acc-real', companyName: 'SNCF' })
  })

  it('3. sait dire NON — le jumeau à l’ordre INVERSÉ capture bien `cost` sous :accountId', async () => {
    ;({ app } = await bootstrap(ReorderedTelemetryDouble))

    const res = await request(app.getHttpServer()).get('/internal/telemetry/cost')

    // La preuve que cette méthode de test a un pouvoir discriminant réel : sur
    // l'ordre INVERSÉ, la même requête HTTP tombe dans `detail()`, pas
    // `costMetrics()` — c'est EXACTEMENT le 404 trompeur que la production évite.
    expect(res.body).toEqual({ kind: 'detail', echoAccountId: 'cost' })
    expect(res.body).not.toMatchObject({ kind: 'cost' })
  })
})
