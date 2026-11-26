import { DISCOVER_ALERT_EVENT_KINDS } from '@bellum/contracts'
import { DiscoverAlertEventService } from './discover-alert-event.service'

/**
 * #2151.25 — LA PORTE DE DÉDUPLICATION.
 *
 * Le test qui compte : un MÊME événement ne produit pas deux consignations.
 * Son témoin inverse, tout aussi nécessaire : deux événements DIFFÉRENTS en
 * produisent bien deux — une porte qui refuse tout tiendrait le premier test et
 * casserait le produit.
 *
 * Le dépôt est simulé avec l'index unique `(workspace_id, event_key)` que la
 * migration pose : c'est LUI qu'on teste, pas une lecture préalable — et c'est
 * volontaire, parce qu'une lecture préalable ne tiendrait pas à deux répliques.
 */

type Inserted = { workspace_id: string; event_key: string; surface: string | null; kind: string }

function makeRepo() {
  const rows: Inserted[] = []
  const updates: Array<{ ids: string[]; surface: string; workspaceId: string }> = []

  const repo = {
    createQueryBuilder: () => ({
      insert: () => ({
        into: () => ({
          values: (value: Inserted) => ({
            orIgnore: () => ({
              execute: async () => {
                // L'index UNIQUE, simulé : même (espace, clé) ⇒ rien n'est écrit.
                const clash = rows.some(
                  existing => existing.workspace_id === value.workspace_id && existing.event_key === value.event_key,
                )
                if (clash) return { identifiers: [undefined] }
                rows.push(value)
                return { identifiers: [{ id: `id-${rows.length}` }] }
              },
            }),
          }),
        }),
      }),
      update: () => {
        const captured = { ids: [] as string[], surface: '', workspaceId: '' }
        const chain = {
          set: (patch: { surface: string }) => {
            captured.surface = patch.surface
            return chain
          },
          where: (_sql: string, params: { workspaceId: string }) => {
            captured.workspaceId = params.workspaceId
            return chain
          },
          andWhere: (_sql: string, params?: { ids?: string[] }) => {
            if (params?.ids) captured.ids = params.ids
            return chain
          },
          execute: async () => {
            updates.push(captured)
            return { affected: captured.ids.length }
          },
        }
        return chain
      },
    }),
  }

  return { repo, rows, updates }
}

const WORKSPACE = '11111111-1111-1111-1111-111111111111'

describe('#2151.25 — un même événement ne produit pas deux consignations', () => {
  it('le SECOND passage sur le même fait rend `duplicate` et n’écrit rien', async () => {
    const { repo, rows } = makeRepo()
    const service = new DiscoverAlertEventService(repo as never)
    const event = {
      workspaceId: WORKSPACE,
      kind: 'new_relationship' as const,
      subjectId: 'acc-1',
      subjectLabel: 'Une ESN',
      occurredAt: new Date('2026-09-16T08:00:00.000Z'),
    }

    expect((await service.record(event)).status).toBe('recorded')
    // Le balayage repasse le lendemain matin sur la même ligne en base : le
    // fait n'a pas changé, et son heure de détection non plus.
    expect((await service.record(event)).status).toBe('duplicate')
    expect(rows).toHaveLength(1)
  })

  it('même fait, même JOUR, heure différente — toujours un seul (la clé porte le jour)', async () => {
    const { repo, rows } = makeRepo()
    const service = new DiscoverAlertEventService(repo as never)
    const base = {
      workspaceId: WORKSPACE,
      kind: 'new_access_path' as const,
      subjectId: 'acc-9',
      subjectLabel: 'Accord-cadre',
    }
    await service.record({ ...base, occurredAt: new Date('2026-09-16T06:00:00.000Z') })
    await service.record({ ...base, occurredAt: new Date('2026-09-16T22:30:00.000Z') })
    expect(rows).toHaveLength(1)
  })

  it('LE TÉMOIN INVERSE — deux événements DIFFÉRENTS en produisent bien deux', async () => {
    const { repo, rows } = makeRepo()
    const service = new DiscoverAlertEventService(repo as never)
    const base = {
      workspaceId: WORKSPACE,
      kind: 'new_relationship' as const,
      subjectId: 'acc-1',
      subjectLabel: 'Une ESN',
      occurredAt: new Date('2026-09-16T08:00:00.000Z'),
    }
    await service.record(base)
    // Un autre sujet.
    await service.record({ ...base, subjectId: 'acc-2' })
    // Un autre genre sur le même sujet.
    await service.record({ ...base, kind: 'new_matching_company' })
    // Le même fait, un autre jour.
    await service.record({ ...base, occurredAt: new Date('2026-09-17T08:00:00.000Z') })
    expect(rows).toHaveLength(4)
  })

  it('le cloisonnement : le même fait dans DEUX espaces reste deux événements', async () => {
    const { repo, rows } = makeRepo()
    const service = new DiscoverAlertEventService(repo as never)
    const base = {
      kind: 'mission_ended' as const,
      subjectId: 'm-1',
      subjectLabel: 'Mission',
      occurredAt: new Date('2026-09-16T08:00:00.000Z'),
    }
    await service.record({ ...base, workspaceId: WORKSPACE })
    await service.record({ ...base, workspaceId: '22222222-2222-2222-2222-222222222222' })
    expect(rows).toHaveLength(2)
  })
})

describe('#2151.23 — la surface de NAISSANCE', () => {
  it('un genre urgent naît dans Aujourd’hui ; un autre naît sans surface', async () => {
    const { repo, rows } = makeRepo()
    const service = new DiscoverAlertEventService(repo as never)
    const at = new Date('2026-09-16T08:00:00.000Z')

    await service.record({
      workspaceId: WORKSPACE,
      kind: 'new_signal',
      subjectId: 'acc-1',
      subjectLabel: 'SOCOTEC',
      occurredAt: at,
    })
    await service.record({
      workspaceId: WORKSPACE,
      kind: 'new_relationship',
      subjectId: 'acc-1',
      subjectLabel: 'Une ESN',
      occurredAt: at,
    })

    expect(rows.find(row => row.kind === 'new_signal')?.surface).toBe('today')
    // `null` = pas encore délivré, ce qui n'est PAS « délivré nulle part ».
    expect(rows.find(row => row.kind === 'new_relationship')?.surface).toBeNull()
  })

  it('AUCUN genre ne naît sur une surface hors des trois de délivrance', async () => {
    const { repo, rows } = makeRepo()
    const service = new DiscoverAlertEventService(repo as never)
    // Le corpus est LU, et il n'est pas vide : les sept genres du contrat.
    expect(DISCOVER_ALERT_EVENT_KINDS.length).toBeGreaterThanOrEqual(7)
    for (const [index, kind] of DISCOVER_ALERT_EVENT_KINDS.entries()) {
      await service.record({
        workspaceId: WORKSPACE,
        kind,
        subjectId: `s-${index}`,
        subjectLabel: kind,
        occurredAt: new Date('2026-09-16T08:00:00.000Z'),
      })
    }
    expect(rows).toHaveLength(DISCOVER_ALERT_EVENT_KINDS.length)
    for (const row of rows) {
      expect([null, 'today', 'notification', 'outbound']).toContain(row.surface)
      // Laura ne DÉLIVRE jamais : elle lit.
      expect(row.surface).not.toBe('laura')
    }
  })
})

describe('markDelivered — le cloisonnement est posé sur l’ÉCRITURE aussi', () => {
  it('stampe en bornant à l’espace, et ne touche rien quand la liste est vide', async () => {
    const { repo, updates } = makeRepo()
    const service = new DiscoverAlertEventService(repo as never)

    expect(await service.markDelivered(WORKSPACE, [], 'notification')).toBe(0)
    expect(updates).toHaveLength(0)

    await service.markDelivered(WORKSPACE, ['e1', 'e2'], 'outbound')
    expect(updates).toEqual([{ ids: ['e1', 'e2'], surface: 'outbound', workspaceId: WORKSPACE }])
  })
})
