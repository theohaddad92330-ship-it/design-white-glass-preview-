import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import type { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import { ImportWriterService } from './import-writer.service'

/**
 * M2.1 (Meyer 20/10) — la référence du CRM d'origine rapproche une fiche déjà importée : un réimport par le Wizard
 * ne crée AUCUN doublon (#4052), même clé que l'import universel (`csv`, `fichier:<réf>`).
 */
const WS = 'ws-1'

function makeWriter(links: { external_id: string; internal_id: string }[], accounts: Partial<AccountEntity>[]) {
  const created: Record<string, unknown>[] = []
  const written: Record<string, unknown>[] = []
  const accountRepo = {
    find: jest.fn(async () => accounts as AccountEntity[]),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: Record<string, unknown>) => ({ ...v, id: `a-${created.push(v)}` })),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<AccountEntity>
  const contactRepo = {
    find: jest.fn(async () => []),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async (v: Record<string, unknown>) => ({ ...v, id: `c-${created.push(v)}` })),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<ContactEntity>
  const syncRepo = {
    find: jest.fn(async () => links),
    createQueryBuilder: jest.fn(() => {
      const qb = {
        insert: () => qb,
        values: (v: Record<string, unknown>) => {
          written.push(v)
          return qb
        },
        orIgnore: () => qb,
        execute: async () => undefined,
      }
      return qb
    }),
  } as unknown as Repository<SyncLinkEntity>
  const writer = new ImportWriterService(
    accountRepo,
    contactRepo,
    {} as unknown as Repository<ProjectEntity>,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
    undefined,
    undefined,
    syncRepo,
  )
  return { writer, created, written }
}

const row = {
  sourceRef: 'CCON1',
  companyRef: 'CSOC1',
  firstName: 'Prenom01',
  lastName: 'Fictif01',
  company: 'Société Exemple 01',
  email: 'contact01@exemple.invalid',
}

describe('M2.1 — la référence source rapproche un contact déjà importé', () => {
  it('première fois : le contact est créé, nommé « Prénom Nom », et sa référence posée', async () => {
    const { writer, created, written } = makeWriter([], [{ id: 'acc-1', company_name: 'Société Exemple 01' }])
    const outcome = await writer.writeContacts({ workspaceId: WS, userId: 'u1', startAt: 0, rows: [row] } as never)
    expect(outcome.created).toBe(1)
    expect(created[0]).toMatchObject({ full_name: 'Prenom01 Fictif01', account_id: 'acc-1' })
    expect(written).toEqual([expect.objectContaining({ entity_type: 'contact', external_id: 'fichier:CCON1' })])
  })

  it('réimport : la référence déjà liée met à jour, ne crée AUCUN doublon', async () => {
    const { writer, created } = makeWriter(
      [{ external_id: 'fichier:CCON1', internal_id: 'c-existing' }],
      [{ id: 'acc-1', company_name: 'Société Exemple 01' }],
    )
    const outcome = await writer.writeContacts({
      workspaceId: WS,
      userId: 'u1',
      startAt: 0,
      rows: [{ ...row, email: 'autre@exemple.invalid' }],
    } as never)
    expect(created).toHaveLength(0)
    expect(outcome.created).toBe(0)
    expect(outcome.updated).toBe(1)
  })

  it('la société inconnue par son nom est retrouvée par sa référence', async () => {
    const { writer, created } = makeWriter(
      [{ external_id: 'fichier:CSOC1', internal_id: 'acc-9' }],
      [{ id: 'acc-9', company_name: 'Ancien nom' }],
    )
    const outcome = await writer.writeContacts({ workspaceId: WS, userId: 'u1', startAt: 0, rows: [row] } as never)
    expect(outcome.created).toBe(1)
    expect(created[0]).toMatchObject({ account_id: 'acc-9' })
  })
})

describe('M2.1 — la référence rapproche un compte déjà importé', () => {
  it('réimport d’un compte : mis à jour par sa référence, jamais recréé', async () => {
    const { writer, created } = makeWriter(
      [{ external_id: 'fichier:CSOC1', internal_id: 'acc-9' }],
      [{ id: 'acc-9', company_name: 'Ancien nom', sector: null, employees: null, headquarters: null, tags: [] }],
    )
    const outcome = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u1',
      startAt: 0,
      rows: [{ company: 'Nouveau nom', companyRef: 'CSOC1', sector: 'Banque' }],
    } as never)
    expect(created).toHaveLength(0)
    expect(outcome.created).toBe(0)
    expect(outcome.updated).toBe(1)
  })
})
