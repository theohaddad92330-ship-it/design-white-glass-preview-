import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { findImportSource } from './import-catalog'
import { ImportWriterService } from './import-writer.service'

/**
 * #2159.26 — la colonne « Tags » d'un export se rattache TOUTE SEULE, et ses
 * valeurs arrivent sur les fiches (décision Louis 19/09/2026).
 *
 * Avant : aucun alias au catalogue, aucun champ sur `Contact` ni `Account` —
 * la colonne finissait dans « colonnes ignorées ».
 */
describe('#2159.26 — le catalogue rattache la colonne Tags', () => {
  it.each(['hubspot_export', 'crm_generic_export', 'contacts_only', 'accounts_only'])(
    '%s reconnaît tags, étiquettes, labels et mots-clés',
    key => {
      const source = findImportSource(key)
      // Les alias sont sous leur forme NORMALISÉE (`normaliseHeader`).
      for (const header of ['tags', 'etiquettes', 'labels', 'mots_cles']) {
        expect(source?.aliases[header]).toBe('tags')
      }
    },
  )
})

const WS = 'ws-1'

function makeWriter(
  existingAccounts: Partial<AccountEntity>[],
  existingContacts: Partial<ContactEntity>[] = [],
  companies: Partial<AccountEntity>[] = [],
) {
  const saved: Record<string, unknown>[] = []
  const accountUpdates: { criteria: unknown; patch: unknown }[] = []
  const contactUpdates: { criteria: unknown; patch: unknown }[] = []
  const accounts = {
    find: jest.fn(async () => [...existingAccounts, ...companies] as AccountEntity[]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      saved.push(value)
      return { ...value, id: `new-${saved.length}` }
    }),
    update: jest.fn(async (criteria: unknown, patch: unknown) => {
      accountUpdates.push({ criteria, patch })
      return undefined
    }),
  } as unknown as Repository<AccountEntity>
  const contacts = {
    find: jest.fn(async () => existingContacts as ContactEntity[]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      saved.push(value)
      return { ...value, id: `c-${saved.length}` }
    }),
    update: jest.fn(async (criteria: unknown, patch: unknown) => {
      contactUpdates.push({ criteria, patch })
      return undefined
    }),
  } as unknown as Repository<ContactEntity>
  const projects = {} as unknown as Repository<ProjectEntity>
  const writer = new ImportWriterService(
    accounts,
    contacts,
    projects,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
  )
  return { writer, saved, accountUpdates, contactUpdates }
}

describe('#2159.26 — les étiquettes arrivent sur les fiches', () => {
  it('un compte CRÉÉ porte les étiquettes de la cellule, normalisées', async () => {
    const { writer, saved } = makeWriter([])

    await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme', tags: 'SAP; Grand  compte, sap' }],
      startAt: 0,
    })

    // #2159.26 — graphie de la première saisie (décision Louis 19/09) :
    // « SAP » reste « SAP », « Grand  compte » perd ses doubles espaces.
    expect(saved[0]?.tags).toEqual(['SAP', 'Grand compte'])
  })

  it('un compte RETROUVÉ sans étiquette reçoit celles du fichier — et l’instantané garde l’avant pour l’annulation', async () => {
    const { writer, accountUpdates } = makeWriter([
      { id: 'acc-1', company_name: 'Acme', siren: '123456789', website: 'acme.fr', tags: [] },
    ])

    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme', siren: '123456789', tags: 'cloud' }],
      startAt: 0,
    })

    expect(accountUpdates).toEqual([{ criteria: { id: 'acc-1', workspace_id: WS }, patch: { tags: ['cloud'] } }])
    expect(outcome.snapshot[0]).toEqual({ id: 'acc-1', created: false, fields: expect.objectContaining({ tags: [] }) })
  })

  it('un compte RETROUVÉ qui a DÉJÀ des étiquettes les garde — on remplit les trous, on n’écrase rien', async () => {
    const { writer, accountUpdates } = makeWriter([
      { id: 'acc-1', company_name: 'Acme', siren: '123456789', website: 'acme.fr', tags: ['posées à la main'] },
    ])

    await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme', siren: '123456789', tags: 'cloud' }],
      startAt: 0,
    })

    expect(accountUpdates).toHaveLength(0)
  })

  it('un contact CRÉÉ porte les étiquettes de la cellule, normalisées', async () => {
    const { writer, saved } = makeWriter([], [], [{ id: 'acc-1', company_name: 'Acme', website: null }])

    await writer.writeContacts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme', email: 'a@acme.fr', name: 'Ana', tags: 'Décideur | SAP' }],
      startAt: 0,
    })

    // #2159.26 — graphie de la première saisie : « Décideur » et « SAP »
    // gardent leur casse d'origine.
    expect(saved[0]?.tags).toEqual(['Décideur', 'SAP'])
  })

  it('un contact RETROUVÉ sans étiquette reçoit celles du fichier, avec son instantané', async () => {
    const { writer, contactUpdates } = makeWriter(
      [],
      [{ id: 'c-9', email: 'a@acme.fr', tags: [] }],
      [{ id: 'acc-1', company_name: 'Acme', website: null }],
    )

    const outcome = await writer.writeContacts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ company: 'Acme', email: 'a@acme.fr', tags: 'sap' }],
      startAt: 0,
    })

    expect(contactUpdates).toEqual([{ criteria: { id: 'c-9', workspace_id: WS }, patch: { tags: ['sap'] } }])
    expect(outcome.snapshot[0]).toEqual({ id: 'c-9', created: false, fields: { tags: [] } })
  })
})
