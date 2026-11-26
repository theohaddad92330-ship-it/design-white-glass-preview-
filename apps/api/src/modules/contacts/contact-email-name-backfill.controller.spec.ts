import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ConfigService } from '@nestjs/config'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ContactEmailNameBackfillController } from './contact-email-name-backfill.controller'
import { ContactEmailNameBackfillService } from './contact-email-name-backfill.service'

const SECRET = 'secret-interne-de-test'
const WORKSPACE = 'a0000000-0000-4000-8000-000000000001'
const ROUTE = '/internal/admin/contacts/email-name-backfill'

describe('#4586.2 — la route de rattrapage des noms tirés de l’e-mail est INTERNE', () => {
  let app: INestApplication
  const run = jest.fn().mockResolvedValue({ dryRun: true, candidates: 3 })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContactEmailNameBackfillController],
      providers: [
        { provide: ContactEmailNameBackfillService, useValue: { run } },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => (key === 'internalApiSecret' ? SECRET : undefined) },
        },
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => run.mockClear())

  it('est derrière InternalSecretGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ContactEmailNameBackfillController)).toContain(InternalSecretGuard)
  })

  it('SAIT DIRE NON : un utilisateur ordinaire (jeton de session, sans secret interne) est REFUSÉ, le service n’est pas appelé', async () => {
    const res = await request(app.getHttpServer())
      .post(ROUTE)
      .set('Authorization', 'Bearer jeton-utilisateur-ordinaire')
      .send({ workspaceId: WORKSPACE })
    expect(res.status).toBe(403)
    expect(run).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON : un mauvais secret est refusé', async () => {
    const res = await request(app.getHttpServer())
      .post(ROUTE)
      .set('x-internal-secret', 'pas-le-bon-secret-interne')
      .send({ workspaceId: WORKSPACE })
    expect(res.status).toBe(403)
    expect(run).not.toHaveBeenCalled()
  })

  it('avec le secret : SIMULATION par défaut (dryRun true) sur UN espace', async () => {
    const res = await request(app.getHttpServer())
      .post(ROUTE)
      .set('x-internal-secret', SECRET)
      .send({ workspaceId: WORKSPACE })
    expect(res.status).toBe(200)
    expect(run).toHaveBeenCalledWith(WORKSPACE, { dryRun: true })
  })
})
