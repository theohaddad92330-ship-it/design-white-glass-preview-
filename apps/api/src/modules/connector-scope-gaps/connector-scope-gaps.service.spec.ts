import type { DataSource } from 'typeorm'
import type { ConnectorScopeGapEntity } from '../../database/entities/connector-scope-gap.entity'
import type { NotificationsService } from '../notifications/notifications.service'
import { ConnectorScopeGapsService } from './connector-scope-gaps.service'

const REQUESTED =
  'oauth crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.deals.read crm.objects.deals.write'
const CONTACTS_ONLY = 'oauth crm.objects.contacts.read crm.objects.contacts.write'

type Row = Partial<ConnectorScopeGapEntity> & { id: string }

function build(connections: Array<{ user_id: string; workspace_id: string; scope: string | null }> = []) {
  const rows: Row[] = []
  let seq = 0
  const repo = {
    findOne: async ({ where }: { where: Partial<Row> }) =>
      rows.find(r => r.user_id === where.user_id && r.provider === where.provider) ?? null,
    find: async ({ where }: { where?: Partial<Row> } = {}) =>
      rows.filter(r => !where?.provider || r.provider === where.provider),
    save: async (row: Partial<Row>) => {
      const existing = rows.find(r => r.user_id === row.user_id && r.provider === row.provider)
      if (existing) return Object.assign(existing, row)
      const created = { ...row, id: `gap-${++seq}`, updated_at: new Date() } as Row
      rows.push(created)
      return created
    },
    delete: async (where: { user_id?: string; provider?: string; id?: string }) => {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i]!
        if (
          (!where.user_id || r.user_id === where.user_id) &&
          (!where.provider || r.provider === where.provider) &&
          (!where.id || r.id === where.id)
        )
          rows.splice(i, 1)
      }
    },
    // L'attribution atomique de la notification : n'écrit que si l'empreinte diffère.
    update: async (criteria: { id: string }, patch: Partial<Row>) => {
      const row = rows.find(r => r.id === criteria.id)
      return { affected: row ? 1 : 0, ...(row ? Object.assign(row, patch) && {} : {}) }
    },
    createQueryBuilder: () => {
      throw new Error('not used')
    },
  }
  const claim = jest.fn(async (id: string, signature: string) => {
    const row = rows.find(r => r.id === id)
    if (!row || row.notified_signature === signature) return false
    row.notified_signature = signature
    return true
  })
  const dataSource = {
    query: jest.fn(async (sql: string, params: string[] = []) =>
      /FROM crm_connections/.test(sql) && params[0] === 'hubspot' ? connections : [],
    ),
  } as unknown as DataSource
  const createNotification = jest.fn(async () => ({}))
  const notifications = { createNotification } as unknown as NotificationsService
  const service = new ConnectorScopeGapsService(repo as never, dataSource, notifications)
  ;(service as unknown as { claimNotification: typeof claim }).claimNotification = claim
  return { service, rows, createNotification, claim }
}

beforeEach(() => {
  process.env['HUBSPOT_CLIENT_ID'] = 'id'
  process.env['HUBSPOT_CLIENT_SECRET'] = 'secret'
  process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.example/crm/hubspot/callback'
  // Portées DEMANDÉES fixées ici : le test ne dérive pas quand la configuration par défaut gagne une portée
  // (miroir CRM, 19/10) — celle-ci est nommée par `features` dans le registre.
  process.env['HUBSPOT_SCOPES'] = REQUESTED
})

describe('ConnectorScopeGapsService.recordCallback — I.1', () => {
  it('pose un écart « consentement neuf » quand le jeton porte moins que la demande', async () => {
    const { service, rows } = build()
    const missing = await service.recordCallback({
      provider: 'hubspot',
      userId: 'u1',
      workspaceId: 'w1',
      requested: REQUESTED,
      granted: CONTACTS_ONLY,
    })
    expect(missing).toEqual(['crm.objects.companies.read', 'crm.objects.deals.read', 'crm.objects.deals.write'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ provider: 'hubspot', user_id: 'u1', fresh_consent: true })
    expect(rows[0]?.missing_scopes).toBe('crm.objects.companies.read crm.objects.deals.read crm.objects.deals.write')
  })

  it('journalise l’écart sans jamais porter de jeton', async () => {
    const { service } = build()
    const errors: unknown[][] = []
    ;(service as unknown as { logger: { error: (...a: unknown[]) => void } }).logger = {
      error: (...a: unknown[]) => errors.push(a),
    }
    await service.recordCallback({
      provider: 'hubspot',
      userId: 'u1',
      workspaceId: 'w1',
      requested: REQUESTED,
      granted: CONTACTS_ONLY,
    })
    expect(errors).toHaveLength(1)
    const text = JSON.stringify(errors[0])
    expect(text).toContain('hubspot')
    expect(text).toContain('crm.objects.deals.write')
    expect(text).not.toMatch(/token/i)
  })

  it('efface l’écart quand tout est accordé (la reconnexion répare)', async () => {
    const { service, rows } = build()
    await service.recordCallback({
      provider: 'hubspot',
      userId: 'u1',
      workspaceId: 'w1',
      requested: REQUESTED,
      granted: CONTACTS_ONLY,
    })
    const missing = await service.recordCallback({
      provider: 'hubspot',
      userId: 'u1',
      workspaceId: 'w1',
      requested: REQUESTED,
      granted: REQUESTED,
    })
    expect(missing).toEqual([])
    expect(rows).toHaveLength(0)
  })

  it('ne devine rien quand le fournisseur ne rend pas ses portées', async () => {
    const { service, rows } = build()
    expect(
      await service.recordCallback({
        provider: 'hubspot',
        userId: 'u1',
        workspaceId: 'w1',
        requested: REQUESTED,
        granted: null,
      }),
    ).toBeNull()
    expect(rows).toHaveLength(0)
  })

  it('ne compte pas les portées de protocole (oauth, offline_access) comme manquantes', async () => {
    const { service, rows } = build()
    await service.recordCallback({
      provider: 'microsoft',
      userId: 'u1',
      workspaceId: 'w1',
      requested: 'offline_access Mail.Send',
      granted: 'Mail.Send',
    })
    expect(rows).toHaveLength(0)
  })
})

describe('ConnectorScopeGapsService.gapFor — I.2', () => {
  it('distingue le consentement neuf (l’app) de l’accord ancien (reconnecte)', async () => {
    const { service } = build()
    await service.recordCallback({
      provider: 'hubspot',
      userId: 'u1',
      workspaceId: 'w1',
      requested: REQUESTED,
      granted: CONTACTS_ONLY,
    })
    expect(await service.gapFor('u1', 'hubspot')).toMatchObject({ freshConsent: true, label: 'HubSpot' })
    expect(await service.gapFor('u2', 'hubspot')).toBeNull()
  })
})

describe('ConnectorScopeGapsService.sweep — I.3', () => {
  it('notifie UNE fois une connexion ancienne dont les portées sont inférieures à la demande', async () => {
    const { service, createNotification, rows } = build([{ user_id: 'u1', workspace_id: 'w1', scope: CONTACTS_ONLY }])
    await service.sweep()
    expect(createNotification).toHaveBeenCalledTimes(1)
    const [userId, input] = createNotification.mock.calls[0] as unknown as [string, { title: string; type: string }]
    expect(userId).toBe('u1')
    expect(input.title).toBe(
      'Reconnecte HubSpot pour activer : la lecture des entreprises, la lecture des affaires, la proposition de stade sur une affaire',
    )
    expect(rows[0]).toMatchObject({ fresh_consent: false })
  })

  it('est idempotent : un second balayage n’envoie rien de plus', async () => {
    const { service, createNotification } = build([{ user_id: 'u1', workspace_id: 'w1', scope: CONTACTS_ONLY }])
    await service.sweep()
    await service.sweep()
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('renotifie si l’ensemble de portées manquantes change', async () => {
    const connections = [{ user_id: 'u1', workspace_id: 'w1', scope: CONTACTS_ONLY }]
    const { service, createNotification } = build(connections)
    await service.sweep()
    connections[0]!.scope = `${CONTACTS_ONLY} crm.objects.companies.read`
    await service.sweep()
    expect(createNotification).toHaveBeenCalledTimes(2)
  })

  it('ne notifie pas après un consentement neuf : ce n’est pas à l’utilisateur de réparer', async () => {
    const { service, createNotification } = build([{ user_id: 'u1', workspace_id: 'w1', scope: CONTACTS_ONLY }])
    await service.recordCallback({
      provider: 'hubspot',
      userId: 'u1',
      workspaceId: 'w1',
      requested: REQUESTED,
      granted: CONTACTS_ONLY,
    })
    await service.sweep()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('ne notifie pas une connexion complète, ni une dont les portées sont inconnues', async () => {
    const { service, createNotification } = build([
      { user_id: 'u1', workspace_id: 'w1', scope: REQUESTED },
      { user_id: 'u2', workspace_id: 'w2', scope: null },
    ])
    await service.sweep()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('retire l’écart d’une connexion qui n’existe plus', async () => {
    const connections = [{ user_id: 'u1', workspace_id: 'w1', scope: CONTACTS_ONLY }]
    const { service, rows } = build(connections)
    await service.sweep()
    expect(rows).toHaveLength(1)
    connections.length = 0
    await service.sweep()
    expect(rows).toHaveLength(0)
  })
})

describe('ConnectorScopeGapsService.incompleteByConnector — I.4', () => {
  it('compte les espaces et nomme les portées manquantes, par connecteur', async () => {
    const { service } = build()
    await service.recordCallback({
      provider: 'hubspot',
      userId: 'u1',
      workspaceId: 'w1',
      requested: REQUESTED,
      granted: CONTACTS_ONLY,
    })
    await service.recordCallback({
      provider: 'hubspot',
      userId: 'u2',
      workspaceId: 'w2',
      requested: REQUESTED,
      granted: CONTACTS_ONLY,
    })
    const [hubspot] = await service.incompleteByConnector()
    expect(hubspot).toMatchObject({ provider: 'hubspot', label: 'HubSpot', workspaces: 2, users: 2, appSide: 2 })
    expect(hubspot?.missingScopes).toContainEqual({ scope: 'crm.objects.deals.read', workspaces: 2 })
  })

  it('ne rend aucune ligne pour un connecteur sans écart', async () => {
    expect(await build().service.incompleteByConnector()).toEqual([])
  })
})
