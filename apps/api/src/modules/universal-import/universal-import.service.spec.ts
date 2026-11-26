import { NotFoundException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import { UNIVERSAL_IMPORT_CHUNK_ROWS, UNIVERSAL_IMPORT_PART_BYTES } from '@bellum/contracts'
import { FindOperator, type DataSource, type Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { PersonalContactEntity } from '../../database/entities/personal-contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import type { SyncLinkEntity } from '../../database/entities/sync-link.entity'
import {
  UniversalImportIssueEntity,
  UniversalImportJobEntity,
} from '../../database/entities/universal-import-job.entity'
import type { StorageClient } from '../storage/storage.client'
import { UniversalImportService } from './universal-import.service'

/**
 * Le job de l'import universel, SANS base ni Redis : une base en mémoire qui
 * honore la TRANSACTION (un paquet qui lève n'a rien écrit) et un stockage en
 * mémoire. Ce qu'on prouve : la reprise au dernier paquet VALIDÉ, le rapport,
 * et qu'un job ne se lit jamais hors de son espace.
 */
const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_WS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ACCOUNT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type Row = Record<string, unknown>

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value instanceof FindOperator && value.type === 'isNull') return row[key] == null
    if (value && typeof value === 'object') return true // opérateurs TypeORM (IsNull, MoreThanOrEqual) : filtrés à part
    return row[key] === value
  })
}

function harness(options: { failOnTransaction?: number; rejectEmail?: string } = {}) {
  const tables = {
    jobs: [] as Row[],
    issues: [] as Row[],
    contacts: [] as Row[],
    accounts: [] as Row[],
    talents: [] as Row[],
    personal: [] as Row[],
    links: [] as Row[],
  }
  const updates: { sql: string; params: unknown[] }[] = []
  const marks: unknown[][] = []
  const whereCalls: Row[] = []
  let transactions = 0

  const repoOver = (table: Row[], opts: { failInsert?: () => boolean } = {}) => ({
    create: (values: Row) => ({ ...values }),
    save: async (values: Row) => {
      const row = {
        id: `job-${table.length + 1}`,
        committed_rows: 0,
        imported_count: 0,
        duplicate_count: 0,
        rejected_count: 0,
        parts_received: 0,
        total_rows: null,
        error: null,
        mapping: null,
        ...values,
      }
      table.push(row)
      return row
    },
    findOne: async ({ where }: { where: Row }) => {
      whereCalls.push(where)
      return (table.find(row => matches(row, where)) ?? null) as never
    },
    find: async ({ where }: { where: Row }) => {
      whereCalls.push(where)
      return table
        .filter(row => matches(row, where))
        .sort((a, b) => Number(a['row_number'] ?? 0) - Number(b['row_number'] ?? 0)) as never
    },
    // M.2 — le GROUP BY de l'historique : (job, kind, raison) → nombre.
    query: async (_sql: string, params: unknown[]) => {
      const ids = params[1] as string[]
      const counts = new Map<string, Row>()
      for (const issue of table) {
        if (!ids.includes(issue['job_id'] as string) || issue['kind'] === 'duplicate') continue
        const key = `${issue['job_id']}|${issue['kind']}|${issue['reason']}`
        const entry = counts.get(key) ?? {
          job_id: issue['job_id'],
          kind: issue['kind'],
          reason: issue['reason'],
          count: 0,
        }
        entry['count'] = (entry['count'] as number) + 1
        counts.set(key, entry)
      }
      return [...counts.values()]
    },
    // #4597.3 — le compte des fiches par import (historique) : rien à compter dans ce faux dépôt.
    createQueryBuilder: () => {
      const qb = {
        select: () => qb,
        addSelect: () => qb,
        where: () => qb,
        andWhere: () => qb,
        groupBy: () => qb,
        getRawMany: async () => [],
      }
      return qb
    },
    update: async (where: Row, patch: Row) => {
      whereCalls.push(where)
      let affected = 0
      for (const row of table) {
        if (!matches(row, where)) continue
        Object.assign(row, patch)
        affected += 1
      }
      return { affected }
    },
    insert: async (values: Row | Row[]) => {
      if (opts.failInsert?.()) throw new Error('connexion perdue')
      table.push(...(Array.isArray(values) ? values : [values]))
    },
  })

  const jobs = repoOver(tables.jobs)
  const dataSource = {
    transaction: async (work: (manager: unknown) => Promise<void>) => {
      transactions += 1
      // Chaque transaction écrit dans une COPIE ; la copie n'est versée qu'au commit.
      const staged = {
        issues: [...tables.issues],
        contacts: [...tables.contacts],
        jobs: tables.jobs.map(row => ({ ...row })),
      }
      const fail = transactions === options.failOnTransaction
      const manager = {
        query: async (sql: string, params: unknown[] = []) => {
          if (sql.includes('INSERT INTO record_import_marks')) marks.push(params)
          if (!sql.startsWith('UPDATE')) return
          if (options.rejectEmail && params.includes(options.rejectEmail)) {
            throw Object.assign(new Error('contrainte'), { code: '23505' })
          }
          updates.push({ sql, params })
        },
        createQueryBuilder: () => ({
          insert: () => ({
            into: (target: unknown) => ({
              values: (values: Row[]) => ({
                orIgnore: () => ({
                  execute: async () => {
                    // `ON CONFLICT DO NOTHING` sur (espace, fournisseur, type, référence).
                    for (const value of values) {
                      const clash = tables.links.some(link =>
                        ['workspace_id', 'provider', 'entity_type', 'external_id'].every(k => link[k] === value[k]),
                      )
                      if (!clash) tables.links.push(value)
                    }
                  },
                }),
                execute: async () => {
                  if (fail) throw new Error('connexion perdue')
                  if (options.rejectEmail && values.some(value => value['email'] === options.rejectEmail)) {
                    throw Object.assign(new Error('contrainte'), { code: '23514' })
                  }
                  if (target === PersonalContactEntity) {
                    tables.personal.push(...values.map(value => ({ created_at: new Date(), ...value })))
                    return
                  }
                  ;(target === ContactEntity
                    ? staged.contacts
                    : target === ConsultantEntity
                      ? tables.talents
                      : tables.accounts
                  ).push(...values)
                },
              }),
            }),
          }),
        }),
        getRepository: (entity: unknown) => {
          if (entity === UniversalImportIssueEntity) return repoOver(staged.issues)
          if (entity === ContactEntity) return repoOver(staged.contacts, { failInsert: () => fail })
          if (entity === UniversalImportJobEntity) return repoOver(staged.jobs)
          return repoOver(tables.accounts)
        },
      }
      await work(manager)
      tables.issues.splice(0, tables.issues.length, ...staged.issues)
      tables.contacts.splice(0, tables.contacts.length, ...staged.contacts)
      tables.jobs.splice(0, tables.jobs.length, ...staged.jobs)
    },
  } as unknown as DataSource

  const blobs = new Map<string, Buffer>()
  const storage = {
    put: async (path: string, bytes: Buffer) => void blobs.set(path, bytes),
    // #3666.9 — l'upload DIRECT : la signature ne touche aucun octet ; la taille se lit dans le stockage.
    createSignedUploadUrl: async (path: string) => ({
      uploadUrl: `https://storage.test/${path}?token=t`,
      path,
      token: 't',
    }),
    objectSize: async (path: string) => blobs.get(path)?.byteLength ?? null,
    remove: async (paths: string[]) => {
      for (const path of paths) blobs.delete(path)
      return true
    },
    get: async (path: string) => {
      const found = blobs.get(path)
      if (!found) throw new Error('absent')
      return found
    },
  } as unknown as StorageClient
  const queue = { add: jest.fn(async () => undefined) }

  const service = new UniversalImportService(
    jobs as unknown as Repository<UniversalImportJobEntity>,
    repoOver(tables.issues) as unknown as Repository<UniversalImportIssueEntity>,
    repoOver(tables.accounts) as unknown as Repository<AccountEntity>,
    repoOver(tables.contacts) as unknown as Repository<ContactEntity>,
    repoOver(tables.personal) as unknown as Repository<PersonalContactEntity>,
    repoOver([]) as unknown as Repository<ProjectNeedEntity>,
    repoOver(tables.talents) as unknown as Repository<ConsultantEntity>,
    repoOver(tables.links) as unknown as Repository<SyncLinkEntity>,
    dataSource,
    storage,
    queue as never,
  )
  return { service, tables, whereCalls, queue, blobs, updates, marks }
}

/** Un CSV de `n` contacts ; la ligne 7 n'a pas de nom, la ligne 9 répète l'e-mail de la ligne 8. */
function csvOf(n: number): string {
  const lines = ['Nom;Email;Code ERP']
  for (let i = 0; i < n; i += 1) {
    const name = i === 5 ? '' : `Personne ${i}`
    const email = i === 7 ? 'p6@exemple.test' : `p${i}@exemple.test`
    lines.push(`${name};${email};E${i}`)
  }
  return lines.join('\n')
}

async function uploadAndStart(
  h: ReturnType<typeof harness>,
  text: string,
  scope?: 'workspace' | 'personal',
): Promise<string> {
  const bytes = Buffer.from(text)
  const partSize = Math.ceil(bytes.length / 3)
  const job = await h.service.create(WS, 'user-1', {
    type: 'contact',
    filename: 'contacts.csv',
    parts: 3,
    accountId: ACCOUNT,
    scope,
  })
  for (let index = 0; index < 3; index += 1) {
    await h.service.putPart(
      WS,
      job.id,
      index,
      bytes.subarray(index * partSize, (index + 1) * partSize).toString('base64'),
    )
  }
  await h.service.start(WS, job.id, { Nom: 'full_name', Email: 'email', 'Code ERP': null })
  return job.id
}

describe('UniversalImportService — #4051.10 l’historique des imports', () => {
  const job = (extra: Record<string, unknown>) => ({
    id: 'job-x',
    workspace_id: WS,
    user_id: 'u-1',
    type: 'contact',
    filename: 'export.csv',
    status: 'done',
    scope: 'workspace',
    total_rows: 10,
    committed_rows: 10,
    imported_count: 8,
    duplicate_count: 1,
    rejected_count: 1,
    to_reconcile_count: 0,
    breakdown: {},
    source_system: null,
    error: null,
    created_at: new Date('2026-10-16T09:30:00Z'),
    ...extra,
  })

  it('liste date, fichier, volumes et statut — les plus récents d’abord', async () => {
    const h = harness()
    h.tables.jobs.push(
      job({ id: 'old', filename: 'ancien.csv', created_at: new Date('2026-10-01T09:00:00Z') }),
      job({ id: 'new', filename: 'nouveau.csv', status: 'failed', imported_count: 3 }),
    )
    const items = await h.service.history(WS, 'u-1')
    expect(items.map(item => item.filename)).toEqual(['nouveau.csv', 'ancien.csv'])
    expect(items[0]).toMatchObject({ status: 'failed', imported: 3, createdAt: '2026-10-16T09:30:00.000Z' })
  })

  // #4422.1 — un envoi resté « en cours » pour toujours se dit INTERROMPU ; la ligne n'est ni supprimée ni réécrite.
  it('#4422.1 — un envoi `uploading` plus vieux que le délai est interrompu ; un récent ne l’est pas', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T10:00:00Z'))
    try {
      const h = harness()
      h.tables.jobs.push(
        job({ id: 'stuck', filename: 'du-21.csv', status: 'uploading', created_at: new Date('2026-10-21T10:00:00Z') }),
        job({
          id: 'fresh',
          filename: 'tout-juste.csv',
          status: 'uploading',
          created_at: new Date('2026-10-22T09:50:00Z'),
        }),
        job({ id: 'ok', filename: 'fini.csv', status: 'done', created_at: new Date('2026-10-20T10:00:00Z') }),
      )
      const items = await h.service.history(WS, 'u-1')
      expect(items.map(item => [item.id, item.interrupted])).toEqual([
        ['fresh', false],
        ['stuck', true],
        ['ok', false],
      ])
      expect(h.tables.jobs).toHaveLength(3)
    } finally {
      jest.useRealTimers()
    }
  })

  // #4597.3 — « voir les N contacts / N comptes » : n'existe que pour un import dont les fiches portent son identifiant.
  it('#4597.3 — chaque import porte le nombre de fiches qui portent son identifiant ; sans fiche, AUCUNE clé (jamais 0)', async () => {
    const h = harness()
    h.tables.jobs.push(job({ id: 'stamped' }), job({ id: 'legacy', filename: 'ancien.csv' }))
    const rowsOf = (rows: Array<{ job_id: string; count: string }>) => {
      const qb = {
        select: () => qb,
        addSelect: () => qb,
        where: () => qb,
        andWhere: () => qb,
        groupBy: () => qb,
        getRawMany: async () => rows,
      }
      return { createQueryBuilder: () => qb }
    }
    Object.assign(h.service as unknown as object, {
      contacts: rowsOf([
        { job_id: 'stamped', count: '8' },
        { job_id: 'legacy', count: '0' },
      ]),
      accounts: rowsOf([]),
    })
    const items = await h.service.history(WS, 'u-1')
    expect(items.find(item => item.id === 'stamped')?.linked).toEqual({ contacts: 8 })
    expect(items.find(item => item.id === 'legacy')).not.toHaveProperty('linked')
  })

  // MEYER-IMPORT M.2 — « 1025 lignes écartées » ne se lit jamais sans sa raison.
  it('M.2 — chaque import porte ses écartés et ses « à rapprocher » COMPTÉS PAR RAISON ; un import sans rejet n’en porte aucun', async () => {
    const h = harness()
    h.tables.jobs.push(job({ id: 'meyer', rejected_count: 3 }), job({ id: 'clean', filename: 'propre.csv' }))
    const issue = (row: number, kind: string, reason: string) => ({
      job_id: 'meyer',
      workspace_id: WS,
      row_number: row,
      kind,
      reason,
    })
    h.tables.issues.push(
      issue(2, 'rejected', 'unknown_company'),
      issue(3, 'rejected', 'unknown_company'),
      issue(4, 'rejected', 'missing_required_field'),
      issue(5, 'to_reconcile', 'company_to_validate'),
      issue(6, 'duplicate', 'duplicate'),
    )
    const items = await h.service.history(WS, 'u-1')
    const meyer = items.find(item => item.id === 'meyer')
    expect(meyer?.reasons).toEqual(
      expect.arrayContaining([
        { kind: 'rejected', reason: 'unknown_company', count: 2 },
        { kind: 'rejected', reason: 'missing_required_field', count: 1 },
        { kind: 'to_reconcile', reason: 'company_to_validate', count: 1 },
      ]),
    )
    // Un doublon proposé n'est ni un rejet ni un « à rapprocher » : il n'entre pas dans les raisons.
    expect(meyer?.reasons).toHaveLength(3)
    expect(items.find(item => item.id === 'clean')?.reasons).toEqual([])
  })

  it('NON : l’import PERSONNEL d’un collègue n’apparaît pas, ni celui d’un autre espace', async () => {
    const h = harness()
    h.tables.jobs.push(
      job({ id: 'mine-personal', scope: 'personal', user_id: 'u-1' }),
      job({ id: 'theirs-personal', scope: 'personal', user_id: 'u-2' }),
      job({ id: 'theirs-team', scope: 'workspace', user_id: 'u-2' }),
      job({ id: 'elsewhere', workspace_id: OTHER_WS }),
    )
    const ids = (await h.service.history(WS, 'u-1')).map(item => item.id).sort()
    expect(ids).toEqual(['mine-personal', 'theirs-team'])
  })
})

describe('UniversalImportService — le job', () => {
  const rows = UNIVERSAL_IMPORT_CHUNK_ROWS * 2 + 37

  it('écrit tout, par paquets, avec un rapport qui nomme doublons et rejets', async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(rows))
    expect(await h.service.process(WS, id)).toBe(true)

    const state = await h.service.state(WS, id)
    expect(state).toMatchObject({
      status: 'done',
      totalRows: rows,
      processedRows: rows,
      imported: rows - 2,
      duplicates: 1,
      rejected: 1,
    })
    expect(h.tables.contacts[0]).toMatchObject({ source: 'import', workspace_id: WS, extra: { 'Code ERP': 'E0' } })

    const csv = await h.service.reportCsv(WS, id)
    expect(csv.split('\n').slice(1, 3)).toEqual([
      '7;rejected;missing_required_field;;full_name',
      expect.stringMatching(/^9;duplicate;duplicate;[0-9a-f-]{36};Personne 7$/),
    ])
  })

  // #4051 — « Importé le <date> depuis <fichier> » : une trace par fiche écrite, sous le NOM du fichier déposé.
  it('#4051 — chaque fiche d’équipe écrite reçoit sa trace d’import, nommée par le fichier', async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(rows))
    await h.service.process(WS, id)
    expect(h.marks.length).toBeGreaterThan(0)
    for (const [workspace, entityType, ids, kind, label] of h.marks) {
      expect(workspace).toBe(WS)
      expect(entityType).toBe('contact')
      expect((ids as string[]).length).toBeGreaterThan(0)
      expect(kind).toBe('file')
      expect(label).toBe('contacts.csv')
    }
  })

  it('#4051 — ⚠️ SAIT DIRE NON : un import PERSONNEL ne laisse aucune trace sur une fiche d’équipe', async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(rows), 'personal')
    await h.service.process(WS, id)
    expect(h.marks).toEqual([])
  })

  it('#2927 — un import PERSONNEL écrit dans personal_contacts, jamais dans contacts, et ne se lit que par son auteur', async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(4), 'personal')
    await h.service.process(WS, id)

    expect(h.tables.contacts).toHaveLength(0)
    expect(h.tables.personal).toHaveLength(4)
    expect(h.tables.personal[0]).toMatchObject({ user_id: 'user-1', workspace_id: WS, account_id: ACCOUNT })
    expect(await h.service.state(WS, id)).toMatchObject({ scope: 'personal', imported: 4 })

    // Le propriétaire les lit ; un autre utilisateur de l'espace n'en lit AUCUN.
    h.whereCalls.length = 0
    expect(await h.service.listPersonalContacts(WS, 'user-1', ACCOUNT)).toHaveLength(4)
    expect(await h.service.listPersonalContacts(WS, 'user-2', ACCOUNT)).toEqual([])
    // Sans compte (écran /contacts) : tous ceux du propriétaire, et toujours aucun pour un autre.
    expect(await h.service.listPersonalContacts(WS, 'user-1')).toHaveLength(4)
    expect(await h.service.listPersonalContacts(WS, 'user-2')).toEqual([])
    expect(h.whereCalls.at(-1)).toMatchObject({ user_id: 'user-2', workspace_id: WS })
  })

  it("#2927 — « Partager avec l'équipe » : le contact naît dans contacts, la ligne personnelle est archivée, jamais supprimée", async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(2), 'personal')
    await h.service.process(WS, id)
    const [first] = h.tables.personal
    const personalId = String(first?.['id'])
    h.tables.personal.forEach((row, i) => Object.assign(row, { id: `p-${i}` }))

    // Un AUTRE utilisateur ne peut pas partager le contact de quelqu'un d'autre.
    await expect(h.service.promotePersonalContact(WS, 'user-2', 'p-0')).rejects.toBeInstanceOf(NotFoundException)
    expect(h.tables.contacts).toHaveLength(0)

    const shared = await h.service.promotePersonalContact(WS, 'user-1', 'p-0')
    expect(h.tables.contacts).toHaveLength(1)
    expect(h.tables.contacts[0]).toMatchObject({
      workspace_id: WS,
      account_id: ACCOUNT,
      user_id: 'user-1',
      full_name: first?.['full_name'],
    })
    expect(shared).toEqual({ contactId: h.tables.contacts[0]?.['id'], alreadyKnown: false })
    // Archivée : la ligne reste, mais sort de « Mes contacts personnels ».
    expect(h.tables.personal).toHaveLength(2)
    expect(h.tables.personal[0]).toMatchObject({ promoted_contact_id: shared.contactId })
    expect(h.tables.personal[0]?.['promoted_at']).toBeInstanceOf(Date)
    expect(await h.service.listPersonalContacts(WS, 'user-1', ACCOUNT)).toHaveLength(1)
    expect(personalId).toBeTruthy()
  })

  it("#2927 — partager un contact dont l'e-mail est déjà connu de l'équipe ne crée PAS de doublon", async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(1), 'personal')
    await h.service.process(WS, id)
    Object.assign(h.tables.personal[0] ?? {}, { id: 'p-0' })
    h.tables.contacts.push({
      id: 'known-1',
      workspace_id: WS,
      account_id: ACCOUNT,
      email: h.tables.personal[0]?.['email'],
    })

    const shared = await h.service.promotePersonalContact(WS, 'user-1', 'p-0')
    expect(shared).toEqual({ contactId: 'known-1', alreadyKnown: true })
    expect(h.tables.contacts).toHaveLength(1)
    expect(h.tables.personal[0]).toMatchObject({ promoted_contact_id: 'known-1' })
  })

  it('#2927 — un ré-import personnel ne double pas ce que son auteur a déjà en privé', async () => {
    const h = harness()
    await h.service.process(WS, await uploadAndStart(h, csvOf(3), 'personal'))
    const again = await uploadAndStart(h, csvOf(3), 'personal')
    await h.service.process(WS, again)
    expect(h.tables.personal).toHaveLength(3)
    expect(await h.service.state(WS, again)).toMatchObject({ imported: 0, duplicates: 3 })
  })

  it('#2927 — un import d’ÉQUIPE (défaut) continue d’écrire dans contacts', async () => {
    const h = harness()
    await h.service.process(WS, await uploadAndStart(h, csvOf(3)))
    expect(h.tables.contacts).toHaveLength(3)
    expect(h.tables.personal).toHaveLength(0)
  })

  it('un paquet interrompu ne laisse RIEN ; la reprise repart du dernier paquet validé, sans doublon', async () => {
    const h = harness({ failOnTransaction: 2 })
    const id = await uploadAndStart(h, csvOf(rows))
    await expect(h.service.process(WS, id)).rejects.toThrow('connexion perdue')

    // Le premier paquet est validé, le second n'a rien laissé.
    const afterCrash = await h.service.state(WS, id)
    expect(afterCrash.processedRows).toBe(UNIVERSAL_IMPORT_CHUNK_ROWS)
    expect(h.tables.contacts).toHaveLength(UNIVERSAL_IMPORT_CHUNK_ROWS - 2)

    // BullMQ retente : on reprend au paquet 2, pas depuis zéro.
    await h.service.process(WS, id)
    const done = await h.service.state(WS, id)
    expect(done).toMatchObject({ status: 'done', processedRows: rows, imported: rows - 2, duplicates: 1 })
    expect(new Set(h.tables.contacts.map(contact => contact['email'])).size).toBe(h.tables.contacts.length)
  })

  it('un job `failed` se REPREND (timeout ≠ échec définitif) ; un job terminé ne se relance pas', async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(3))
    await h.service.markFailed(WS, id, 'interrupted:TimeoutError')
    await expect(h.service.resume(WS, id)).resolves.toMatchObject({ status: 'queued', error: null })
    expect(h.queue.add).toHaveBeenCalledTimes(2)
    await h.service.process(WS, id)
    await expect(h.service.resume(WS, id)).rejects.toThrow(/interrompu/)
  })

  it('un job ne se lit JAMAIS hors de son espace — et chaque lecture porte workspace_id', async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(3))
    await expect(h.service.state(OTHER_WS, id)).rejects.toBeInstanceOf(NotFoundException)
    await expect(h.service.reportCsv(OTHER_WS, id)).rejects.toBeInstanceOf(NotFoundException)
    await expect(h.service.process(OTHER_WS, id)).resolves.toBe(false)
    expect(h.whereCalls.length).toBeGreaterThan(0)
    for (const where of h.whereCalls) expect(where).toHaveProperty('workspace_id')
  })

  it('refuse une part sautée, une part trop grande, et un lancement sur fichier incomplet', async () => {
    const h = harness()
    const job = await h.service.create(WS, 'user-1', { type: 'contact', filename: 'c.csv', parts: 2 })
    await expect(h.service.putPart(WS, job.id, 1, Buffer.from('x').toString('base64'))).rejects.toThrow(
      /avant la part 0/,
    )
    const tooBig = Buffer.alloc(UNIVERSAL_IMPORT_PART_BYTES + 1).toString('base64')
    await expect(h.service.putPart(WS, job.id, 0, tooBig)).rejects.toThrow(/taille de part/)
    await h.service.putPart(WS, job.id, 0, Buffer.from('Nom\n').toString('base64'))
    await expect(h.service.start(WS, job.id, { Nom: 'full_name' })).rejects.toThrow(/incomplet/)
  })

  // #3666.9 (Louis 15/10/2026) — incident du 05/10 : l'octet d'un import ne transite plus par l'API.
  // Le navigateur dépose chaque part DIRECTEMENT dans le stockage (URL signée) ; l'API la confirme.
  it('#3666.9 — une part se dépose par URL signée, puis se confirme (taille lue dans le stockage)', async () => {
    const h = harness()
    const job = await h.service.create(WS, 'user-1', { type: 'contact', filename: 'c.csv', parts: 1 })
    const ticket = await h.service.signPart(WS, job.id, 0)
    expect(ticket.uploadUrl).toContain(`universal-imports/${WS}/${job.id}/part-000000`)
    // Le navigateur a déposé la part (simulé) : l'API ne l'a jamais reçue.
    h.blobs.set(ticket.path, Buffer.from('Nom\nAda Lovelace\n'))
    await h.service.confirmPart(WS, job.id, 0)
    // Le fichier est complet : l'aperçu se lit (en flux, depuis le stockage).
    const preview = await h.service.preview(WS, job.id)
    expect(preview.headers).toEqual(['Nom'])
  })

  it('#3666.9 — sait dire NON : part sautée, part absente du stockage, part trop grosse', async () => {
    const h = harness()
    const job = await h.service.create(WS, 'user-1', { type: 'contact', filename: 'c.csv', parts: 2 })
    await expect(h.service.signPart(WS, job.id, 1)).rejects.toThrow(/avant la part 0/)
    const ticket = await h.service.signPart(WS, job.id, 0)
    await expect(h.service.confirmPart(WS, job.id, 0)).rejects.toThrow(/introuvable/)
    h.blobs.set(ticket.path, Buffer.alloc(UNIVERSAL_IMPORT_PART_BYTES + 1))
    await expect(h.service.confirmPart(WS, job.id, 0)).rejects.toThrow(/taille de part/)
  })

  it('dit NON à un format inconnu et à un mapping vers un champ qui n’existe pas', async () => {
    const h = harness()
    await expect(h.service.create(WS, 'u', { type: 'contact', filename: 'photo.png', parts: 1 })).rejects.toThrow(
      /Format/,
    )
    const job = await h.service.create(WS, 'u', { type: 'contact', filename: 'c.csv', parts: 1 })
    await h.service.putPart(WS, job.id, 0, Buffer.from('Nom\nAda\n').toString('base64'))
    await expect(h.service.start(WS, job.id, { Nom: 'siren' })).rejects.toThrow(/inconnu/)
  })

  it('la prévisualisation propose le mapping et garde une colonne inconnue en extra (null)', async () => {
    const h = harness()
    const job = await h.service.create(WS, 'u', { type: 'account', filename: 'comptes.csv', parts: 1 })
    await h.service.putPart(
      WS,
      job.id,
      0,
      Buffer.from('Raison sociale;Secteur;Commercial historique\nAcme;BTP;Jean\n').toString('base64'),
    )
    const preview = await h.service.preview(WS, job.id)
    expect(preview.mapping).toEqual({
      'Raison sociale': 'company_name',
      Secteur: 'sector',
      'Commercial historique': null,
    })
    expect(preview.sample).toHaveLength(1)
  })

  it('une ligne que la BASE refuse (contrainte) part au rapport en `write_failed` ; les autres du paquet passent', async () => {
    const h = harness({ rejectEmail: 'p2@exemple.test' })
    const id = await uploadAndStart(h, csvOf(4))
    await h.service.process(WS, id)
    expect(await h.service.state(WS, id)).toMatchObject({ status: 'done', imported: 3, rejected: 1 })
    expect(await h.service.reportCsv(WS, id)).toContain('4;rejected;write_failed;;Personne 2')
  })

  it('consultants : un fichier XLSX-like de vivier s’écrit en `needs_review`, TJM en euros, compétences gardées en extra', async () => {
    const h = harness()
    const job = await h.service.create(WS, 'u', { type: 'talent', filename: 'vivier.csv', parts: 1 })
    await h.service.putPart(
      WS,
      job.id,
      0,
      Buffer.from('Nom;TJM;Compétences\nAda Lovelace;650 €;Java, Kotlin\n').toString('base64'),
    )
    const preview = await h.service.preview(WS, job.id)
    await h.service.start(WS, job.id, preview.mapping)
    await h.service.process(WS, job.id)
    expect(h.tables.talents[0]).toMatchObject({
      full_name: 'Ada Lovelace',
      tjm: 650,
      review_status: 'needs_review',
      source: 'csv_import',
      workspace_id: WS,
      extra: { Compétences: 'Java, Kotlin' },
    })
  })

  it('deux « Lancer » simultanés n’enfilent qu’UN job ; les parts sont effacées une fois le job terminé', async () => {
    const h = harness()
    const job = await h.service.create(WS, 'u', { type: 'contact', filename: 'c.csv', parts: 1, accountId: ACCOUNT })
    await h.service.putPart(WS, job.id, 0, Buffer.from('Nom\nAda Lovelace\n').toString('base64'))
    const results = await Promise.allSettled([
      h.service.start(WS, job.id, { Nom: 'full_name' }),
      h.service.start(WS, job.id, { Nom: 'full_name' }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(h.queue.add).toHaveBeenCalledTimes(1)
    expect(h.blobs.size).toBe(1)
    await h.service.process(WS, job.id)
    expect(h.blobs.size).toBe(0)
  })

  /** L'export d'Antoine, en miniature : 38 colonnes deviennent 8, la structure reste (CCON / CSOC, homonymes). */
  const CRM_EXPORT = [
    'Référence contact;Référence société;Nom;Email;Société;Effectif;Type société;Statut contact',
    'CCON1;CSOC1;Ada Lovelace;ada@acme.test;Acme;250;Client;Engagé',
    'CCON2;CSOC1;Grace Hopper;;Acme;250;Client;Nouveau',
    'CCON3;CSOC2;Alan Turing;alan@acme-nord.test;Acme;40;Prospect;Lien établi',
    'CCON4;;Linus Torvalds;linus@x.test;Inconnue SA;;;Nouveau',
    'CCON5;CSOC9;Barbara Liskov;;;;;Nouveau',
  ].join('\n')

  async function importCrm(h: ReturnType<typeof harness>, text: string): Promise<string> {
    const job = await h.service.create(WS, 'user-1', {
      type: 'contact',
      filename: 'contacts.csv',
      parts: 1,
      sourceSystem: 'BoondManager',
    })
    await h.service.putPart(WS, job.id, 0, Buffer.from(text).toString('base64'))
    const preview = await h.service.preview(WS, job.id)
    await h.service.start(WS, job.id, preview.mapping)
    await h.service.process(WS, job.id)
    return job.id
  }

  it('#4053 / #4051 — un export contacts CRÉE les comptes par référence ; le bilan sépare familles et sorts', async () => {
    const h = harness()
    const id = await importCrm(h, CRM_EXPORT)

    // Deux références société → deux comptes (homonymes NON fusionnés), nourris des colonnes société ;
    // #5222 (Louis 03/11) — la société NOMMÉE sans référence (« Inconnue SA ») est créée, clé = son nom.
    expect(h.tables.accounts).toHaveLength(3)
    expect(h.tables.accounts[2]).toMatchObject({ company_name: 'Inconnue SA', status: 'imported' })
    expect(h.tables.accounts[0]).toMatchObject({ company_name: 'Acme', employees: '250', status: 'imported' })
    expect(h.tables.accounts[0]?.['extra']).toEqual({ 'Type société': 'Client' })
    expect(h.tables.contacts).toHaveLength(4)
    expect(h.tables.contacts[0]?.['extra']).toEqual({ 'Statut contact': 'Engagé' })
    // Les références, bornées à l'espace ET à la source — jamais un nom, jamais un SIREN.
    expect(h.tables.links.map(link => [link['provider'], link['entity_type'], link['external_id']]).sort()).toEqual([
      ['csv', 'account', 'boondmanager:CSOC1'],
      ['csv', 'account', 'boondmanager:CSOC2'],
      ['csv', 'contact', 'boondmanager:CCON1'],
      ['csv', 'contact', 'boondmanager:CCON2'],
      ['csv', 'contact', 'boondmanager:CCON3'],
      ['csv', 'contact', 'boondmanager:CCON4'],
    ])

    const state = await h.service.state(WS, id)
    expect(state).toMatchObject({
      status: 'done',
      totalRows: 5,
      imported: 4,
      rejected: 0,
      toReconcile: 2,
      sourceSystem: 'BoondManager',
      queryableByLaura: 7,
    })
    expect(state.breakdown).toEqual({
      account: { created: 3, matched: 0, duplicates: 0, rejected: 0, toReconcile: 1 },
      contact: {
        created: 4,
        matched: 0,
        duplicates: 0,
        rejected: 0,
        toReconcile: 1,
        distinctPeople: 4,
        resolvedAccounts: 3,
      },
    })
    const csv = await h.service.reportCsv(WS, id)
    expect(csv).toMatch(/\n4;to_reconcile;probable_duplicate_account;[0-9a-f-]{36};Acme\n/)
    expect(csv).not.toContain('company_to_validate')
    expect(csv).toContain('6;to_reconcile;unknown_company_ref;;CSOC9')
  })

  it('#4052.3 — rejouer le CRM à jour : aucune copie, la fiche se COMPLÈTE sans écraser une correction', async () => {
    const h = harness()
    await importCrm(h, CRM_EXPORT)
    // Correction humaine entre-temps : rien dans l'import ne doit la réécrire (COALESCE côté SQL).
    const updated = CRM_EXPORT.replace('CCON2;CSOC1;Grace Hopper;;', 'CCON2;CSOC1;Grace Hopper;grace@acme.test;')
    const again = await importCrm(h, updated)

    expect(h.tables.accounts).toHaveLength(3)
    expect(h.tables.contacts).toHaveLength(4)
    const state = await h.service.state(WS, again)
    expect(state).toMatchObject({ imported: 0, duplicates: 0 })
    expect(state.breakdown['contact']).toMatchObject({ created: 0, matched: 4 })
    expect(state.breakdown['account']).toBeUndefined()
    const grace = h.updates.find(update => update.params.includes('grace@acme.test'))
    expect(grace?.sql).toContain("email = COALESCE(NULLIF(email, ''), $3)")
    expect(grace?.sql).toContain('workspace_id = $2')
  })

  it('#4052.2 — la même référence chez un AUTRE CRM ne désigne pas la même fiche', async () => {
    const h = harness()
    await importCrm(h, CRM_EXPORT)
    const job = await h.service.create(WS, 'user-1', {
      type: 'contact',
      filename: 'autre.csv',
      parts: 1,
      sourceSystem: 'Sellsy',
    })
    await h.service.putPart(
      WS,
      job.id,
      0,
      Buffer.from('Référence contact;Référence société;Nom;Société\nCCON1;CSOC1;Ada Lovelace;Globex\n').toString(
        'base64',
      ),
    )
    await h.service.start(WS, job.id, (await h.service.preview(WS, job.id)).mapping)
    await h.service.process(WS, job.id)
    expect(h.tables.accounts.map(account => account['company_name'])).toEqual(['Acme', 'Acme', 'Inconnue SA', 'Globex'])
    expect(h.tables.links.filter(link => link['external_id'] === 'sellsy:CSOC1')).toHaveLength(1)
  })

  it('#4051.1 — un import personnel ne se dit pas « interrogeable par Laura » : non mesuré, jamais 0', async () => {
    const h = harness()
    const id = await uploadAndStart(h, csvOf(2), 'personal')
    await h.service.process(WS, id)
    expect((await h.service.state(WS, id)).queryableByLaura).toBeNull()
  })

  it('#4052.3 — une complétion que la base refuse part au rapport ; le reste du paquet passe', async () => {
    const h = harness({ rejectEmail: 'grace@acme.test' })
    await importCrm(h, CRM_EXPORT)
    const updated = CRM_EXPORT.replace('CCON2;CSOC1;Grace Hopper;;', 'CCON2;CSOC1;Grace Hopper;grace@acme.test;')
    const again = await importCrm(h, updated)
    const state = await h.service.state(WS, again)
    expect(state).toMatchObject({ status: 'done', rejected: 1 })
    expect(state.breakdown['contact']).toMatchObject({ matched: 4, rejected: 1 })
    expect(await h.service.reportCsv(WS, again)).toMatch(/\n3;rejected;write_failed;[0-9a-f-]{36};\n/)
  })
})

// #4426.4 — le classeur de tiering : « Synthèse » ne se lit jamais, le tableau des comptes oui.
describe('UniversalImportService — #4426.4 le bon onglet d’un classeur', () => {
  async function tieringJob(h: ReturnType<typeof harness>): Promise<string> {
    const workbook = new ExcelJS.Workbook()
    const synthese = workbook.addWorksheet('Synthèse')
    synthese.addRow(['Tiering 2026-2027'])
    synthese.addRow(['Tier', 'Nombre'])
    synthese.addRow(['A', 1])
    const comptes = workbook.addWorksheet('Tiering 2026-2027')
    comptes.addRow(['Nom de la société', 'domain', 'Tiering (A, B, C)'])
    comptes.addRow(['Acme', 'acme.example', 'A'])
    comptes.addRow(['Globex', 'globex.example', 'B'])
    workbook.addWorksheet('Supprimées').addRow(['Initech'])
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
    const job = await h.service.create(WS, 'user-1', { type: 'account', filename: 'tiering.xlsx', parts: 1 })
    await h.service.putPart(WS, job.id, 0, bytes.toString('base64'))
    return job.id
  }

  it('l’aperçu retient la feuille qui reconnaît une colonne entreprise et nomme les autres', async () => {
    const h = harness()
    const preview = await h.service.preview(WS, await tieringJob(h))
    expect(preview.sheet).toBe('Tiering 2026-2027')
    expect(preview.sheets?.map(sheet => sheet.name)).toEqual(['Synthèse', 'Tiering 2026-2027', 'Supprimées'])
    expect(preview.mapping['Nom de la société']).toBe('company_name')
    expect(preview.sample).toHaveLength(2)
  })

  it('l’import écrit 2 comptes, tier A et B gardés, sans lire « Synthèse »', async () => {
    const h = harness()
    const id = await tieringJob(h)
    const preview = await h.service.preview(WS, id)
    await h.service.start(WS, id, preview.mapping, preview.sheet)
    await h.service.process(WS, id)
    expect(h.tables.accounts.map(account => account['company_name'])).toEqual(['Acme', 'Globex'])
    // #4426.1 — le tier ne reste plus enfoui dans `extra` : il est posé en étiquette « Tier X ».
    expect(h.tables.accounts.map(account => account['tags'])).toEqual([['Tier A'], ['Tier B']])
  })

  it('#5223 — l’aperçu dit, feuille par feuille, si les colonnes sont reconnues', async () => {
    const h = harness()
    const preview = await h.service.preview(WS, await tieringJob(h))
    expect(preview.sheets?.map(sheet => [sheet.name, sheet.recognised])).toEqual([
      ['Synthèse', false],
      ['Tiering 2026-2027', true],
      ['Supprimées', false],
    ])
  })

  it('l’onglet choisi par l’humain est celui que l’import lit', async () => {
    const h = harness()
    const id = await tieringJob(h)
    const preview = await h.service.preview(WS, id, 'Supprimées')
    expect(preview.sheet).toBe('Supprimées')
    expect(preview.headers).toEqual(['Initech'])
  })
})

describe('UniversalImportService — #5223 un dépôt, toutes les feuilles', () => {
  async function classeur(h: ReturnType<typeof harness>): Promise<string> {
    const workbook = new ExcelJS.Workbook()
    const a = workbook.addWorksheet('Comptes A')
    a.addRow(['Nom de la société', 'domain'])
    a.addRow(['Acme', 'acme.example'])
    a.addRow(['Globex', 'globex.example'])
    const b = workbook.addWorksheet('Comptes B')
    b.addRow(['Raison sociale', 'Site'])
    b.addRow(['Initech', 'initech.example'])
    b.addRow(['', 'sans-nom.example'])
    workbook.addWorksheet('Synthèse').addRow(['Tiering 2026'])
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
    const job = await h.service.create(WS, 'user-1', { type: 'account', filename: 'prospection.xlsx', parts: 1 })
    await h.service.putPart(WS, job.id, 0, bytes.toString('base64'))
    return job.id
  }
  const plans: Array<{ name: string; mapping: Record<string, string | null> }> = [
    { name: 'Comptes A', mapping: { 'Nom de la société': 'company_name', domain: 'website' } },
    { name: 'Comptes B', mapping: { 'Raison sociale': 'company_name', Site: 'website' } },
  ]

  it('lit deux feuilles aux colonnes différentes, un seul bilan ventilé par feuille', async () => {
    const h = harness()
    const id = await classeur(h)
    await h.service.start(WS, id, plans[0]!.mapping, null, { sheets: plans })
    await h.service.process(WS, id)
    expect(h.tables.accounts.map(account => account['company_name'])).toEqual(['Acme', 'Globex', 'Initech'])
    const state = await h.service.state(WS, id)
    expect(state).toMatchObject({ status: 'done', totalRows: 4, imported: 3, rejected: 1 })
    expect(state.sheets?.map(sheet => [sheet.name, sheet.totalRows, sheet.created, sheet.rejected])).toEqual([
      ['Comptes A', 2, 2, 0],
      ['Comptes B', 2, 1, 1],
    ])
    expect(state.sheets?.[1]?.reasons).toEqual([{ kind: 'rejected', reason: 'missing_required_field', count: 1 }])
  })

  it('la reprise ne rejoue PAS une feuille terminée', async () => {
    const h = harness({ failOnTransaction: 2 })
    const id = await classeur(h)
    await h.service.start(WS, id, plans[0]!.mapping, null, { sheets: plans })
    await expect(h.service.process(WS, id)).rejects.toThrow('connexion perdue')
    const crashed = await h.service.state(WS, id)
    expect(crashed.sheets?.map(sheet => sheet.done)).toEqual([true, false])
    await h.service.process(WS, id)
    expect(h.tables.accounts.map(account => account['company_name'])).toEqual(['Acme', 'Globex', 'Initech'])
    expect((await h.service.state(WS, id)).sheets?.map(sheet => sheet.done)).toEqual([true, true])
  })

  it('NON : une feuille absente du classeur n’est jamais remplacée par une autre', async () => {
    const h = harness()
    const id = await classeur(h)
    await h.service.start(WS, id, plans[0]!.mapping, null, {
      sheets: [{ name: 'Fantôme', mapping: plans[0]!.mapping }],
    })
    await expect(h.service.process(WS, id)).rejects.toThrow('Fantôme')
    expect(h.tables.accounts).toHaveLength(0)
  })

  it('NON : « ne pas importer ces lignes » (numéros d’UNE feuille) ne se mélange pas à plusieurs feuilles', async () => {
    const h = harness()
    const id = await classeur(h)
    await expect(h.service.start(WS, id, plans[0]!.mapping, null, { sheets: plans, skipLines: [2] })).rejects.toThrow()
  })

  it('la vérification ventile par feuille', async () => {
    const h = harness()
    const id = await classeur(h)
    const report = await h.service.verify(WS, id, plans[0]!.mapping, null, { sheets: plans })
    expect(report.sheets?.map(sheet => [sheet.name, sheet.total, sheet.toCreate, sheet.discarded])).toEqual([
      ['Comptes A', 2, 2, 0],
      ['Comptes B', 2, 1, 1],
    ])
    expect(report).toMatchObject({ total: 4, toCreate: 3, discarded: 1 })
    expect(h.tables.accounts).toHaveLength(0)
  })
})

describe('UniversalImportService — #5224 le type se propose par feuille', () => {
  // Les contacts sont AVANT les sociétés dans le classeur : l'ordre du fichier ne doit rien changer.
  async function fichierMixte(h: ReturnType<typeof harness>): Promise<string> {
    const workbook = new ExcelJS.Workbook()
    const contacts = workbook.addWorksheet('Contacts')
    contacts.addRow(['Prénom', 'Nom', 'E-mail', 'Société'])
    contacts.addRow(['Ada', 'Lovelace', 'ada@acme.example', 'Acme'])
    contacts.addRow(['Alan', 'Turing', 'alan@acme.example', 'Acme'])
    const societes = workbook.addWorksheet('Sociétés')
    societes.addRow(['Nom de la société', 'domain'])
    societes.addRow(['Acme', 'acme.example'])
    workbook.addWorksheet('Notes').addRow(['Tiering 2026'])
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
    const job = await h.service.create(WS, 'user-1', { type: 'contact', filename: 'prospection.xlsx', parts: 1 })
    await h.service.putPart(WS, job.id, 0, bytes.toString('base64'))
    return job.id
  }
  const contactMapping = { Prénom: 'first_name', Nom: 'last_name', 'E-mail': 'email', Société: 'company' }
  const accountMapping = { 'Nom de la société': 'company_name', domain: 'website' }

  it('l’aperçu annonce, par feuille, ce qu’il croit lire et les colonnes sur lesquelles il s’appuie', async () => {
    const h = harness()
    const preview = await h.service.preview(WS, await fichierMixte(h))
    const byName = new Map(preview.sheets?.map(sheet => [sheet.name, sheet]))
    expect(byName.get('Contacts')?.detected).toEqual({
      type: 'contact',
      columns: ['Prénom', 'Nom', 'E-mail', 'Société'],
    })
    expect(byName.get('Sociétés')?.detected).toEqual({ type: 'account', columns: ['Nom de la société', 'domain'] })
  })

  it('NON : la feuille qui ne ressemble à rien est nommée sans type — jamais rangée dans un défaut', async () => {
    const h = harness()
    const preview = await h.service.preview(WS, await fichierMixte(h))
    const notes = preview.sheets?.find(sheet => sheet.name === 'Notes')
    expect(notes).toBeDefined()
    expect(notes?.detected).toBeUndefined()
  })

  it('UN import écrit les deux : les sociétés d’abord, les contacts rattachés ensuite', async () => {
    const h = harness()
    const id = await fichierMixte(h)
    await h.service.start(WS, id, contactMapping, null, {
      sheets: [
        { name: 'Contacts', type: 'contact', mapping: contactMapping },
        { name: 'Sociétés', type: 'account', mapping: accountMapping },
      ],
    })
    await h.service.process(WS, id)
    expect(h.tables.accounts.map(account => account['company_name'])).toEqual(['Acme'])
    expect(h.tables.contacts).toHaveLength(2)
    const accountId = h.tables.accounts[0]?.['id']
    expect(accountId).toBeDefined()
    expect(h.tables.contacts.map(contact => contact['account_id'])).toEqual([accountId, accountId])
    const state = await h.service.state(WS, id)
    expect(state.status).toBe('done')
    expect(state.sheets?.map(sheet => [sheet.name, sheet.type, sheet.created])).toEqual([
      ['Sociétés', 'account', 1],
      ['Contacts', 'contact', 2],
    ])
    expect(state.breakdown['account']?.created).toBe(1)
    expect(state.breakdown['contact']?.created).toBe(2)
  })

  it('une correction humaine gagne : la correspondance est validée contre le type CHOISI de la feuille', async () => {
    const h = harness()
    const id = await fichierMixte(h)
    await expect(
      h.service.start(WS, id, contactMapping, null, {
        sheets: [{ name: 'Contacts', type: 'account', mapping: contactMapping }],
      }),
    ).rejects.toThrow('Contacts')
  })

  it('NON : la portée personnelle n’existe que pour des feuilles de contacts', async () => {
    const h = harness()
    const id = await fichierMixte(h)
    await expect(
      h.service.start(WS, id, contactMapping, null, {
        scope: 'personal',
        sheets: [
          { name: 'Contacts', type: 'contact', mapping: contactMapping },
          { name: 'Sociétés', type: 'account', mapping: accountMapping },
        ],
      }),
    ).rejects.toThrow()
  })

  it('la vérification lit chaque feuille COMME son type, sans rien écrire', async () => {
    const h = harness()
    const id = await fichierMixte(h)
    const report = await h.service.verify(WS, id, contactMapping, null, {
      sheets: [
        { name: 'Contacts', type: 'contact', mapping: contactMapping },
        { name: 'Sociétés', type: 'account', mapping: accountMapping },
      ],
    })
    expect(report.sheets?.map(sheet => [sheet.name, sheet.total, sheet.toCreate])).toEqual([
      ['Sociétés', 1, 1],
      ['Contacts', 2, 2],
    ])
    expect(h.tables.accounts).toHaveLength(0)
    expect(h.tables.contacts).toHaveLength(0)
  })
})

// Théo B c4-assistant-import.R3/N1/A2 — la VÉRIFICATION avant d'importer : le plan du fichier, ligne à ligne,
// SANS rien écrire. Quelle que soit la taille du fichier : l'import en arrière-plan ne part qu'APRÈS elle.
describe('UniversalImportService — vérification avant import (Théo B c4)', () => {
  async function uploaded(h: ReturnType<typeof harness>, text: string): Promise<string> {
    const bytes = Buffer.from(text)
    const job = await h.service.create(WS, 'user-1', {
      type: 'contact',
      filename: 'salon.csv',
      parts: 1,
      accountId: ACCOUNT,
    })
    await h.service.putPart(WS, job.id, 0, bytes.toString('base64'))
    return job.id
  }
  const MAPPING = { Nom: 'full_name', Email: 'email', 'Code ERP': null }

  it('rend un verdict par ligne et les compteurs, sans écrire une seule fiche', async () => {
    const h = harness()
    const id = await uploaded(h, csvOf(10))
    const report = await h.service.verify(WS, id, MAPPING)
    expect(report.total).toBe(10)
    // ligne 7 sans nom → invalide ; ligne 9 répète l'e-mail de la ligne 8 → doublon dans le fichier
    expect(report.toCreate).toBe(8)
    expect(report.discarded).toBe(2)
    expect(report.rows.find(row => row.line === 7)).toMatchObject({ verdict: 'invalid' })
    expect(report.rows.find(row => row.line === 9)).toMatchObject({ verdict: 'duplicate' })
    expect(report.rows.find(row => row.line === 2)).toMatchObject({ verdict: 'create', label: 'Personne 0' })
    expect(h.tables.contacts).toHaveLength(0)
    expect(h.tables.issues).toHaveLength(0)
    expect(h.queue.add).not.toHaveBeenCalled()
  })

  it('signale les colonnes sensibles du fichier, par leur en-tête', async () => {
    const h = harness()
    const id = await uploaded(h, 'Nom;Email;Santé\nA;a@exemple.test;arrêt maladie')
    const report = await h.service.verify(WS, id, { Nom: 'full_name', Email: 'email', Santé: null })
    expect(report.sensitiveColumns).toEqual(['Santé'])
  })

  it('refuse un job d’un autre espace', async () => {
    const h = harness()
    const id = await uploaded(h, csvOf(3))
    await expect(h.service.verify(OTHER_WS, id, MAPPING)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('borne le détail ligne à ligne mais compte TOUT le fichier', async () => {
    const h = harness()
    const id = await uploaded(h, csvOf(40))
    const report = await h.service.verify(WS, id, MAPPING, null, { rowCap: 10 })
    expect(report.total).toBe(40)
    expect(report.rows).toHaveLength(10)
    expect(report.truncated).toBe(true)
  })

  it('« Ne pas importer » une ligne : le lancement l’écarte et la liste au rapport', async () => {
    const h = harness()
    const id = await uploaded(h, csvOf(4))
    await h.service.start(WS, id, MAPPING, null, { skipLines: [3] })
    await h.service.process(WS, id)
    expect(h.tables.contacts).toHaveLength(3)
    expect(h.tables.issues.find(issue => issue['row_number'] === 3)).toMatchObject({
      kind: 'rejected',
      reason: 'skipped_by_user',
    })
  })

  it('la portée et le CRM d’origine se posent APRÈS le dépôt : posés au lancement, relus par le job', async () => {
    const h = harness()
    const id = await uploaded(h, csvOf(3))
    await h.service.start(WS, id, MAPPING, null, { scope: 'personal', sourceSystem: 'Mon outil' })
    expect(h.tables.jobs[0]).toMatchObject({ scope: 'personal', source_system: 'Mon outil' })
  })

  it('la vérification lit la portée choisie : un import personnel ne crée aucun compte', async () => {
    const h = harness()
    const id = await uploaded(h, csvOf(3))
    const report = await h.service.verify(WS, id, MAPPING, null, { scope: 'personal' })
    expect(report.total).toBe(3)
    expect(h.tables.jobs[0]).toMatchObject({ scope: 'workspace' }) // la vérification n'écrit rien sur le job
  })
})
