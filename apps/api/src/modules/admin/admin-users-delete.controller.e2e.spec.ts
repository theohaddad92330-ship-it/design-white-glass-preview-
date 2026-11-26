/**
 * admin-users-delete.controller.e2e.spec.ts — the confirmation gate on
 * irreversible user deletion (#1664.2), proven over real HTTP rather than by
 * calling the controller method directly.
 *
 * Before this lot, `DELETE /internal/admin/users/:userId` took NO body at
 * all: `AdminUsersController.deleteUser` had a single `@Param` and nothing
 * stood between "the request reached the guard" and "the Supabase auth user
 * is gone". The only confirmation lived in the `dashboard-manager` React
 * component (typing "SUPPRIMER") — anyone with the internal secret could call
 * the API directly and skip it entirely. This spec proves the SERVER now
 * refuses a deletion that doesn't carry the same confirmation word, exactly
 * like the manual-provisioning auth invariant spec proves the guard over real
 * HTTP rather than decorator metadata.
 */
import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ZodValidationPipe } from 'nestjs-zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminIdentityService } from './admin-identity.service'
import { AdminUsersController } from './admin-users.controller'
import { AdminUsersService } from './admin-users.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

const SECRET = 'internal-secret-at-least-32-chars-long-bellum'

describe('AdminUsersController — DELETE /users/:userId confirmation gate (e2e)', () => {
  let app: INestApplication
  let deleteUser: jest.Mock

  beforeAll(async () => {
    deleteUser = jest.fn().mockResolvedValue({ deleted: true, userId: 'u1' })

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [() => ({ internalApiSecret: SECRET })] })],
      controllers: [AdminUsersController],
      providers: [
        InternalSecretGuard,
        {
          provide: AdminUsersService,
          useValue: {
            getUserDetail: jest.fn(),
            suspendUser: jest.fn(),
            unsuspendUser: jest.fn(),
            deleteUser,
            generateResetLink: jest.fn(),
            grantCredits: jest.fn(),
          },
        },
        {
          provide: AdminIdentityService,
          useValue: { findDuplicates: jest.fn(), mergeIdentities: jest.fn() },
        },
        {
          provide: WorkspaceContextService,
          useValue: { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: null }) },
        },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    // Mirrors main.ts — validation is global there, so the spec must not be
    // more permissive than production.
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    deleteUser.mockClear()
  })

  it('refuses a deletion with NO body at all — nothing is deleted', async () => {
    await request(app.getHttpServer()).delete('/internal/admin/users/u1').set('x-internal-secret', SECRET).expect(400)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('refuses a deletion with an empty body — nothing is deleted', async () => {
    await request(app.getHttpServer())
      .delete('/internal/admin/users/u1')
      .set('x-internal-secret', SECRET)
      .send({})
      .expect(400)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('refuses a deletion with the WRONG confirmation word — nothing is deleted', async () => {
    await request(app.getHttpServer())
      .delete('/internal/admin/users/u1')
      .set('x-internal-secret', SECRET)
      .send({ confirm: 'oui' })
      .expect(400)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('refuses a deletion where confirm is right but lowercase — the word must match exactly', async () => {
    await request(app.getHttpServer())
      .delete('/internal/admin/users/u1')
      .set('x-internal-secret', SECRET)
      .send({ confirm: 'supprimer' })
      .expect(400)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('deletes when the exact confirmation word is provided', async () => {
    const res = await request(app.getHttpServer())
      .delete('/internal/admin/users/u1')
      .set('x-internal-secret', SECRET)
      .send({ confirm: 'SUPPRIMER' })
      .expect(200)
    expect(deleteUser).toHaveBeenCalledWith('u1')
    expect(res.body).toEqual({ deleted: true, userId: 'u1' })
  })

  it('still requires the internal secret even with a valid confirmation', async () => {
    await request(app.getHttpServer()).delete('/internal/admin/users/u1').send({ confirm: 'SUPPRIMER' }).expect(403)
    expect(deleteUser).not.toHaveBeenCalled()
  })
})
