/**
 * #2650.2 — la porte d'opérateur du remboursement des rafraîchissements déjà
 * payés dans les 6 h, prouvée en HTTP RÉEL (garde + validation globale), pas
 * en appelant la méthode du contrôleur.
 *
 * Ce qu'elle doit savoir dire NON : un appel sans le secret interne — y
 * compris celui d'un utilisateur connecté qui porte son jeton — est un 403,
 * et le service n'est jamais atteint. Un corps qui ne nomme pas UN espace
 * explicite est un 400 : jamais de balayage du parc.
 */
import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ZodValidationPipe } from 'nestjs-zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { RefreshRefundController } from './refresh-refund.controller'
import { RefreshRefundService } from './refresh-refund.service'

const SECRET = 'internal-secret-at-least-32-chars-long-bellum'
const ROUTE = '/internal/admin/credits/refresh-refunds'
const WS = '11111111-1111-4111-8111-111111111111'

describe('RefreshRefundController — POST /internal/admin/credits/refresh-refunds (e2e, #2650.2)', () => {
  let app: INestApplication
  let run: jest.Mock

  beforeAll(async () => {
    run = jest.fn().mockImplementation(async (workspaceId: string, options: { dryRun: boolean }) => ({
      workspaceId,
      dryRun: options.dryRun,
      refunds: [],
      totalCredits: 0,
      alreadyRefunded: [],
      skipped: [],
    }))
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [() => ({ internalApiSecret: SECRET })] })],
      controllers: [RefreshRefundController],
      providers: [InternalSecretGuard, { provide: RefreshRefundService, useValue: { run } }],
    }).compile()

    app = moduleRef.createNestApplication()
    // Même validation globale que main.ts — le test n'est pas plus permissif que la prod.
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    run.mockClear()
  })

  describe('non-admin = 403, le service n’est jamais atteint', () => {
    it('sans secret', async () => {
      await request(app.getHttpServer()).post(ROUTE).send({ workspaceId: WS }).expect(403)
      expect(run).not.toHaveBeenCalled()
    })

    it('un utilisateur connecté (jeton de session) sans secret interne', async () => {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature')
        .send({ workspaceId: WS, dryRun: false })
        .expect(403)
      expect(run).not.toHaveBeenCalled()
    })

    it('un mauvais secret', async () => {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-internal-secret', 'internal-secret-at-least-32-chars-long-WRONG')
        .send({ workspaceId: WS, dryRun: false })
        .expect(403)
      expect(run).not.toHaveBeenCalled()
    })
  })

  describe('un espace EXPLICITE, jamais tout le parc', () => {
    it('sans corps : 400', async () => {
      await request(app.getHttpServer()).post(ROUTE).set('x-internal-secret', SECRET).expect(400)
      expect(run).not.toHaveBeenCalled()
    })

    it('un workspaceId qui n’est pas un uuid : 400', async () => {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-internal-secret', SECRET)
        .send({ workspaceId: 'all' })
        .expect(400)
      expect(run).not.toHaveBeenCalled()
    })

    it('un champ inconnu est refusé (liste blanche stricte) : 400', async () => {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-internal-secret', SECRET)
        .send({ workspaceId: WS, amount: 500 })
        .expect(400)
      expect(run).not.toHaveBeenCalled()
    })

    it('dryRun en CHAÎNE ("false") est refusé — jamais converti en vrai remboursement', async () => {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-internal-secret', SECRET)
        .send({ workspaceId: WS, dryRun: 'false' })
        .expect(400)
      expect(run).not.toHaveBeenCalled()
    })
  })

  describe('dryRun d’abord', () => {
    it('sans dryRun explicite, c’est un dryRun — le mode réel se DEMANDE', async () => {
      const res = await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-internal-secret', SECRET)
        .send({ workspaceId: WS })
        .expect(200)
      expect(run).toHaveBeenCalledWith(WS, { dryRun: true, actor: 'backoffice' })
      expect(res.body).toMatchObject({ workspaceId: WS, dryRun: true })
    })

    it('dryRun: false déclenche le mode réel, avec l’opérateur nommé', async () => {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-internal-secret', SECRET)
        .send({ workspaceId: WS, dryRun: false, actor: 'louis' })
        .expect(200)
      expect(run).toHaveBeenCalledWith(WS, { dryRun: false, actor: 'louis' })
    })
  })
})
