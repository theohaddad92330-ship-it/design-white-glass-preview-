/**
 * manual-provisioning.controller.e2e.spec.ts — the auth invariant of the
 * client-provisioning surface, proven over real HTTP rather than by reading
 * decorator metadata.
 *
 * This controller creates auth accounts and grants quota across every tenant.
 * The existing admin specs assert only that `InternalSecretGuard` is *present*
 * in the class metadata — which would still pass if the guard were bound but
 * never actually rejected a request. These tests exercise the composed
 * pipeline: no header / wrong secret / right secret.
 */
import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ZodValidationPipe } from 'nestjs-zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ManualProvisioningController } from './manual-provisioning.controller'
import { ManualProvisioningService } from './manual-provisioning.service'

const SECRET = 'internal-secret-at-least-32-chars-long-bellum'

/** A payload that passes zod, so a 4xx can only come from the guard. */
const validPayload = {
  esnName: 'Skaizen',
  owner: { email: 'theo@skaizen.fr' },
  plan: 'team',
  billing: { amountCents: 259000, period: 'yearly', startDate: '2026-08-01' },
}

describe('ManualProvisioningController (e2e — auth)', () => {
  let app: INestApplication
  let provisionClient: jest.Mock
  let previewProvisioning: jest.Mock
  let listManualClients: jest.Mock
  let recordInvoice: jest.Mock
  let updateInvoice: jest.Mock

  beforeAll(async () => {
    provisionClient = jest.fn().mockResolvedValue({ workspaceId: 'ws-1', fullyNotified: true })
    previewProvisioning = jest.fn().mockResolvedValue({ steps: [], blockers: [] })
    listManualClients = jest.fn().mockResolvedValue([])
    recordInvoice = jest.fn().mockResolvedValue({ id: 'inv-1', reference: 'F-2026-006' })
    updateInvoice = jest.fn().mockResolvedValue({ id: 'inv-1', reference: 'F-2026-006' })

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [() => ({ internalApiSecret: SECRET })] })],
      controllers: [ManualProvisioningController],
      providers: [
        InternalSecretGuard,
        {
          provide: ManualProvisioningService,
          useValue: {
            provisionClient,
            previewProvisioning,
            listManualClients,
            updateTerms: jest.fn(),
            listInvoices: jest.fn().mockResolvedValue([]),
            recordInvoice,
            updateInvoice,
          },
        },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    // Mirrors `main.ts` — validation is global there, so the spec must not be
    // more permissive than production.
    app.useGlobalPipes(new ZodValidationPipe())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    provisionClient.mockClear()
    previewProvisioning.mockClear()
    listManualClients.mockClear()
    recordInvoice.mockClear()
    updateInvoice.mockClear()
  })

  describe('without the internal secret', () => {
    it('rejects provisioning outright — no account is created', async () => {
      await request(app.getHttpServer()).post('/internal/admin/clients/provision').send(validPayload).expect(403)
      expect(provisionClient).not.toHaveBeenCalled()
    })

    it('rejects a wrong secret of the same length (no timing oracle, no access)', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision')
        .set('x-internal-secret', 'X'.repeat(SECRET.length))
        .send(validPayload)
        .expect(403)
      expect(provisionClient).not.toHaveBeenCalled()
    })

    it('rejects a wrong secret of a different length', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision')
        .set('x-internal-secret', 'nope')
        .send(validPayload)
        .expect(403)
      expect(provisionClient).not.toHaveBeenCalled()
    })

    it('ne laisse pas non plus PRÉVISUALISER — l’aperçu lit l’état de tous les clients', async () => {
      // Il n'écrit rien, mais il RÉPOND : « ce compte existe déjà », « il porte
      // un abonnement Stripe ». C'est un oracle d'existence de comptes, et il
      // est gardé comme l'écriture qu'il précède.
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision/preview')
        .send(validPayload)
        .expect(403)
      expect(previewProvisioning).not.toHaveBeenCalled()
    })

    it('does not leak the client list', async () => {
      await request(app.getHttpServer()).get('/internal/admin/clients/manual').expect(403)
      expect(listManualClients).not.toHaveBeenCalled()
    })

    it('does not let the billing terms be edited', async () => {
      await request(app.getHttpServer())
        .patch('/internal/admin/clients/manual/ws-1')
        .send({ commitmentMonths: 3 })
        .expect(403)
    })

    it('does not let an invoice be recorded — the ledger is the alerting evidence', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/clients/manual/ws-1/invoices')
        .send({ reference: 'F-2026-006' })
        .expect(403)
      expect(recordInvoice).not.toHaveBeenCalled()
    })

    it('does not let an invoice be cashed in', async () => {
      await request(app.getHttpServer())
        .patch('/internal/admin/clients/manual/invoices/inv-1')
        .send({ paymentStatus: 'paid' })
        .expect(403)
      expect(updateInvoice).not.toHaveBeenCalled()
    })
  })

  describe('with the internal secret', () => {
    it('provisions', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision')
        .set('x-internal-secret', SECRET)
        .send(validPayload)
        .expect(201)
      expect(provisionClient).toHaveBeenCalledTimes(1)
    })

    it('prévisualise SANS provisionner — la route littérale n’est capturée par aucun `:param`', async () => {
      // `clients/provision/preview` (trois segments) contre
      // `clients/manual/:workspaceId` (trois aussi) : les littéraux diffèrent au
      // deuxième segment, donc aucune capture. Nest ordonne par module et non
      // par spécificité — ce dépôt a déjà payé une route littérale avalée par le
      // `:id` d'un voisin, alors on le PROUVE plutôt que de le raisonner.
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision/preview')
        .set('x-internal-secret', SECRET)
        .send(validPayload)
        .expect(201)
      expect(previewProvisioning).toHaveBeenCalledTimes(1)
      // T2 — l'aperçu n'a rien provisionné.
      expect(provisionClient).not.toHaveBeenCalled()
    })

    it('l’aperçu passe par le MÊME zod que l’écriture — pas d’aperçu sur une saisie invalide', async () => {
      // Un aperçu plus permissif décrirait une opération que la validation
      // refuserait ensuite : l'opérateur validerait un récapitulatif faux.
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision/preview')
        .set('x-internal-secret', SECRET)
        .send({ ...validPayload, plan: 'trial' })
        .expect(400)
      expect(previewProvisioning).not.toHaveBeenCalled()
    })

    it('accepte l’auteur de l’opération, et refuse un rôle inventé', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision')
        .set('x-internal-secret', SECRET)
        .send({ ...validPayload, actor: { email: 'louis@bellum-it.com', role: 'owner' } })
        .expect(201)
      expect(provisionClient).toHaveBeenCalledWith(
        expect.objectContaining({ actor: { email: 'louis@bellum-it.com', role: 'owner' } }),
      )

      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision')
        .set('x-internal-secret', SECRET)
        .send({ ...validPayload, actor: { email: 'louis@bellum-it.com', role: 'superadmin' } })
        .expect(400)
    })

    it('still validates the body — an authenticated operator cannot skip zod', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision')
        .set('x-internal-secret', SECRET)
        .send({ ...validPayload, owner: { email: 'not-an-email' } })
        .expect(400)
      expect(provisionClient).not.toHaveBeenCalled()
    })

    it('refuses `trial` as a manual plan (it would never refill)', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/clients/provision')
        .set('x-internal-secret', SECRET)
        .send({ ...validPayload, plan: 'trial' })
        .expect(400)
      expect(provisionClient).not.toHaveBeenCalled()
    })

    it('records an invoice, and its literal route is not swallowed by the :workspaceId one', async () => {
      // `clients/manual/invoices/:id` (quatre segments) et
      // `clients/manual/:workspaceId` (trois) ne peuvent pas se capturer — mais
      // Nest ordonne par module, pas par spécificité : on le PROUVE.
      await request(app.getHttpServer())
        .post('/internal/admin/clients/manual/ws-1/invoices')
        .set('x-internal-secret', SECRET)
        .send({ reference: 'F-2026-006', paymentStatus: 'paid' })
        .expect(201)
      expect(recordInvoice).toHaveBeenCalledWith('ws-1', expect.objectContaining({ reference: 'F-2026-006' }))

      await request(app.getHttpServer())
        .patch('/internal/admin/clients/manual/invoices/inv-1')
        .set('x-internal-secret', SECRET)
        .send({ paymentStatus: 'paid' })
        .expect(200)
      expect(updateInvoice).toHaveBeenCalledWith('inv-1', expect.objectContaining({ paymentStatus: 'paid' }))
    })

    it('refuses an invoice with no reference — a document nobody could find', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/clients/manual/ws-1/invoices')
        .set('x-internal-secret', SECRET)
        .send({ paymentStatus: 'paid' })
        .expect(400)
      expect(recordInvoice).not.toHaveBeenCalled()
    })

    it('lists', async () => {
      await request(app.getHttpServer())
        .get('/internal/admin/clients/manual')
        .set('x-internal-secret', SECRET)
        .expect(200)
      expect(listManualClients).toHaveBeenCalledTimes(1)
    })
  })
})
