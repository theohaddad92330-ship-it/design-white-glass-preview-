import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * #2150.31 — UN COMPTE IMPORTÉ ENTRE DANS LE PORTEFEUILLE DE QUI L'IMPORTE.
 *
 * Même défaut que #1408 (`accounts.service.ts:2146-2161`, chemin
 * `create()` de lancement d'analyse) : un compte créé sans `assigned_to`
 * n'est porté par PERSONNE — le cockpit qui lit le portefeuille par
 * responsable (`assigned_to`) ne le voit pas, et le manager le compte comme
 * une « zone blanche » (#1460) alors qu'il vient d'être repris en masse par
 * quelqu'un. #1408 a corrigé `create()` et `addToPortfolio()` ; ce chemin-ci
 * (`writeAccounts`, l'écriture d'un import CSV/Excel) restait le seul des
 * trois créations de compte à ne jamais poser la colonne.
 *
 * Pas un second geste « ajouter au portefeuille » (GA-26) : la même colonne,
 * posée par la même raison, sur le troisième chemin qui crée un compte.
 */

const WS = 'ws-1'

function makeWriter(existingAccounts: Partial<AccountEntity>[] = []) {
  let created = 0
  const accounts = {
    find: jest.fn(async () => existingAccounts as AccountEntity[]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      created += 1
      return { ...value, id: `new-${created}` }
    }),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<AccountEntity>
  const contacts = {
    find: jest.fn(async () => []),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 'c-1' })),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<ContactEntity>
  const projects = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 'p-1' })),
    update: jest.fn(async () => undefined),
    createQueryBuilder: jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    })),
  } as unknown as Repository<ProjectEntity>
  const writer = new ImportWriterService(
    accounts,
    contacts,
    projects,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
  )
  return { writer, accounts }
}

describe('#2150.31 — writeAccounts pose assigned_to', () => {
  it('attribue le compte NEUF à l’utilisateur qui importe', async () => {
    const { writer, accounts } = makeWriter([])

    await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-42',
      rows: [{ company: 'Nouvelle Société', domain: 'nouvelle-societe.fr' }],
      startAt: 0,
    })

    expect(accounts.create).toHaveBeenCalledWith(expect.objectContaining({ assigned_to: 'u-42' }))
  })

  it('ne touche pas assigned_to sur une MISE À JOUR — une correction humaine gagne toujours', async () => {
    const { writer, accounts } = makeWriter([
      { id: 'existing-acme', company_name: 'Acme Corp', siren: '123456789', website: null, tags: [] },
    ])

    await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-42',
      rows: [{ company: 'Acme Corp', siren: '123456789', domain: 'acme.fr' }],
      startAt: 0,
    })

    const patch = (accounts.update as jest.Mock).mock.calls[0]?.[1] as Record<string, unknown> | undefined
    expect(patch).not.toHaveProperty('assigned_to')
  })
})
