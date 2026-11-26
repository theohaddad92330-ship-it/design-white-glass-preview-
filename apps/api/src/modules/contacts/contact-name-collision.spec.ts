import { findNameHolder, isContactNameCollision, nameHoldersOfAccount } from './contact-name-collision'

describe('#4479 — la clé du nom normalisé par compte', () => {
  it('reconnaît le 23505 de CETTE clé, par la contrainte ou par le message', () => {
    expect(isContactNameCollision({ code: '23505', constraint: 'idx_contacts_account_normalized_name' })).toBe(true)
    expect(
      isContactNameCollision({
        driverError: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "idx_contacts_account_normalized_name"',
        },
      }),
    ).toBe(true)
  })

  it('sait dire NON : une autre unicité, ou une autre erreur, remonte', () => {
    expect(isContactNameCollision({ code: '23505', constraint: 'contacts_pkey' })).toBe(false)
    expect(isContactNameCollision({ code: '23503' })).toBe(false)
    expect(isContactNameCollision(new Error('boom'))).toBe(false)
  })

  it('repère le porteur d’un nom sans accent ni casse, sans rien écrire', async () => {
    const repo = { find: jest.fn().mockResolvedValue([{ id: 'c-1', full_name: 'Sébastien Chauffray' }]) }
    expect(await findNameHolder(repo, 'acc-1', 'SEBASTIEN  chauffray')).toEqual({ id: 'c-1' })
    expect(await findNameHolder(repo, 'acc-1', 'Autre Personne')).toBeNull()
    expect(await nameHoldersOfAccount(repo, 'acc-1')).toEqual(new Map([['sebastien chauffray', 'c-1']]))
  })

  it('une fiche écartée tient sa clé : la lecture ne filtre pas sur deleted_at', async () => {
    const repo = { find: jest.fn().mockResolvedValue([]) }
    await nameHoldersOfAccount(repo, 'acc-1')
    expect(repo.find.mock.calls[0][0].where).toEqual({ account_id: 'acc-1' })
  })
})
