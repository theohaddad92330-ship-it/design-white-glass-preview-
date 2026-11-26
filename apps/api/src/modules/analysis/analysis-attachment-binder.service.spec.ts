import { AnalysisAttachmentBinderService } from './analysis-attachment-binder.service'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const DOC_A = '22222222-2222-4222-8222-222222222222'
const DOC_B = '33333333-3333-4333-8333-333333333333'

describe('AnalysisAttachmentBinderService (#3623)', () => {
  it("rattache au compte les documents `personal` de l'auteur, et seulement eux", async () => {
    const update = jest.fn().mockResolvedValue({ affected: 2 })
    const service = new AnalysisAttachmentBinderService({ update } as never)
    const bound = await service.bindToAccount([DOC_A, DOC_B], ACCOUNT, 'user-1')
    expect(bound).toBe(2)
    const [where, set] = update.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    // L'auteur ET la portée `personal` : un document d'un collègue ou déjà rangé ne bouge jamais.
    expect(where).toEqual(expect.objectContaining({ user_id: 'user-1', scope: 'personal' }))
    expect(set).toEqual({ scope: 'account', account_id: ACCOUNT, conversation_id: null })
  })

  it("ne touche à rien quand aucun identifiant n'est donné (zéro requête)", async () => {
    const update = jest.fn()
    const service = new AnalysisAttachmentBinderService({ update } as never)
    expect(await service.bindToAccount([], ACCOUNT, 'user-1')).toBe(0)
    expect(update).not.toHaveBeenCalled()
  })

  it("un échec d'écriture ne fait jamais tomber le lancement", async () => {
    const update = jest.fn().mockRejectedValue(new Error('db down'))
    const service = new AnalysisAttachmentBinderService({ update } as never)
    await expect(service.bindToAccount([DOC_A], ACCOUNT, 'user-1')).resolves.toBe(0)
  })
})
