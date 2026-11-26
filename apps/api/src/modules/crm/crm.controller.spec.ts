import { CrmController } from './crm.controller'
import type { CrmService } from './crm.service'
import type { ExportContactDto } from './dto/crm.dto'

/**
 * #1959.4 / #1959.6 — LE CHAT APPELLE `POST /crm/hubspot/export` EN DIRECT
 * (`crmApi.exportContact` depuis `PendingActions.tsx`), sans passer par le
 * routeur d'actions (`dispatchIdempotent`). La porte `OutboundWriteService`
 * savait déjà dédupliquer par `idempotencyKey` (elle sert les écritures
 * système) — mais ce endpoint ne la lui transmettait JAMAIS : un double clic
 * ou deux onglets créaient deux fiches dans le CRM connecté.
 *
 * Témoin d'avant ce lot (pour mémoire, prouvé par lecture du code retiré) :
 * `this.crm.exportContact(user.userId, dto)` n'appelait `exportContact` qu'à
 * DEUX arguments — `gate` restait `undefined`, donc `idempotencyKey` ne
 * pouvait jamais atteindre `OutboundWriteService.request`.
 */
describe('CrmController — export (#1959.4 / #1959.6)', () => {
  function controllerWith(exportContact: jest.Mock) {
    const crm = { exportContact } as unknown as CrmService
    return new CrmController(
      crm,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
  }

  it('transmet idempotencyKey du corps de la requête à la porte (gate), pas seulement au payload CRM', async () => {
    const exportContact = jest.fn().mockResolvedValue({ id: 'c1', created: true })
    const controller = controllerWith(exportContact)
    const dto = { email: 'jo@acme.com', idempotencyKey: 'gesture-1' } as ExportContactDto

    await controller.export({ userId: 'u1' } as never, dto)

    expect(exportContact).toHaveBeenCalledWith('u1', dto, { origin: 'user', idempotencyKey: 'gesture-1' })
  })

  it('sans clé, un appelant plus ancien obtient le comportement byte-identique à avant (origin user, clé absente)', async () => {
    const exportContact = jest.fn().mockResolvedValue({ id: 'c1', created: true })
    const controller = controllerWith(exportContact)
    const dto = { email: 'jo@acme.com' } as ExportContactDto

    await controller.export({ userId: 'u1' } as never, dto)

    expect(exportContact).toHaveBeenCalledWith('u1', dto, { origin: 'user', idempotencyKey: undefined })
  })
})
