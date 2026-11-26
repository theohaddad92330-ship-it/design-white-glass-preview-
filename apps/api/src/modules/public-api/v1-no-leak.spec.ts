/**
 * v1-no-leak.spec.ts — locks the public `/v1` OUTPUT CONTRACT: internal
 * columns (raw analysis blob, internal costs, drafts, debug metadata,
 * ownership ids) must NEVER cross the public wire, and every read must be
 * scoped by the caller key's workspace.
 */
import type { Repository } from 'typeorm'
import { success, type Result } from '@bellum/utils'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { AccountsService, AccountFailure } from '../accounts/accounts.service'
import { PublicApiService } from './public-api.service'

const FULL_ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'internal-user-id',
  workspace_id: 'ws-A',
  company_name: 'Doctolib',
  sector: 'HealthTech',
  employees: '2800',
  revenue: '300M€',
  headquarters: 'Paris',
  website: 'https://doctolib.fr',
  siren: '794598813',
  registry_id: '794598813',
  registry_country: 'FR',
  naf_code: '62.01Z',
  subsidiaries: ['Doctolib GmbH'],
  it_challenges: [{ title: 'Scale infra', description: 'x', severity: 'high', timeframe: 'short' }],
  recent_signals: [{ signal: 'CTO hire', source: 'press', type: 'hiring', date: '2026-06', sales_implication: 'y' }],
  priority_score: 8,
  priority_justification: 'strong signals',
  raw_analysis: { secret_internal: 'FULL 200KB BLOB', branches: [] },
  status: 'completed',
  commercial_status: 'opportunity',
  error_message: 'internal trace',
  user_context: 'note interne du commercial',
  api_cost_euros: '1.2345',
  created_at: new Date('2026-07-01T00:00:00Z'),
  updated_at: new Date('2026-07-10T00:00:00Z'),
} as unknown as AccountEntity

const FULL_CONTACT = {
  id: '22222222-2222-4222-8222-222222222222',
  account_id: FULL_ACCOUNT.id,
  user_id: 'internal-user-id',
  workspace_id: 'ws-A',
  full_name: 'Jane CTO',
  title: 'CTO',
  entity: 'Doctolib',
  family: 'IT',
  decision_role: 'decision_maker',
  priority: 1,
  email: 'jane@doctolib.fr',
  email_verified: true,
  phone: '+33600000000',
  linkedin_url: 'https://linkedin.com/in/jane',
  profile_summary: 'summary',
  why_contact: 'owns the budget',
  email_message: { subject: 'DRAFT', body: 'internal draft body' },
  linkedin_message: 'internal linkedin draft',
  phone_script: 'internal phone script',
  followup_message: { body: 'internal follow-up' },
  user_status: 'new',
  email_sent_at: null,
  note: 'private sales note',
  hidden: false,
  source: 'apollo',
  lifecycle_state: 'actionable',
  raw_data: { apollo_payload: 'RAW ENRICHMENT DUMP' },
  contact_score: 87,
  language: 'fr',
  timezone: 'Europe/Paris',
  location: 'Paris',
  seniority: 'executive',
  scope: 'group',
  budget_authority: 'high',
  key_points: ['point'],
  signals: [],
  activity: [],
  relations: [],
  career_levers: ['visibility'],
  implicit_fears: ['losing control'],
  anonymized_at: null,
  created_at: new Date('2026-07-02T00:00:00Z'),
  updated_at: new Date('2026-07-11T00:00:00Z'),
} as unknown as ContactEntity

const FULL_RUN = {
  id: '33333333-3333-4333-8333-333333333333',
  account_id: FULL_ACCOUNT.id,
  user_id: 'internal-user-id',
  workspace_id: 'ws-A',
  status: 'completed',
  scope_mode: 'groupe',
  siren: '794598813',
  cost_eur: '2.5000',
  prompt_versions: { phase1: 'v12-internal' },
  created_at: new Date('2026-07-03T00:00:00Z'),
  completed_at: new Date('2026-07-03T00:05:00Z'),
} as unknown as AnalysisRunEntity

type FindAndCountArgs = { where: Record<string, unknown>; order: unknown; take: number; skip: number }

function makeService() {
  const calls: { contacts: FindAndCountArgs[]; runs: FindAndCountArgs[]; accountLookups: Array<[string, string]> } = {
    contacts: [],
    runs: [],
    accountLookups: [],
  }
  const contactsRepo = {
    findAndCount: async (args: FindAndCountArgs) => {
      calls.contacts.push(args)
      return [[FULL_CONTACT], 1]
    },
  } as unknown as Repository<ContactEntity>
  const runsRepo = {
    findAndCount: async (args: FindAndCountArgs) => {
      calls.runs.push(args)
      return [[FULL_RUN], 1]
    },
  } as unknown as Repository<AnalysisRunEntity>
  const accounts = {
    findOneForWorkspace: async (id: string, workspaceId: string): Promise<Result<AccountEntity, AccountFailure>> => {
      calls.accountLookups.push([id, workspaceId])
      return success(FULL_ACCOUNT)
    },
  } as unknown as AccountsService
  return { svc: new PublicApiService(accounts, contactsRepo, runsRepo), calls }
}

describe('PublicApiService — no internal column leaks', () => {
  it('account detail: strips raw_analysis, costs, internal notes and ownership ids', async () => {
    const { svc } = makeService()
    const result = await svc.getAccount('ws-A', FULL_ACCOUNT.id)
    expect(result.type).toBe('success')
    const account = result.type === 'success' ? result.output : ({} as never)

    for (const forbidden of [
      'raw_analysis',
      'api_cost_euros',
      'user_context',
      'error_message',
      'user_id',
      'workspace_id',
    ]) {
      expect(account).not.toHaveProperty(forbidden)
    }
    // Whole-payload sweep: the blob's content never appears anywhere.
    expect(JSON.stringify(account)).not.toContain('FULL 200KB BLOB')
    expect(JSON.stringify(account)).not.toContain('note interne')

    // The useful business fields ARE there.
    expect(account.company_name).toBe('Doctolib')
    expect(account.priority_score).toBe(8)
    expect(account.recent_signals).toHaveLength(1)
  })

  it('contacts: strips raw_data, drafted messages, notes and decider psychology', async () => {
    const { svc } = makeService()
    const page = await svc.listContacts('ws-A', { limit: 25, offset: 0 })
    const contact = page.data[0] as unknown as Record<string, unknown>

    for (const forbidden of [
      'raw_data',
      'email_message',
      'linkedin_message',
      'phone_script',
      'followup_message',
      'note',
      'career_levers',
      'implicit_fears',
      'user_id',
      'workspace_id',
    ]) {
      expect(contact).not.toHaveProperty(forbidden)
    }
    expect(JSON.stringify(page)).not.toContain('RAW ENRICHMENT DUMP')
    expect(JSON.stringify(page)).not.toContain('internal draft body')
    expect(JSON.stringify(page)).not.toContain('private sales note')

    expect(contact['full_name']).toBe('Jane CTO')
    expect(contact['decision_role']).toBe('decision_maker')
    expect(contact['email']).toBe('jane@doctolib.fr')
  })

  it('runs: strips cost_eur and prompt_versions (internal spend/debug)', async () => {
    const { svc } = makeService()
    const page = await svc.listRuns('ws-A', { limit: 25, offset: 0 })
    const run = page.data[0] as unknown as Record<string, unknown>

    for (const forbidden of ['cost_eur', 'prompt_versions', 'user_id', 'workspace_id']) {
      expect(run).not.toHaveProperty(forbidden)
    }
    expect(JSON.stringify(page)).not.toContain('v12-internal')
    expect(run['status']).toBe('completed')
    expect(run['scope_mode']).toBe('groupe')
  })
})

describe('PublicApiService — strict workspace scoping', () => {
  it('contact reads always carry the key workspace in the WHERE (plus hidden=false)', async () => {
    const { svc, calls } = makeService()
    await svc.listContacts('ws-A', { limit: 10, offset: 0 })
    expect(calls.contacts[0]?.where).toMatchObject({ workspace_id: 'ws-A', hidden: false })

    // A caller-supplied account_id NARROWS the read — the workspace predicate stays.
    await svc.listContacts('ws-A', { limit: 10, offset: 0, account_id: FULL_ACCOUNT.id })
    expect(calls.contacts[1]?.where).toMatchObject({ workspace_id: 'ws-A', account_id: FULL_ACCOUNT.id })
  })

  it('run reads always carry the key workspace in the WHERE', async () => {
    const { svc, calls } = makeService()
    await svc.listRuns('ws-B', { limit: 10, offset: 0 })
    expect(calls.runs[0]?.where).toMatchObject({ workspace_id: 'ws-B' })
  })

  it('account detail delegates to the workspace-scoped account read', async () => {
    const { svc, calls } = makeService()
    await svc.getAccount('ws-A', FULL_ACCOUNT.id)
    expect(calls.accountLookups[0]).toEqual([FULL_ACCOUNT.id, 'ws-A'])
  })

  it('pagination meta is computed from the scoped count', async () => {
    const { svc } = makeService()
    const page = await svc.listRuns('ws-A', { limit: 10, offset: 0 })
    expect(page.pagination).toEqual({
      currentPage: 1,
      size: 10,
      totalItems: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    })
  })
})
