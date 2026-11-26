/**
 * #3400 — la lecture d'opérateur du refus d'enrichissement, prouvée en HTTP RÉEL
 * (garde + validation globale). Ce qu'elle doit savoir dire NON : un appel sans le
 * secret interne est un 403 et le service n'est jamais atteint ; un corps sans
 * utilisateur nommé est un 400.
 */
import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ZodValidationPipe } from 'nestjs-zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { CreditsService } from './credits.service'
import { EnrichmentDiagnosticController } from './enrichment-diagnostic.controller'

const SECRET = 'internal-secret-at-least-32-chars-long-bellum'
const ROUTE = '/internal/admin/credits/enrichment-diagnostic'
const USER = '22222222-2222-4222-8222-222222222222'

describe('EnrichmentDiagnosticController — POST /internal/admin/credits/enrichment-diagnostic (e2e, #3400)', () => {
  let app: INestApplication
  let enrichmentDiagnostic: jest.Mock

  beforeAll(async () => {
    enrichmentDiagnostic = jest.fn().mockResolvedValue({ cause: 'trial_ended', creditsRemaining: 65 })
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [() => ({ internalApiSecret: SECRET })] })],
      controllers: [EnrichmentDiagnosticController],
      providers: [InternalSecretGuard, { provide: CreditsService, useValue: { enrichmentDiagnostic } }],
    }).compile()
    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => enrichmentDiagnostic.mockClear())

  it('sans le secret interne : 403, le service n’est jamais atteint', async () => {
    await request(app.getHttpServer()).post(ROUTE).send({ userId: USER }).expect(403)
    expect(enrichmentDiagnostic).not.toHaveBeenCalled()
  })

  it('sans utilisateur nommé : 400', async () => {
    await request(app.getHttpServer()).post(ROUTE).set('x-internal-secret', SECRET).send({}).expect(400)
    expect(enrichmentDiagnostic).not.toHaveBeenCalled()
  })

  it('avec le secret et un utilisateur : rend la cause lue', async () => {
    const res = await request(app.getHttpServer())
      .post(ROUTE)
      .set('x-internal-secret', SECRET)
      .send({ userId: USER })
      .expect(200)
    expect(res.body).toMatchObject({ cause: 'trial_ended', creditsRemaining: 65 })
    expect(enrichmentDiagnostic).toHaveBeenCalledWith(USER)
  })
})
