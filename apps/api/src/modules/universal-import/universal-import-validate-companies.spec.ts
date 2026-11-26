import { ConflictException, NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { UniversalImportIssueEntity } from '../../database/entities/universal-import-job.entity'
import type { UniversalImportJobEntity } from '../../database/entities/universal-import-job.entity'
import { UniversalImportService } from './universal-import.service'

// #AM.9 (#4053) — valider d'un clic les sociétés « à valider » du bilan, sans refaire l'import.
const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
type Row = Record<string, unknown>

function build(options: { scope?: string; existing?: string[]; issues?: Row[] } = {}) {
  const job = { id: 'job-1', workspace_id: WS, user_id: 'user-1', scope: options.scope ?? 'workspace', type: 'contact' }
  const inserted: Row[] = []
  const issues = options.issues ?? [
    {
      job_id: 'job-1',
      workspace_id: WS,
      row_number: 2,
      kind: 'to_reconcile',
      reason: 'company_to_validate',
      existing_id: null,
      label: 'Inconnue SA',
    },
    {
      job_id: 'job-1',
      workspace_id: WS,
      row_number: 3,
      kind: 'to_reconcile',
      reason: 'company_to_validate',
      existing_id: null,
      label: 'INCONNUE sa ',
    },
    {
      job_id: 'job-1',
      workspace_id: WS,
      row_number: 4,
      kind: 'to_reconcile',
      reason: 'company_to_validate',
      existing_id: null,
      label: 'Déjà Là',
    },
    {
      job_id: 'job-1',
      workspace_id: WS,
      row_number: 5,
      kind: 'to_reconcile',
      reason: 'unknown_company_ref',
      existing_id: null,
      label: 'CSOC9',
    },
    {
      job_id: 'job-1',
      workspace_id: WS,
      row_number: 6,
      kind: 'to_reconcile',
      reason: 'probable_duplicate_account',
      existing_id: 'acc-9',
      label: 'Acme',
    },
  ]
  const jobs = {
    findOne: async ({ where }: { where: Row }) => (where['id'] === job.id && where['workspace_id'] === WS ? job : null),
  }
  const issueRepo = {
    find: async ({ where }: { where: Row }) =>
      issues.filter(
        i =>
          i['kind'] === where['kind'] && i['reason'] === where['reason'] && i['workspace_id'] === where['workspace_id'],
      ),
  }
  const accounts = {
    find: async () => (options.existing ?? ['Déjà Là']).map((company_name, i) => ({ id: `acc-${i}`, company_name })),
    insert: async (values: Row[]) => void inserted.push(...values),
  }
  const service = new UniversalImportService(
    jobs as unknown as Repository<UniversalImportJobEntity>,
    issueRepo as unknown as Repository<UniversalImportIssueEntity>,
    accounts as unknown as Repository<AccountEntity>,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
  return { service, inserted }
}

describe('UniversalImportService.validateCompanies — #AM.9', () => {
  it('crée UNE société par nom proposé (casse et espaces ignorés), saute celles qui existent déjà', async () => {
    const h = build()
    const result = await h.service.validateCompanies(WS, 'user-2', 'job-1')
    expect(result).toEqual({ created: 1, alreadyThere: 1 })
    expect(h.inserted).toHaveLength(1)
    expect(h.inserted[0]).toMatchObject({
      workspace_id: WS,
      user_id: 'user-2',
      assigned_to: 'user-2',
      company_name: 'Inconnue SA',
      status: 'imported',
    })
  })

  it('NON : ni référence inconnue ni homonyme à fusionner ne crée quoi que ce soit — la fusion se propose', async () => {
    const h = build({
      existing: [],
      issues: [
        {
          job_id: 'job-1',
          workspace_id: WS,
          row_number: 5,
          kind: 'to_reconcile',
          reason: 'unknown_company_ref',
          existing_id: null,
          label: 'CSOC9',
        },
        {
          job_id: 'job-1',
          workspace_id: WS,
          row_number: 6,
          kind: 'to_reconcile',
          reason: 'probable_duplicate_account',
          existing_id: 'acc-9',
          label: 'Acme',
        },
      ],
    })
    expect(await h.service.validateCompanies(WS, 'user-2', 'job-1')).toEqual({ created: 0, alreadyThere: 0 })
    expect(h.inserted).toEqual([])
  })

  it('rejouer le clic ne crée rien de plus (les sociétés existent maintenant)', async () => {
    const h = build({ existing: ['Déjà Là', 'Inconnue SA'] })
    expect(await h.service.validateCompanies(WS, 'user-2', 'job-1')).toEqual({ created: 0, alreadyThere: 2 })
  })

  it('un import PERSONNEL ne crée aucun compte ; un job d’un autre espace est introuvable', async () => {
    await expect(build({ scope: 'personal' }).service.validateCompanies(WS, 'u', 'job-1')).rejects.toBeInstanceOf(
      ConflictException,
    )
    await expect(
      build().service.validateCompanies('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'u', 'job-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
