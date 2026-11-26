import type { CrmFirstImportState, SyncOutcome } from '@bellum/contracts'
import type { CrmMirrorSync } from '../crm-mirror/crm-mirror.port'
import { CrmFirstImportRunner } from './crm-first-import.runner'

const outcome = (over: Partial<SyncOutcome> = {}): SyncOutcome => ({
  provider: 'pipedrive',
  entityType: 'contact',
  dryRun: false,
  created: 10,
  updated: 5,
  skipped: [],
  truncated: false,
  unavailable: null,
  conflicts: 0,
  ...over,
})

function build(options: { run?: jest.Mock; mirror?: CrmMirrorSync } = {}) {
  const run = options.run ?? jest.fn().mockResolvedValue(outcome())
  const runner = new CrmFirstImportRunner({ run } as never, {} as never, {} as never, options.mirror)
  const reports: CrmFirstImportState[] = []
  const report = async (state: CrmFirstImportState) => {
    reports.push(state)
  }
  return { runner, run, report, reports }
}
const DATA = { userId: 'u1', workspaceId: 'w1', provider: 'pipedrive' as const }

describe('CrmFirstImportRunner', () => {
  it('reprend comptes puis contacts en réel (dryRun false) et chiffre chaque objet', async () => {
    const { runner, run, report } = build()
    const final = await runner.run(DATA, report)
    expect(run.mock.calls.map(call => [call[1].entityType, call[1].dryRun])).toEqual([
      ['account', false],
      ['contact', false],
    ])
    expect(final.state).toBe('done')
    expect(final.objects.map(o => [o.object, o.status, o.count])).toEqual([
      ['accounts', 'done', 15],
      ['contacts', 'done', 15],
    ])
  })

  it('enchaîne les passages quand la lecture ordonnée est tronquée', async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce(outcome({ truncated: true }))
      .mockResolvedValue(outcome({ created: 1, updated: 0 }))
    const { runner, report } = build({ run })
    const final = await runner.run(DATA, report)
    expect(final.objects[0]).toMatchObject({ object: 'accounts', count: 16, truncated: false })
  })

  it('compte les écarts (correction humaine gardée) sans les écraser', async () => {
    const { runner, report } = build({ run: jest.fn().mockResolvedValue(outcome({ conflicts: 2 })) })
    const final = await runner.run(DATA, report)
    expect(final.objects[1]?.conflicts).toBe(2)
  })

  it('appelle le miroir en mode full s’il est fourni, et nomme son erreur par objet', async () => {
    const mirror: CrmMirrorSync = {
      syncProvider: jest.fn().mockResolvedValue({
        counts: { deals: 312 },
        archived: 0,
        errors: [{ entity: 'activities', message: 'lecture refusée' }],
      }),
    }
    const { runner, report } = build({ mirror })
    const final = await runner.run(DATA, report)
    expect(mirror.syncProvider).toHaveBeenCalledWith({ workspaceId: 'w1', provider: 'pipedrive', mode: 'full' })
    const byObject = Object.fromEntries(final.objects.map(o => [o.object, o]))
    expect(byObject['deals']).toMatchObject({ status: 'done', count: 312 })
    expect(byObject['activities']).toMatchObject({ status: 'failed', error: 'lecture refusée', count: null })
    expect(final.state).toBe('done')
  })

  it('sans miroir, n’invente ni affaires ni activités', async () => {
    const { runner, report } = build()
    const final = await runner.run(DATA, report)
    expect(final.objects.map(o => o.object)).toEqual(['accounts', 'contacts'])
  })

  it('un jeton refusé se dit « reconnecte <CRM> » et la reprise passe à failed', async () => {
    const { runner, report } = build({ run: jest.fn().mockRejectedValue(new Error('401 Unauthorized')) })
    const final = await runner.run(DATA, report)
    expect(final.state).toBe('failed')
    expect(final.reconnectNeeded).toBe(true)
    expect(final.message).toContain('Reconnecte Pipedrive')
    expect(final.objects[0]?.error).toContain('Reconnecte Pipedrive')
  })

  it('le délai maximal dépassé nomme l’échec au lieu de tourner sans fin', async () => {
    let clock = 0
    const now = () => (clock += 20 * 60 * 1000)
    const { runner, report } = build()
    const final = await runner.run(DATA, report, now)
    expect(final.objects.some(o => o.status === 'failed' && /Délai/.test(o.error ?? ''))).toBe(true)
    expect(final.message).toContain('délai')
  })

  it('rapporte une progression avant la fin', async () => {
    const { runner, report, reports } = build()
    await runner.run(DATA, report)
    expect(reports[0]?.state).toBe('running')
    expect(reports.at(-1)?.state).toBe('done')
  })

  // #4290.15 — la recette 21/10 a compté « 0 contact » : le curseur posé par un premier passage (qui avait
  // lu mais écarté des personnes sans e-mail) cachait ces fiches aux reprises suivantes. Une reprise rejouée
  // relit depuis le début ; seuls les passages SUIVANTS d'une même reprise suivent le curseur.
  it('#4290.15 le premier passage d’un objet ignore le curseur (rattrape l’existant), les suivants le suivent', async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce(outcome({ truncated: true }))
      .mockResolvedValue(outcome({ created: 1, updated: 0 }))
    const { runner, report } = build({ run })
    await runner.run(DATA, report)
    expect(run.mock.calls[0]?.[2]).toEqual({ ignoreCursor: true })
    expect(run.mock.calls[1]?.[2]).toBeUndefined()
  })

  it('#4290.15 un miroir qui n’a rien lu ni rien dit n’est pas « terminé à 0 » : l’objet est nommé non lu', async () => {
    const mirror: CrmMirrorSync = {
      syncProvider: jest.fn().mockResolvedValue({ counts: {}, archived: 0, errors: [] }),
    }
    const { runner, report } = build({ mirror })
    const final = await runner.run(DATA, report)
    const deals = final.objects.find(o => o.object === 'deals')
    expect(deals?.status).toBe('failed')
    expect(deals?.count).toBeNull()
    expect(deals?.error).toMatch(/non lu/i)
  })

  // #4290.19 — une reprise rejouée sur une base déjà écrite ne dit plus « 0 entreprise » : les fiches inchangées
  // sont RECONNUES, comptées à part des créations. Rien n'est recréé (le lien externe fait l'idempotence).
  it('#4290.19 rejouée sur une base déjà écrite : 0 créée, toutes reconnues (mises à jour + inchangées)', async () => {
    const run = jest.fn().mockResolvedValue(
      outcome({
        created: 0,
        updated: 2,
        skipped: [
          { ref: 'a', reason: 'unchanged' },
          { ref: 'b', reason: 'unchanged' },
          { ref: 'c', reason: 'no_identifier' },
        ],
      }),
    )
    const { runner, report } = build({ run })
    const final = await runner.run(DATA, report)
    expect(final.objects[0]).toMatchObject({ object: 'accounts', count: 4, created: 0, recognized: 4 })
  })

  it('#4290.19 une première reprise sur une base vide : tout est créé, rien de reconnu', async () => {
    const { runner, report } = build({ run: jest.fn().mockResolvedValue(outcome({ created: 7, updated: 0 })) })
    const final = await runner.run(DATA, report)
    expect(final.objects[1]).toMatchObject({ object: 'contacts', count: 7, created: 7, recognized: 0 })
  })

  it('#4290.19 le miroir ne distingue pas créées et reconnues : il ne les invente pas', async () => {
    const mirror: CrmMirrorSync = {
      syncProvider: jest
        .fn()
        .mockResolvedValue({ counts: { deals: 3, activities: 1, owners: 2 }, archived: 0, errors: [] }),
    }
    const { runner, report } = build({ mirror })
    const final = await runner.run(DATA, report)
    const deals = final.objects.find(o => o.object === 'deals')
    expect(deals?.created ?? null).toBeNull()
    expect(deals?.recognized ?? null).toBeNull()
  })
})
