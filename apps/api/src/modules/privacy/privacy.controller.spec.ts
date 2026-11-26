import { PrivacyController } from './privacy.controller'

const USER = { userId: 'user-abc', email: 'louis@esn.fr' }

/**
 * #2439.7/.8/.17 — « Mes exports » borné au demandeur, comme le reste de ce
 * contrôleur (`@PersonalScope` sur la classe) : `GET /privacy/export/history`
 * ne prend aucun paramètre d'utilisateur, il lit `@CurrentUser`.
 */
describe('PrivacyController — GET /privacy/export/history (#2439.7/.8/.17)', () => {
  it('rend l’historique de CELUI QUI APPELLE, tel que le service le lit', async () => {
    const listRecentForUser = jest
      .fn()
      .mockResolvedValue([{ kind: 'full', objectKey: null, format: null, createdAt: '2026-09-27T00:00:00.000Z' }])
    const controller = new PrivacyController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { listRecentForUser } as never,
    )

    const result = await controller.exportHistory(USER)

    expect(listRecentForUser).toHaveBeenCalledWith('user-abc')
    expect(result).toEqual([{ kind: 'full', objectKey: null, format: null, createdAt: '2026-09-27T00:00:00.000Z' }])
  })
})
