/**
 * #4599.4 — la porte d'ADMIN D'ESPACE du rattrapage des adresses gabarit, prouvée en HTTP réel, par le REFUS :
 * non connecté (401), membre simple (403), `sales_ops` (403 : `team:manage` ne suffit pas, c'est un geste
 * propriétaire/admin), un autre espace que le sien (403). Le propriétaire et l'admin simulent puis exécutent, borné à 100.
 */
import { ForbiddenException, type INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ZodValidationPipe } from 'nestjs-zod'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { PlaceholderEmailCatchupService } from './placeholder-email-catchup.service'
import { WorkspacePlaceholderEmailCatchupController } from './workspace-placeholder-email-catchup.controller'

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
// Le garde de permission est le VRAI (`can()` de @bellum/contracts) : seul le rôle résolu est simulé.
const ROLES: Record<string, string> = {
  'u-owner': 'owner',
  'u-admin': 'admin',
  'u-member': 'member',
  'u-ops': 'sales_ops',
}

describe('WorkspacePlaceholderEmailCatchupController — POST /contacts/placeholder-email-catchup (e2e)', () => {
  let app: INestApplication
  const run = jest.fn()

  beforeAll(async () => {
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn(async (userId: string) => ({ workspaceId: WS_A, role: ROLES[userId] })),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
      workspaceRuleRefusing: jest.fn().mockResolvedValue(null),
      recordDataExit: jest.fn(),
      assertRole: jest.fn(async (userId: string, workspaceId: string, allowed: string[]) => {
        if (workspaceId !== WS_A) throw new ForbiddenException('Accès refusé à cet espace')
        if (!allowed.includes(ROLES[userId] ?? '')) throw new ForbiddenException('Rôle insuffisant pour cette action')
      }),
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [WorkspacePlaceholderEmailCatchupController],
      providers: [
        WorkspacePermissionGuard,
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: PlaceholderEmailCatchupService, useValue: { run } },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
          const req = ctx.switchToHttp().getRequest()
          const userId = (req['headers'] as Record<string, string | undefined>)['x-test-user']
          if (!userId) throw new UnauthorizedException('Token invalide ou expiré')
          req['user'] = { userId }
          return true
        },
      })
      .compile()
    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
  })

  afterAll(async () => app.close())

  beforeEach(() => {
    run.mockReset()
    run.mockResolvedValue({ dry_run: true, examined: 12, cleared: 10, skipped: 0, limit_reached: false })
  })

  const post = (user: string | null, body: Record<string, unknown> = {}) => {
    const r = request(app.getHttpServer()).post('/contacts/placeholder-email-catchup')
    return (user ? r.set('x-test-user', user) : r).send(body)
  }

  it('REFUS — non connecté : 401, rien lu', async () => {
    await post(null).expect(401)
    expect(run).not.toHaveBeenCalled()
  })

  it('REFUS — membre simple : 403, rien lu', async () => {
    await post('u-member').expect(403)
    expect(run).not.toHaveBeenCalled()
  })

  it('REFUS — sales_ops (team:manage) : 403, le geste est propriétaire/admin', async () => {
    await post('u-ops').expect(403)
    expect(run).not.toHaveBeenCalled()
  })

  it('REFUS — un autre espace que le sien : 403, rien lu', async () => {
    await post('u-owner', { workspaceId: WS_B }).expect(403)
    await post('u-owner', { workspaceId: WS_B, dryRun: false }).expect(403)
    expect(run).not.toHaveBeenCalled()
  })

  it('REFUS — `dryRun` non booléen (« false » en chaîne) : 400, jamais une exécution par accident', async () => {
    await post('u-owner', { dryRun: 'false' }).expect(400)
    expect(run).not.toHaveBeenCalled()
  })

  it('le propriétaire SIMULE par défaut, sur SON espace (tenant lu de la session)', async () => {
    const res = await post('u-owner').expect(200)
    expect(run).toHaveBeenCalledWith({ workspaceId: WS_A, dryRun: true, limit: 100 })
    expect(res.body).toEqual(expect.objectContaining({ dry_run: true, cleared: 10, limit: 100 }))
  })

  it("l'admin EXÉCUTE explicitement, borné à 100 fiches, et peut nommer son propre espace", async () => {
    run.mockResolvedValue({ dry_run: false, examined: 30, cleared: 10, skipped: 1, limit_reached: false })
    await post('u-admin', { dryRun: false, workspaceId: WS_A }).expect(200)
    expect(run).toHaveBeenCalledWith({ workspaceId: WS_A, dryRun: false, limit: 100 })
  })
})
