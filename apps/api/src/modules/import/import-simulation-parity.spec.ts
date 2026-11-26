import type { Repository } from 'typeorm'
import { normaliseCompanyName, simulateImport } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ProjectEntity } from '../../database/entities/project.entity'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import type { ContactResolutionCorrectionsService } from '../contacts/contact-resolution-corrections.service'
import { ImportWriterService } from './import-writer.service'

/**
 * #4053.8 (recette prod 14/10) — LA SIMULATION ANNONÇAIT « 1 CRÉATION » SUR UN FICHIER DÉJÀ IMPORTÉ, ET LE
 * RÉEL EN FAISAIT « 0 ».
 *
 * La simulation lit `existingKeys` ; l'écriture, elle, relit la base à sa manière. Deux lectures de la
 * même chose finissent par diverger : `existingKeys` écartait les fiches qu'un humain a REJETÉES d'un
 * rapprochement par e-mail (#2159.35), l'écriture les reconnaissait quand même — la simulation promettait
 * une création, l'import mettait la fiche à jour. Ces tests rejouent LES DEUX sur les mêmes données et
 * exigent le même chiffre, par le vrai chemin (simulateImport ← existingKeys, writeContacts).
 */
const WS = 'ws-1'
const COMPANY = 'Acme SAS'

function makeWriter(rejected: string[]) {
  const accountRows = [{ id: 'acc-1', company_name: COMPANY, website: null }] as unknown as AccountEntity[]
  const contactRows = [{ id: 'c-1', email: 'accueil@acme.fr', tags: [] }] as unknown as ContactEntity[]
  const accounts = { find: jest.fn(async () => accountRows) } as unknown as Repository<AccountEntity>
  let created = 0
  const contacts = {
    find: jest.fn(async () => contactRows),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => {
      created += 1
      return { ...value, id: `new-${created}` }
    }),
    update: jest.fn(async () => undefined),
  } as unknown as Repository<ContactEntity>
  const writer = new ImportWriterService(
    accounts,
    contacts,
    {} as unknown as Repository<ProjectEntity>,
    {} as unknown as Repository<ProjectNeedEntity>,
    {} as unknown as Repository<ConsultantEntity>,
    { rejectedContactIds: async () => new Set(rejected) } as unknown as ContactResolutionCorrectionsService,
  )
  return writer
}

async function both(rejected: string[]) {
  const writer = makeWriter(rejected)
  const report = simulateImport({
    object: 'contact',
    headers: ['Nom', 'Email', 'Societe'],
    rows: [{ Nom: 'Accueil Acme', Email: 'accueil@acme.fr', Societe: COMPANY }],
    mapping: { columns: { Nom: 'name', Email: 'email', Societe: 'company' }, ignored: [], disabledRules: [] },
    required: ['email'],
    existing: await writer.existingKeys(WS, 'contact'),
    knownParents: new Set([normaliseCompanyName(COMPANY)]),
  })
  const real = await writer.writeContacts({
    workspaceId: WS,
    userId: 'u-1',
    rows: [{ name: 'Accueil Acme', email: 'accueil@acme.fr', company: COMPANY }],
    startAt: 0,
  })
  return { report, real }
}

describe('#4053.8 — la simulation et le réel reconnaissent les mêmes fiches', () => {
  it('une fiche connue par son e-mail : la simulation dit « 1 mise à jour », le réel aussi', async () => {
    const { report, real } = await both([])
    expect({ creations: report.creations, updates: report.updates }).toEqual({ creations: 0, updates: 1 })
    expect({ created: real.created, updated: real.updated }).toEqual({ created: 0, updated: 1 })
  })

  it('une fiche REJETÉE par un humain : la simulation dit « 1 création », le réel crée — pas « 0 »', async () => {
    const { report, real } = await both(['c-1'])
    expect({ creations: report.creations, updates: report.updates }).toEqual({ creations: 1, updates: 0 })
    expect({ created: real.created, updated: real.updated }).toEqual({ created: 1, updated: 0 })
  })
})

/**
 * Les comptes : un fichier de contacts importé comme comptes (export CRM générique) puis REdéposé. Le
 * compte existe déjà (créé la première fois, sans domaine) : la simulation et l'écriture doivent dire la
 * même chose — et jamais « 1 création » d'un côté, un compte retrouvé de l'autre.
 */
describe('#4053.8 — comptes : la simulation rejoue la reconnaissance de l’écriture', () => {
  async function accountsBoth(existing: Partial<AccountEntity>[]) {
    let created = 0
    const accounts = {
      find: jest.fn(async () => existing as AccountEntity[]),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => {
        created += 1
        return { ...value, id: `new-${created}` }
      }),
      update: jest.fn(async () => undefined),
    } as unknown as Repository<AccountEntity>
    const writer = new ImportWriterService(
      accounts,
      {} as unknown as Repository<ContactEntity>,
      {} as unknown as Repository<ProjectEntity>,
      {} as unknown as Repository<ProjectNeedEntity>,
      {} as unknown as Repository<ConsultantEntity>,
    )
    const report = simulateImport({
      object: 'account',
      headers: ['Nom', 'Email', 'Societe'],
      rows: [{ Nom: 'Accueil', Email: 'accueil@acme.fr', Societe: COMPANY }],
      mapping: { columns: { Nom: 'name', Email: 'email', Societe: 'company' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: await writer.existingKeys(WS, 'account'),
    })
    const real = await writer.writeAccounts({
      workspaceId: WS,
      userId: 'u-1',
      rows: [{ name: 'Accueil', email: 'accueil@acme.fr', company: COMPANY }],
      startAt: 0,
    })
    return { report, real }
  }

  it('compte déjà en base, reconnu par son seul nom : une création des deux côtés (jamais une fusion sur un nom)', async () => {
    const { report, real } = await accountsBoth([
      { id: 'acc-1', company_name: COMPANY, siren: null, website: null } as Partial<AccountEntity>,
    ])
    expect({ creations: report.creations, updates: report.updates }).toEqual({ creations: 1, updates: 0 })
    expect({ created: real.created, updated: real.updated }).toEqual({ created: 1, updated: 0 })
  })

  it('base vide : une création des deux côtés', async () => {
    const { report, real } = await accountsBoth([])
    expect({ creations: report.creations, updates: report.updates }).toEqual({ creations: 1, updates: 0 })
    expect({ created: real.created, updated: real.updated }).toEqual({ created: 1, updated: 0 })
  })
})
