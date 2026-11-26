import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { assignContactsSchema } from '@bellum/contracts'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ContactAssignmentController } from './assignment.controller'
import { ContactAssignmentService } from './contact-assignment.service'

/**
 * #2160.9 (recette 26/09, prod 058db2c5) — `PATCH /contacts/assign` répondait
 * 400, toast « L'attribution a échoué », rien ne persistait. Le corps envoyé
 * par le web (`useAssignContacts.ts` / `contactsApi.assignBulk`) est
 * `{ contact_ids, assigned_to }` : exactement la forme d'`assignContactsSchema`
 * (`packages/contracts/src/schemas/contact.ts`), pas `contactId`/`ownerId`
 * comme la piste initiale le suspectait — vérifié ici avec le VRAI pipe
 * (`ZodValidationPipe`) et le VRAI contrôleur, pas un mock qui accepterait
 * n'importe quoi. Une future dérive entre le web et l'API (rename de champ,
 * `.nullable()` retiré) ferait échouer ce test avant de refaire échouer un
 * client réel.
 */
describe('PATCH /contacts/assign — le corps EXACT envoyé par le web', () => {
  let app: INestApplication
  const assignMany = jest.fn()

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContactAssignmentController],
      providers: [{ provide: ContactAssignmentService, useValue: { assignMany } }],
    })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { userId: 'u-caller', email: 'caller@bellum-ai.com' }
          return true
        },
      })
      .overrideGuard(WorkspacePermissionGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
  })

  afterEach(() => assignMany.mockReset())

  afterAll(async () => {
    await app.close()
  })

  const webBody = (contactId: string, assignedTo: string | null) => ({
    contact_ids: [contactId],
    assigned_to: assignedTo,
  })

  it('valide contre le schéma partagé — ni contactId, ni ownerId, ni contactIds (camelCase)', () => {
    const body = webBody('550e8400-e29b-41d4-a716-446655440000', '11111111-1111-4111-8111-111111111111')
    expect(assignContactsSchema.safeParse(body).success).toBe(true)
    expect(assignContactsSchema.safeParse({ contactIds: body.contact_ids, ownerId: body.assigned_to }).success).toBe(
      false,
    )
  })

  it('attribuer à un membre (le geste qui échouait en recette) : 200, pas 400', async () => {
    assignMany.mockResolvedValue({
      assigned_to: '11111111-1111-4111-8111-111111111111',
      assigned: ['550e8400-e29b-41d4-a716-446655440000'],
      skipped: [],
    })

    const res = await request(app.getHttpServer())
      .patch('/contacts/assign')
      .send(webBody('550e8400-e29b-41d4-a716-446655440000', '11111111-1111-4111-8111-111111111111'))

    expect(res.status).toBe(200)
    expect(assignMany).toHaveBeenCalledWith(
      'u-caller',
      ['550e8400-e29b-41d4-a716-446655440000'],
      '11111111-1111-4111-8111-111111111111',
    )
  })

  it('retirer l’attribution (`assigned_to: null`) : 200', async () => {
    assignMany.mockResolvedValue({ assigned_to: null, assigned: ['550e8400-e29b-41d4-a716-446655440000'], skipped: [] })

    const res = await request(app.getHttpServer())
      .patch('/contacts/assign')
      .send(webBody('550e8400-e29b-41d4-a716-446655440000', null))

    expect(res.status).toBe(200)
    expect(assignMany).toHaveBeenCalledWith('u-caller', ['550e8400-e29b-41d4-a716-446655440000'], null)
  })

  it('un corps à l’ancienne forme (contactId singulier, ownerId) est un 400 EXPLICITE de validation, pas un crash muet', async () => {
    const res = await request(app.getHttpServer())
      .patch('/contacts/assign')
      .send({ contactId: '550e8400-e29b-41d4-a716-446655440000', ownerId: '11111111-1111-4111-8111-111111111111' })

    expect(res.status).toBe(400)
    expect(assignMany).not.toHaveBeenCalled()
  })
})
