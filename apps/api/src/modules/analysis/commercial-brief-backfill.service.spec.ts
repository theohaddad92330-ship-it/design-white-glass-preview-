import { Logger } from '@nestjs/common'
import {
  COMMERCIAL_BRIEF_BACKFILL_DEFAULT_LIMIT,
  COMMERCIAL_BRIEF_BACKFILL_MAX_LIMIT,
  CommercialBriefBackfillService,
} from './commercial-brief-backfill.service'
import type { CommercialBriefOutcome } from './commercial-brief.step'

/**
 * Point 45 (briefs comptes, 01/10/2026) — « un correctif de collecte RATTRAPE
 * l'existant » : ciblé (jamais tout le parc), par SEGMENT (le brief seul, pas
 * l'analyse), sans écraser, sans partir seul. Ici : le service qui choisit les
 * comptes et borne le lot ; le step (`keepExisting`) est prouvé dans son spec.
 */

const WS = 'ws-1'

function setup(
  opts: {
    candidates?: string[]
    inWorkspace?: string[]
    outcome?: (accountId: string) => CommercialBriefOutcome | Error
  } = {},
) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (/id = ANY/i.test(sql)) return (opts.inWorkspace ?? []).map(id => ({ id }))
    return (opts.candidates ?? []).map(id => ({ id }))
  })
  const produce = jest.fn(async (accountId: string) => {
    const out = opts.outcome?.(accountId) ?? 'written'
    if (out instanceof Error) throw out
    return out
  })
  const service = new CommercialBriefBackfillService({ query } as never, { produceCommercialBrief: produce } as never)
  return { service, query, produce }
}

describe('CommercialBriefBackfillService — rattrapage ciblé du brief commercial', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it('par espace : ne choisit que les comptes analysés SANS brief, scopés à l’espace, plafond par défaut petit', async () => {
    const { service, query, produce } = setup({ candidates: ['a1', 'a2'] })
    const out = await service.run({ workspaceId: WS })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/workspace_id = \$1/)
    expect(sql).toMatch(/NOT \(raw_analysis \? 'commercial_brief'\)/)
    expect(sql).toMatch(/raw_analysis IS NOT NULL/)
    expect(sql).toMatch(/LIMIT \$/)
    expect(params[0]).toBe(WS)
    expect(params).toContain(COMMERCIAL_BRIEF_BACKFILL_DEFAULT_LIMIT)
    expect(COMMERCIAL_BRIEF_BACKFILL_DEFAULT_LIMIT).toBeLessThanOrEqual(20)
    expect(produce).toHaveBeenCalledTimes(2)
    expect(out.processed).toBe(2)
    expect(out.written).toBe(2)
  })

  it('PLAFOND respecté : jamais plus que `limit`, et jamais au-delà du maximum dur', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `a${i}`)
    const { service, produce, query } = setup({ candidates: ids })
    // La requête borne par LIMIT ; le service borne AUSSI côté code (défense en profondeur).
    await service.run({ workspaceId: WS, limit: 3 })
    expect(produce).toHaveBeenCalledTimes(3)
    expect(query.mock.calls[0][1]).toContain(3)
    produce.mockClear()
    await service.run({ workspaceId: WS, limit: 10_000 })
    expect(query.mock.calls[1][1]).toContain(COMMERCIAL_BRIEF_BACKFILL_MAX_LIMIT)
    expect(produce.mock.calls.length).toBeLessThanOrEqual(COMMERCIAL_BRIEF_BACKFILL_MAX_LIMIT)
  })

  it('NE rejoue QUE l’étape brief, avec keepExisting (jamais d’écrasement) tant que `force` n’est pas posé', async () => {
    const { service, produce } = setup({ candidates: ['a1'] })
    await service.run({ workspaceId: WS })
    expect(produce).toHaveBeenCalledWith('a1', WS, { keepExisting: true })
  })

  it('`force` explicite : le brief existant peut être remplacé (sélection de TOUS les analysés, step sans keepExisting)', async () => {
    const { service, produce, query } = setup({ candidates: ['a1'] })
    await service.run({ workspaceId: WS, force: true })
    expect(produce).toHaveBeenCalledWith('a1', WS, { keepExisting: false })
    expect(String(query.mock.calls[0][0])).not.toMatch(/\? 'commercial_brief'/)
  })

  it('brief existant intact : le step répond `exists` ⇒ compté « déjà là », rien d’écrit par le service', async () => {
    const { service } = setup({ candidates: ['a1', 'a2'], outcome: id => (id === 'a1' ? 'exists' : 'written') })
    const out = await service.run({ workspaceId: WS })
    expect(out).toMatchObject({ processed: 2, written: 1, alreadyThere: 1 })
  })

  it('liste d’ids : compte d’un AUTRE espace refusé — jamais traité, nommé dans `refused`', async () => {
    const { service, produce, query } = setup({ inWorkspace: ['mine'] })
    const out = await service.run({ workspaceId: WS, accountIds: ['mine', 'theirs'] })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/workspace_id = \$1/)
    expect(params[0]).toBe(WS)
    expect(produce).toHaveBeenCalledTimes(1)
    expect(produce).toHaveBeenCalledWith('mine', WS, { keepExisting: true })
    expect(out.refused).toEqual(['theirs'])
  })

  it('liste d’ids : la liste est bornée par le plafond aussi', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `a${i}`)
    const { service, produce } = setup({ inWorkspace: ids })
    await service.run({ workspaceId: WS, accountIds: ids, limit: 5 })
    expect(produce).toHaveBeenCalledTimes(5)
  })

  it('un compte qui échoue ne coupe pas le lot ; rejeté et échec sont comptés à part', async () => {
    const { service, produce } = setup({
      candidates: ['a1', 'a2', 'a3'],
      outcome: id => (id === 'a1' ? new Error('boom') : id === 'a2' ? 'rejected' : 'written'),
    })
    const out = await service.run({ workspaceId: WS })
    expect(produce).toHaveBeenCalledTimes(3)
    expect(out).toMatchObject({ processed: 3, written: 1, rejected: 1, failed: 1 })
  })

  it('`disabled` (COMMERCIAL_BRIEF_ENABLED=false) arrête le lot dès le premier compte — rien n’est tenté pour rien', async () => {
    const { service, produce } = setup({ candidates: ['a1', 'a2', 'a3'], outcome: () => 'disabled' })
    const out = await service.run({ workspaceId: WS })
    expect(produce).toHaveBeenCalledTimes(1)
    expect(out.stoppedBecause).toBe('disabled')
  })

  it('reprenable : `afterId` reprend après le dernier compte, `nextCursor` rend le dernier id traité', async () => {
    const { service, query } = setup({ candidates: ['a1', 'a2'] })
    const out = await service.run({ workspaceId: WS, afterId: 'a0' })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/id > \$/)
    expect(params).toContain('a0')
    expect(sql).toMatch(/ORDER BY id/)
    expect(out.nextCursor).toBe('a2')
  })

  it('espace absent ⇒ refus net (jamais tout le parc)', async () => {
    const { service, produce, query } = setup()
    await expect(service.run({ workspaceId: '' })).rejects.toThrow(/workspaceId/)
    expect(query).not.toHaveBeenCalled()
    expect(produce).not.toHaveBeenCalled()
  })
})
