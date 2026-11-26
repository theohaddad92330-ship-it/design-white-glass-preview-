import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import type { WorkspaceActiveSelectionEntity } from '../../database/entities/workspace-active-selection.entity'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'

// Même stub que `ia.client.spec.ts` : HttpClient appelle le `fetch` d'undici.
const mockFetch = jest.fn()
jest.mock('undici', () => ({ Agent: jest.fn(), fetch: (...args: unknown[]) => mockFetch(...args) }))

import { IaClient } from '../ia/ia.client'
import { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'

/**
 * #3901 — les métiers placés (`esn_profiles.placed_roles`) voyagent jusqu'au
 * corps de `POST /phase/1/research` : c'est là que l'IA juge la pertinence des
 * offres d'emploi d'un compte (domaine d'offre + métiers placés). Bout à bout :
 * la ligne de profil → `resolveProfileData` (le seul profil que lit l'analyse)
 * → `IaClient.research` → le corps envoyé.
 */

const OWNER = 'owner-3901'

function profileRow(overrides: Partial<EsnProfileEntity>): EsnProfileEntity {
  return {
    id: 'row-3901',
    user_id: OWNER,
    version: 1,
    is_current: true,
    workspace_id: null,
    is_workspace_canonical: false,
    esn_name: 'Cyber ESN',
    consultant_size: null,
    sales_team_size: null,
    expertise_areas: [],
    positioning: null,
    target_sectors: [],
    target_company_types: [],
    staffing_model: null,
    geo_zones: [],
    main_sales_pain: null,
    ...overrides,
  } as EsnProfileEntity
}

function resolverFor(row: EsnProfileEntity): EsnProfileWorkspaceResolver {
  const findOne = jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
    Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v) ? row : null,
  )
  const none = { findOne: jest.fn(async () => null) }
  return new EsnProfileWorkspaceResolver(
    { findOne, manager: { query: jest.fn(async () => []) } } as unknown as Repository<EsnProfileEntity>,
    none as unknown as Repository<WorkspaceEntity>,
    none as unknown as Repository<WorkspaceMemberEntity>,
    none as unknown as Repository<WorkspaceActiveSelectionEntity>,
  )
}

async function researchBodyFor(row: EsnProfileEntity): Promise<{ profile_data: Record<string, unknown> }> {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) })
  const profileData = await resolverFor(row).resolveProfileData(OWNER)
  const config = { get: () => 'http://ia.test' } as unknown as ConfigService
  await new IaClient(config, new CorrelationIdService()).research({
    companyName: 'SNCF',
    profileData,
    accountId: 'a-1',
    userId: OWNER,
  })
  const init = mockFetch.mock.calls[0]![1] as RequestInit
  return JSON.parse(init.body as string) as { profile_data: Record<string, unknown> }
}

describe('#3901 — placed_roles voyage jusqu’à POST /phase/1/research', () => {
  it('le corps envoyé à l’IA porte les métiers placés déclarés', async () => {
    const body = await researchBodyFor(profileRow({ placed_roles: ['Analyste SOC', 'Pentester'] }))
    expect(body.profile_data.placedRoles).toEqual(['Analyste SOC', 'Pentester'])
  })

  it('SAIT DIRE NON — sans métier déclaré, aucune clé (jamais une liste inventée)', async () => {
    const body = await researchBodyFor(profileRow({ placed_roles: [] }))
    expect('placedRoles' in body.profile_data).toBe(false)
    expect('inferredPlacedRoles' in body.profile_data).toBe(false)
  })
})

// Métiers placés DÉDUITS (décision Louis 11/10/2026) — ils voyagent jusqu'à
// l'IA seulement quand rien n'est déclaré, moins ceux que l'humain a retirés.
describe('11/10 — inferredPlacedRoles voyage jusqu’à POST /phase/1/research', () => {
  const inferred = [
    { role: 'Analyste SOC', terms: ['soc', 'siem'], score: 3, evidence: [], evidenceCount: 1 },
    { role: 'Pentester', terms: ['pentest'], score: 3, evidence: [], evidenceCount: 1 },
  ]

  it('sans métier déclaré : les déduits partent (rôle + termes), moins les retirés', async () => {
    const body = await researchBodyFor(
      profileRow({ placed_roles: [], inferred_placed_roles: inferred, dismissed_inferred_roles: ['Pentester'] }),
    )
    expect(body.profile_data.inferredPlacedRoles).toEqual([{ role: 'Analyste SOC', terms: ['soc', 'siem'] }])
  })

  it('le déclaré gagne : aucun déduit ne part dès qu’un métier est déclaré', async () => {
    const body = await researchBodyFor(profileRow({ placed_roles: ['Data'], inferred_placed_roles: inferred }))
    expect(body.profile_data.placedRoles).toEqual(['Data'])
    expect('inferredPlacedRoles' in body.profile_data).toBe(false)
  })
})
