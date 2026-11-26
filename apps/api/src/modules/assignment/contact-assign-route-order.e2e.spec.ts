import { ExecutionContext, INestApplication, Type } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { JwtGuard } from '../auth/jwt.guard'
import { ContactRecordController } from '../crm-core/crm-core.controller'
import { FieldConflictService } from '../crm-core/field-conflict.service'
import { ProvenanceService } from '../crm-core/provenance.service'
import { RecordEditService } from '../crm-core/record-edit.service'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ContactAssignmentController } from './assignment.controller'
import { ContactAssignmentService } from './contact-assignment.service'

/**
 * #2160.9 / #4504.3 — `PATCH /contacts/assign` répondait 400 en prod
 * (`Unrecognized keys: "contact_ids", "assigned_to"`) : `ContactsModule` importe
 * `CrmCoreModule`, enregistré AVANT `AssignmentModule`, et son `@Patch(':id')`
 * (corps `.strict()`) captait « assign » comme un id. Masqué depuis #944 ;
 * b93fb9c698 (#2160) avait mal diagnostiqué (corps mal formé).
 *
 * Les routes sont enregistrées dans l'ordre des modules : `app.module.ts` liste
 * `AssignmentModule` AVANT `ContactsModule` (→ CrmCore), et GA-178 le garde.
 * Ce test rejoue l'ordre CORRIGÉ avec le vrai pipe, et prouve que l'ordre
 * inverse reproduit le 400 — c'est ce qui rend l'ordre non négociable.
 */
const uuid = '550e8400-e29b-41d4-a716-446655440000'
const assignMany = jest.fn()
const patchContact = jest.fn()

async function mount(controllers: Type<unknown>[]): Promise<INestApplication> {
  const allow = {
    canActivate: (ctx: ExecutionContext) => {
      ctx.switchToHttp().getRequest().user = { userId: 'u-caller', email: 'caller@bellum-ai.com' }
      return true
    },
  }
  const moduleRef = await Test.createTestingModule({
    controllers,
    providers: [
      { provide: ContactAssignmentService, useValue: { assignMany } },
      { provide: RecordEditService, useValue: { patchContact } },
      { provide: ProvenanceService, useValue: {} },
      { provide: FieldConflictService, useValue: {} },
      { provide: WorkspaceContextService, useValue: {} },
    ],
  })
    .overrideGuard(JwtGuard)
    .useValue(allow)
    .overrideGuard(PlanFeatureGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(WorkspacePermissionGuard)
    .useValue({ canActivate: () => true })
    .compile()
  const app = moduleRef.createNestApplication()
  app.useGlobalPipes(new ZodValidationPipe())
  await app.init()
  return app
}

afterEach(() => {
  assignMany.mockReset()
  patchContact.mockReset()
})

describe('PATCH /contacts/assign — AssignmentModule enregistré AVANT CrmCore (ordre d’app.module.ts)', () => {
  let app: INestApplication
  beforeAll(async () => {
    app = await mount([ContactAssignmentController, ContactRecordController])
  })
  afterAll(async () => {
    await app.close()
  })

  it('le corps du web atteint assignMany, pas le PATCH :id strict', async () => {
    assignMany.mockResolvedValue({ assigned_to: null, assigned: [uuid], skipped: [] })
    const res = await request(app.getHttpServer())
      .patch('/contacts/assign')
      .send({ contact_ids: [uuid], assigned_to: null })
    expect(res.status).toBe(200)
    expect(assignMany).toHaveBeenCalledWith('u-caller', [uuid], null)
    expect(patchContact).not.toHaveBeenCalled()
  })

  it('PATCH /contacts/:uuid reste routé vers la fiche contact', async () => {
    patchContact.mockResolvedValue({ ok: true })
    const res = await request(app.getHttpServer()).patch(`/contacts/${uuid}`).send({ title: 'CTO' })
    expect(res.status).toBe(200)
    expect(patchContact).toHaveBeenCalled()
    expect(assignMany).not.toHaveBeenCalled()
  })
})

describe('PATCH /contacts/assign — CrmCore d’abord (la panne de prod)', () => {
  let app: INestApplication
  beforeAll(async () => {
    app = await mount([ContactRecordController, ContactAssignmentController])
  })
  afterAll(async () => {
    await app.close()
  })

  it('sait dire NON : `:id` capte « assign » → 400, assignMany jamais appelé', async () => {
    const res = await request(app.getHttpServer())
      .patch('/contacts/assign')
      .send({ contact_ids: [uuid], assigned_to: null })
    expect(res.status).toBe(400)
    expect(assignMany).not.toHaveBeenCalled()
  })
})
