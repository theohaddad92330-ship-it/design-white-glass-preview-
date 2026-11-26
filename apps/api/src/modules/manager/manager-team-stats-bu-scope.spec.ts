import { ServiceUnavailableException } from '@nestjs/common'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ManagerService } from './manager.service'

/**
 * #4158 (complément BU) — `GET /manager/team-stats` porte le périmètre BU (complément de l'intégration, trouvé par L5).
 *
 * Sans lui, un `team:manage` cloisonné à une BU lisait les comptes de TOUTES les autres dans « non
 * attribués », « doublons de couverture », « actions partagées », « activité récente » et dans les blocs
 * du lot L7 (pouls, revue du pipeline, staffing, activité de la période).
 *
 * Il n'y a pas de base réelle en CI à ce palier : la preuve est sur le SQL ENVOYÉ à la base. Un test qui
 * saurait seulement qu'« un appel part » ne dirait rien — on exige que CHAQUE requête qui lit des comptes
 * (ou ce qui pointe un compte) porte l'identifiant de la BU de l'appelant, et que le TÉMOIN (sans
 * cloisonnement) reste byte-identique.
 */
const LYON = '11111111-1111-4111-8111-111111111111'
const PARIS = '22222222-2222-4222-8222-222222222222'

/** Les tables dont une ligne nomme ou compte un COMPTE. */
const ACCOUNT_BEARING =
  /\b(?:FROM|JOIN)\s+(accounts|contacts|user_actions|opportunities|action_plan_items|project_needs|analysis_runs)\b/

/**
 * Lectures qui ne nomment ni ne comptent aucun compte, et DOIVENT le rester hors périmètre :
 *  - la dernière activité d'un membre (un horodatage, aucun compte) ;
 *  - le total d'actions d'une période, agrégé sans compte (`SELECT COUNT(*) … FROM user_actions` sans jointure).
 * Chaque exemption est NOMMÉE : un oubli ne s'y range pas en silence.
 */
const EXEMPT = [/MAX\(created_at\) AS "lastAt"/]

function build(scope: { businessUnitIds: string[]; includeUnassigned: true } | null) {
  const queries: string[] = []
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales_ops' }),
    extraPermissionsOf: jest.fn().mockResolvedValue([]),
  }
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(scope) }
  const service = new ManagerService(
    dataSource as never,
    workspaceContext as unknown as WorkspaceContextService,
    businessUnits as never,
  )
  return { service, queries, businessUnits }
}

describe('ManagerService.getTeamStats — périmètre BU (#4158 (complément BU))', () => {
  it('résout la portée de l’appelant dans SON espace actif', async () => {
    const { service, businessUnits } = build({ businessUnitIds: [LYON], includeUnassigned: true })
    await service.getTeamStats('u-lyon')
    expect(businessUnits.scopeFor).toHaveBeenCalledWith('ws-1', 'u-lyon')
  })

  it('cloisonné à Lyon : CHAQUE requête qui lit des comptes porte Lyon — et jamais une autre BU', async () => {
    const { service, queries } = build({ businessUnitIds: [LYON], includeUnassigned: true })
    await service.getTeamStats('u-lyon')

    const reading = queries.filter(sql => ACCOUNT_BEARING.test(sql) && !EXEMPT.some(rx => rx.test(sql)))
    // Preuve de lecture : le balayage voit bien les blocs nommés par le brief et ceux de L7.
    expect(reading.length).toBeGreaterThanOrEqual(20)
    const unscoped = reading.filter(sql => !sql.includes(LYON)).map(sql => sql.replace(/\s+/g, ' ').slice(0, 140))
    expect(unscoped).toEqual([])
    for (const sql of queries) expect(sql).not.toContain(PARIS)
  })

  it('les quatre blocs nommés (non attribués, doublons, actions partagées, activité récente) sont bornés', async () => {
    const { service, queries } = build({ businessUnitIds: [LYON], includeUnassigned: true })
    await service.getTeamStats('u-lyon')
    const find = (needle: string) => queries.filter(sql => sql.includes(needle))
    for (const needle of [
      'assigned_to IS NULL AND commercial_status', // non attribués
      'HAVING COUNT(DISTINCT ua.user_id) >= 2', // doublons de couverture
      'AS "overdue"', // file d'actions partagées
      'ua.action_type AS "actionType"', // activité récente
    ]) {
      const found = find(needle)
      expect(found.length).toBeGreaterThan(0)
      for (const sql of found) expect(sql).toContain(LYON)
    }
  })

  it('TÉMOIN — sans cloisonnement (le cas de presque tout le monde), aucune clause BU n’apparaît', async () => {
    const { service, queries } = build(null)
    await service.getTeamStats('u-owner')
    expect(queries.length).toBeGreaterThan(20)
    for (const sql of queries) {
      expect(sql).not.toMatch(/business_unit_id/)
      expect(sql).not.toContain('scoped_account')
    }
  })

  it('membre cloisonné à AUCUNE BU : seuls les comptes sans BU restent, jamais « tout »', async () => {
    const { service, queries } = build({ businessUnitIds: [], includeUnassigned: true })
    await service.getTeamStats('u-none')
    const unassigned = queries.find(sql => sql.includes('assigned_to IS NULL AND commercial_status'))
    expect(unassigned).toContain('business_unit_id IS NULL')
    expect(unassigned).not.toContain(' IN (')
  })

  it('FAIL-CLOSED : sans service de BU câblé, la route refuse (503) au lieu d’ouvrir l’espace', async () => {
    const dataSource = { query: jest.fn(async () => []) }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    }
    const service = new ManagerService(dataSource as never, workspaceContext as unknown as WorkspaceContextService)
    await expect(service.getTeamStats('u')).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(dataSource.query).not.toHaveBeenCalled()
  })

  it('un appelant sans team:manage est refusé AVANT toute lecture de périmètre', async () => {
    const { service, businessUnits, queries } = build({ businessUnitIds: [LYON], includeUnassigned: true })
    const denied = new ManagerService(
      { query: jest.fn() } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
        extraPermissionsOf: jest.fn().mockResolvedValue([]),
      } as never,
      businessUnits as never,
    )
    await expect(denied.getTeamStats('rep')).rejects.toThrow()
    expect(queries).toHaveLength(0)
    expect(service).toBeDefined()
  })
})
