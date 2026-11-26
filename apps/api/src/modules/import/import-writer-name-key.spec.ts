import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * #4479 — 284 violations de `idx_contacts_account_normalized_name` en 1 h 30.
 *
 * `writeContacts` ne reconnaissait une fiche déjà là que par e-mail ou référence :
 * une ligne de MÊME NOM (accent/casse près) sans e-mail connu s'insérait, violait la
 * clé, et arrêtait tout l'import sur cette ligne. Elle est maintenant reconnue AVANT
 * l'écriture — repérée, jamais fusionnée, jamais dupliquée.
 */
const ACCOUNT = { id: 'acc-1', company_name: 'Acme', website: null } as AccountEntity

function monter(existingContacts: Partial<ContactEntity>[]) {
  const created: Record<string, unknown>[] = []
  const accounts = { find: jest.fn(async () => [ACCOUNT]) } as unknown as Repository<AccountEntity>
  const contacts = {
    find: jest.fn(async () => existingContacts as ContactEntity[]),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      created.push(value)
      return { ...value, id: `c-${created.length}` }
    }),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<ContactEntity>
  const writer = new ImportWriterService(
    accounts,
    contacts,
    {} as unknown as Repository<ProjectEntity>,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
  )
  return { writer, created }
}

const ECRITURE = { workspaceId: 'ws-1', userId: 'u-1', startAt: 0 }

describe('#4479 — writeContacts tient la clé du nom normalisé par compte', () => {
  it('une ligne du même nom (accent, casse) qu’une fiche du compte ne crée rien', async () => {
    const { writer, created } = monter([{ id: 'c-0', full_name: 'Sébastien Chauffray', email: null, tags: [] }])

    const out = await writer.writeContacts({
      ...ECRITURE,
      rows: [{ company: 'Acme', name: 'SEBASTIEN chauffray', title: 'DSI' }],
    })

    expect(created).toEqual([])
    expect(out.created).toBe(0)
    expect(out.failure).toBeNull()
  })

  it('deux lignes du même nom dans le MÊME fichier : une seule fiche, l’import va au bout', async () => {
    const { writer, created } = monter([])

    const out = await writer.writeContacts({
      ...ECRITURE,
      rows: [
        { company: 'Acme', name: 'Nadia Bensalem' },
        { company: 'Acme', name: 'nadia  bensalem' },
        { company: 'Acme', name: 'Karim Haddad' },
      ],
    })

    expect(created.map(c => c.full_name)).toEqual(['Nadia Bensalem', 'Karim Haddad'])
    expect(out.created).toBe(2)
    expect(out.failure).toBeNull()
  })

  it('sait dire NON : un homonyme sur un AUTRE compte reste créé (la clé est par compte)', async () => {
    const { writer, created } = monter([])
    const accounts = { find: jest.fn(async () => [ACCOUNT, { id: 'acc-2', company_name: 'Beta', website: null }]) }
    ;(writer as unknown as { accounts: unknown }).accounts = accounts

    const out = await writer.writeContacts({
      ...ECRITURE,
      rows: [
        { company: 'Acme', name: 'Nadia Bensalem' },
        { company: 'Beta', name: 'Nadia Bensalem' },
      ],
    })

    expect(out.created).toBe(2)
    expect(created).toHaveLength(2)
  })
})

describe('#4586 — le nom écrit n’est jamais l’adresse', () => {
  it('une ligne sans nom ne prend pas son adresse pour nom ; la dérivation est marquée', async () => {
    const { writer, created } = monter([])

    await writer.writeContacts({
      ...ECRITURE,
      rows: [
        { company: 'Acme', email: 'menette.sebastien@societe.example' },
        { company: 'Acme', name: 'contact@societe.example', email: 'contact@societe.example' },
      ],
    })

    expect(created.map(c => c.full_name)).toEqual(['Menette Sebastien', 'Contact à compléter'])
    expect(created[0]).toMatchObject({
      email: 'menette.sebastien@societe.example',
      raw_data: { nameDerivedFromEmail: true },
    })
  })
})

describe("#4599.2 — writeContacts: la garde d'écriture couvre l'import universel", () => {
  it("un gabarit « prenom.nom@… » n'est écrit sur aucune fiche, et ne rapproche pas deux personnes", async () => {
    const { writer, created } = monter([])

    const out = await writer.writeContacts({
      ...ECRITURE,
      rows: [
        { company: 'Acme', name: 'Claire Vasseur', email: 'prenom.nom@acme.fr' },
        { company: 'Acme', name: 'Paul Martin', email: 'Prenom.Nom@acme.fr' },
        { company: 'Acme', name: 'Nadia Bensalem', email: 'nadia.bensalem@acme.fr' },
      ],
    })

    expect(created.map(c => [c.full_name, c.email])).toEqual([
      ['Claire Vasseur', null],
      ['Paul Martin', null],
      ['Nadia Bensalem', 'nadia.bensalem@acme.fr'],
    ])
    expect(out.created).toBe(3)
  })
})
