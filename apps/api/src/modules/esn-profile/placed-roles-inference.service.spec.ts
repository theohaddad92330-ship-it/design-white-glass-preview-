import type { Repository } from 'typeorm'
import type { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import type { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'
import { PlacedRolesInferenceService } from './placed-roles-inference.service'

/**
 * Métiers placés DÉDUITS (décision Louis 11/10/2026) — le service qui lit le
 * contexte de l'espace, écrit À CÔTÉ du déclaré, et ne touche jamais
 * `placed_roles`.
 */

const OWNER = 'owner-metiers'

function row(overrides: Partial<EsnProfileEntity> = {}): EsnProfileEntity {
  return {
    id: 'row-1',
    user_id: OWNER,
    workspace_id: 'ws-1',
    is_workspace_canonical: true,
    is_current: true,
    positioning: null,
    expertise_areas: [],
    placed_roles: [],
    offer_domain: null,
    offer_domains: [],
    inferred_placed_roles: [],
    inferred_placed_roles_at: null,
    dismissed_inferred_roles: [],
    updated_at: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  } as unknown as EsnProfileEntity
}

function harness(profile: EsnProfileEntity | null, ctx: { consultants?: unknown[]; missions?: unknown[] } = {}) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('FROM consultants') && sql.startsWith('SELECT title')) return ctx.consultants ?? []
    if (sql.includes('FROM missions') && sql.startsWith('SELECT role_title')) return ctx.missions ?? []
    if (sql.includes('AS moved')) return [{ moved: false }]
    if (sql.includes('FROM esn_profiles p')) return profile ? [{ id: profile.id }] : []
    return []
  })
  const repo = {
    manager: { query },
    findOne: jest.fn(async () => profile),
  } as unknown as Repository<EsnProfileEntity>
  const resolver = {
    resolveContext: jest.fn(async () => ({
      workspaceId: profile?.workspace_id ?? null,
      role: 'owner',
      canManageCompany: true,
      canonicalRow: profile,
      ownRow: profile,
    })),
  } as unknown as EsnProfileWorkspaceResolver
  return { service: new PlacedRolesInferenceService(repo, resolver), calls }
}

const updates = (calls: { sql: string; params: unknown[] }[]) =>
  calls.filter(c => c.sql.startsWith('UPDATE esn_profiles'))

describe('PlacedRolesInferenceService — 11/10/2026', () => {
  it('ESN cyber : déduit du positionnement et écrit À CÔTÉ du déclaré', async () => {
    const { service, calls } = harness(row({ positioning: 'ESN cybersécurité : SOC et tests d’intrusion' }))
    const roles = await service.recompute(OWNER)
    expect(roles?.map(r => r.role)).toEqual(expect.arrayContaining(['Consultant cybersécurité', 'Analyste SOC']))
    const [write] = updates(calls)
    expect(write!.sql).toContain('inferred_placed_roles = $1::jsonb')
    expect(write!.sql).not.toMatch(/[^_]placed_roles =/)
    expect(JSON.parse(String(write!.params[0]))[0].evidence[0].source).toBe('onboarding')
  })

  it('vivier + missions de l’espace : la portée est l’espace ou l’utilisateur, jamais tout le parc', async () => {
    const { service, calls } = harness(row(), {
      consultants: [
        { title: 'Ingénieur mécanique', stack: ['CATIA'] },
        { title: 'Projeteur', stack: ['SolidWorks'] },
      ],
      missions: [{ role_title: 'Automaticien', label: 'Ligne d’assemblage' }],
    })
    const roles = await service.recompute(OWNER)
    expect(roles?.map(r => r.role)).toEqual(
      expect.arrayContaining(['Ingénieur mécanique / CAO', 'Automaticien / robotique']),
    )
    const consultantsRead = calls.find(c => c.sql.startsWith('SELECT title'))!
    expect(consultantsRead.sql).toContain('workspace_id = $1')
    expect(consultantsRead.params).toEqual(['ws-1', OWNER])
  })

  it('sans profil : rien n’est écrit, et l’écran pose la question', async () => {
    const { service, calls } = harness(null)
    expect(await service.recompute(OWNER)).toBeNull()
    expect(updates(calls)).toHaveLength(0)
    expect((await service.getForUser(OWNER)).needsQuestion).toBe(true)
  })

  it('contexte vide : aucun métier deviné, on pose la question', async () => {
    const { service } = harness(row())
    const res = await service.getForUser(OWNER)
    expect(res).toMatchObject({ roles: [], declared: false, needsQuestion: true })
  })

  it('le déclaré gagne : déjà déclarés et retirés ne sont plus proposés', async () => {
    const { service } = harness(
      row({
        positioning: 'Cybersécurité, SOC, pentest',
        placed_roles: ['Analyste SOC'],
        dismissed_inferred_roles: ['Pentester'],
      }),
    )
    const res = await service.getForUser(OWNER)
    expect(res.declared).toBe(true)
    expect(res.needsQuestion).toBe(false)
    const proposed = res.roles.map(r => r.role)
    expect(proposed).toContain('Consultant cybersécurité')
    expect(proposed).not.toContain('Analyste SOC')
    expect(proposed).not.toContain('Pentester')
  })

  it('« Retirer » : correction humaine, jamais une écriture de `placed_roles`', async () => {
    const { service, calls } = harness(
      row({ inferred_placed_roles_at: new Date('2026-10-10T00:00:00Z'), positioning: 'Cybersécurité et SOC' }),
    )
    await service.recompute(OWNER)
    const res = await service.dismiss(OWNER, 'Analyste SOC')
    const write = updates(calls).find(c => c.sql.includes('dismissed_inferred_roles'))!
    expect(write.sql).toContain('array_append(dismissed_inferred_roles')
    expect(res.roles.map(r => r.role)).not.toContain('Analyste SOC')
  })

  it('rattrapage CIBLÉ : sans métier déclaré, jamais déduit ou contexte bougé, par lot', async () => {
    const { service, calls } = harness(row({ positioning: 'Data et cloud' }))
    expect(await service.sweep(7)).toBe(1)
    const select = calls.find(c => c.sql.includes('FROM esn_profiles p'))!
    expect(select.sql).toContain('cardinality(p.placed_roles) = 0')
    expect(select.sql).toContain('inferred_placed_roles_at IS NULL')
    expect(select.params).toEqual([7])
    expect(updates(calls)).toHaveLength(1)
  })
})
