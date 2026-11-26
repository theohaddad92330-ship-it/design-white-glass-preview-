import { AccountRecordController, ContactRecordController } from './crm-core.controller'

/**
 * #3219 (#190.1/#190.8) — LES DEUX ENDPOINTS `GET :id/conflicts`, testés à leur
 * niveau HTTP réel. Jusqu'ici seul `FieldConflictService.openConflicts` avait
 * une suite (`field-conflict.service.spec.ts`) : aucun test ne vérifiait que le
 * contrôleur route bien vers le bon `entityType` — l'APPELANT, pas seulement la
 * fonction (registre `agent_docs/chantiers-livres.md`).
 */

const USER = { userId: 'u1' } as never

function controllers(): {
  account: AccountRecordController
  contact: ContactRecordController
  openConflicts: jest.Mock
} {
  const openConflicts = jest.fn().mockResolvedValue([])
  const conflictsService = { openConflicts } as never
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1', role: 'member' }),
  } as never
  return {
    account: new AccountRecordController({} as never, {} as never, conflictsService, workspaceContext),
    contact: new ContactRecordController({} as never, {} as never, conflictsService, workspaceContext),
    openConflicts,
  }
}

describe('conflicts() — routage entité par contrôleur', () => {
  it('GET /accounts/:id/conflicts lit les contradictions d’un COMPTE, dans l’espace résolu', async () => {
    const { account, openConflicts } = controllers()
    await account.conflicts(USER, 'acc-1')
    expect(openConflicts).toHaveBeenCalledWith('w1', 'account', 'acc-1', { includeSettled: false })
  })

  it('GET /contacts/:id/conflicts lit les contradictions d’un CONTACT, jamais un compte', async () => {
    const { contact, openConflicts } = controllers()
    await contact.conflicts(USER, 'c-1')
    expect(openConflicts).toHaveBeenCalledWith('w1', 'contact', 'c-1', { includeSettled: false })
  })

  it('`?include=settled` demande AUSSI les contradictions tranchées toutes seules (#190.2)', async () => {
    const { account, openConflicts } = controllers()
    await account.conflicts(USER, 'acc-1', 'settled')
    expect(openConflicts).toHaveBeenCalledWith('w1', 'account', 'acc-1', { includeSettled: true })
    // Sait dire NON : toute autre valeur reste la lecture par défaut (ouvertes seules).
    await account.conflicts(USER, 'acc-1', 'all')
    expect(openConflicts).toHaveBeenLastCalledWith('w1', 'account', 'acc-1', { includeSettled: false })
  })
})
