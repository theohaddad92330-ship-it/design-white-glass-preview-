/**
 * LUDOVIC-C LC.1 (b) — « Remettre les contacts à jour avec les règles actuelles » : les
 * homonymes DÉJÀ au dossier sont ARCHIVÉS avec leur raison (jamais supprimés), la date de la
 * remise est posée sur le compte, rien n'est recollecté ni débité.
 */
import { ContactsService } from './contacts.service'
import { createMockRepository } from '../../database/test-utils'
import { HOMONYM_EXCLUSION_REASON } from './contact-employer'

const build = (account: Record<string, unknown> | null) => {
  const contacts = createMockRepository()
  const accountsRepo = createMockRepository()
  ;(accountsRepo.findOne as jest.Mock).mockResolvedValue(account)
  const workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
  const service = new ContactsService(
    contacts as never,
    createMockRepository() as never,
    { enrichContact: jest.fn() } as never,
    {} as never,
    workspace as never,
    {} as never,
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    accountsRepo as never,
    createMockRepository() as never,
    {} as never,
    {} as never,
    createMockRepository() as never,
    {} as never,
  )
  return { service, contacts, accountsRepo }
}

const STILL = { id: 'acc-still', website: 'https://www.still.fr', workspace_id: 'ws-1' }
const rows = [
  {
    id: 'front',
    full_name: 'A',
    email: 'cfo@stillfront.com',
    source: 'apollo',
    identity_confirmed_at: null,
    excluded_at: null,
  },
  { id: 'fr', full_name: 'B', email: 'b@still.fr', source: 'apollo', identity_confirmed_at: null, excluded_at: null },
  {
    id: 'hand',
    full_name: 'C',
    email: 'c@stillfront.com',
    source: 'manual',
    identity_confirmed_at: null,
    excluded_at: null,
  },
]

describe('ContactsService.applyCurrentContactRules (LC.1)', () => {
  it('archive (excluded_at + raison) le seul homonyme certain, pose la date sur le compte, ne supprime rien', async () => {
    const { service, contacts, accountsRepo } = build(STILL)
    ;(contacts.find as jest.Mock).mockResolvedValue(rows)
    const result = await service.applyCurrentContactRules('acc-still', 'u-1')
    expect(result).toMatchObject({ type: 'success', output: { archived: 1, simulation: false } })
    expect(contacts.update).toHaveBeenCalledWith(
      { id: expect.objectContaining({ _value: ['front'] }) },
      expect.objectContaining({ exclusion_reason: HOMONYM_EXCLUSION_REASON }),
    )
    expect(contacts.delete).not.toHaveBeenCalled()
    expect(accountsRepo.update).toHaveBeenCalledWith(
      { id: 'acc-still' },
      expect.objectContaining({ contacts_rules_applied_at: expect.any(Date) }),
    )
  })

  it('en simulation : compte et nomme, n’écrit RIEN', async () => {
    const { service, contacts, accountsRepo } = build(STILL)
    ;(contacts.find as jest.Mock).mockResolvedValue(rows)
    const result = await service.applyCurrentContactRules('acc-still', 'u-1', null, { simulation: true })
    expect(result).toMatchObject({ type: 'success', output: { archived: 1, simulation: true, names: ['A'] } })
    expect(contacts.update).not.toHaveBeenCalled()
    expect(accountsRepo.update).not.toHaveBeenCalled()
  })

  it('compte hors espace : not_found, rien écrit', async () => {
    const { service, contacts } = build(null)
    const result = await service.applyCurrentContactRules('acc-x', 'u-1')
    expect(result).toMatchObject({ type: 'failure' })
    expect(contacts.update).not.toHaveBeenCalled()
  })

  // CEDRIC-FIX C.2 — le domaine des AUTRES comptes du même groupe (tête déclarée) est un domaine du compte.
  it('C.2 — un e-mail d’une filiale sœur (même tête de groupe) n’est pas un homonyme', async () => {
    const sae = {
      id: 'acc-sae',
      website: 'https://www.safran-aircraft-engines.com',
      workspace_id: 'ws-1',
      siren: '111111111',
      group_head_siren: '552080178',
    }
    const { service, contacts, accountsRepo } = build(sae)
    ;(accountsRepo.find as jest.Mock).mockResolvedValue([{ website: 'https://www.zodiac-seats.io' }])
    ;(contacts.find as jest.Mock).mockResolvedValue([
      {
        id: 'sib',
        full_name: 'S',
        email: 's@zodiac-seats.io',
        source: 'apollo',
        identity_confirmed_at: null,
        excluded_at: null,
      },
      {
        id: 'hom',
        full_name: 'H',
        email: 'h@autre-societe.com',
        source: 'apollo',
        identity_confirmed_at: null,
        excluded_at: null,
      },
    ])
    const result = await service.applyCurrentContactRules('acc-sae', 'u-1', null, { simulation: true })
    expect(result).toMatchObject({ type: 'success', output: { archived: 1, names: ['H'] } })
  })

  it('C.2 SAIT DIRE NON — sans tête de groupe déclarée, aucune lecture de comptes frères', async () => {
    const { service, contacts, accountsRepo } = build(STILL)
    ;(contacts.find as jest.Mock).mockResolvedValue(rows)
    await service.applyCurrentContactRules('acc-still', 'u-1', null, { simulation: true })
    expect(accountsRepo.find).not.toHaveBeenCalled()
  })
})
