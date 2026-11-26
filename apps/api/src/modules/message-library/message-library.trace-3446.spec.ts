/**
 * #3446 test 10 — TRAÇABILITÉ : chaque production de Laura (modèle verbatim
 * choisi, exemples de comportement injectés, ou refus) laisse une trace
 * PERSISTANTE : modèle + version, exemples injectés, règles appliquées,
 * variables, preuves manquantes, contrôles (écartés) et décision finale.
 */
import { MessageLibraryService, type MessageLibraryCtx } from './message-library.service'
import { ALL_IMPORTED_SEQUENCES, BEHAVIOR_EXAMPLES_3443 } from './message-library.seed-data'

type Row = Record<string, unknown>

function repo(rows: Row[] = []) {
  return {
    rows,
    create: (data: Row) => ({ ...data }),
    find: jest.fn(async (opts?: { where?: Row }) =>
      rows.filter(r => Object.entries(opts?.where ?? {}).every(([key, value]) => r[key] === value)),
    ),
    save: jest.fn(async (row: Row) => {
      if (!row.id) row.id = `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, '0')}`
      if (!rows.includes(row)) rows.push(row)
      return row
    }),
  }
}

const CTX: MessageLibraryCtx = {
  userId: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  role: 'sales',
}

async function seeded() {
  const entries = repo()
  const traces = repo()
  const service = new MessageLibraryService(entries as never, traces as never)
  await service.importDefaults(CTX)
  return { service, traces, entries }
}

describe('MessageLibraryService — trace persistante (#3446.10)', () => {
  it('une sélection verbatim garde modèle, version, règles, variables, écartés et décision', async () => {
    const { service, traces } = await seeded()
    const approved = ALL_IMPORTED_SEQUENCES.find(e => e.status === 'approuve' && e.mode === 'verbatim')
    expect(approved).toBeDefined()
    const result = await service.select(CTX, {
      channel: approved!.channel,
      scenarioId: approved!.scenarioId,
      persona: approved!.persona,
    })
    expect(traces.rows).toHaveLength(1)
    expect(traces.rows[0]).toMatchObject({
      workspace_id: CTX.workspaceId,
      user_id: CTX.userId,
      kind: 'verbatim',
      entry_id: result.selectedId,
      decision: result.selectedId ? 'template_selected' : 'no_template',
      rules: result.reasons,
    })
    if (result.selectedId) {
      expect(traces.rows[0].entry_version).toBe(approved!.version)
      expect(traces.rows[0].variables).toEqual(approved!.expectedVariables)
    }
    expect(traces.rows[0].checks).toEqual(result.rejected)
  })

  it('une sélection sans modèle approuvé garde le refus (aucun modèle) et ses raisons', async () => {
    const entries = repo()
    const traces = repo()
    const service = new MessageLibraryService(entries as never, traces as never)
    await service.select(CTX, { channel: 'call_brief', scenarioId: 'cold_approach', persona: 'acheteur' })
    expect(traces.rows[0]).toMatchObject({ kind: 'verbatim', entry_id: null, decision: 'no_template' })
  })

  it('les exemples de comportement injectés et les preuves manquantes sont tracés', async () => {
    const { service, traces } = await seeded()
    const ex = BEHAVIOR_EXAMPLES_3443[0]
    const result = await service.selectBehavior(CTX, {
      channel: ex.channel,
      scenarioId: ex.scenarioId,
      persona: ex.persona,
    })
    expect(traces.rows).toHaveLength(1)
    const row = traces.rows[0]
    expect(row.kind).toBe('inspiration')
    expect(row.injected_example_ids).toEqual(result.examples.map(e => e.id))
    expect(row.proofs_missing).toEqual(result.examples.flatMap(e => e.unverifiedClaims))
    expect(row.decision).toBe(result.examples.length > 0 ? 'examples_injected' : 'no_example')
  })

  it('un échec d’écriture de la trace ne casse jamais la sélection', async () => {
    const { service, traces } = await seeded()
    traces.save.mockRejectedValueOnce(new Error('db down'))
    await expect(
      service.select(CTX, { channel: 'call_brief', scenarioId: 'cold_approach', persona: 'acheteur' }),
    ).resolves.toBeDefined()
  })

  it('sans dépôt de traces câblé, la sélection marche (module retirable)', async () => {
    const service = new MessageLibraryService(repo() as never)
    await expect(
      service.select(CTX, { channel: 'call_brief', scenarioId: 'cold_approach', persona: 'acheteur' }),
    ).resolves.toBeDefined()
  })

  it('liste les traces de l’espace, la plus récente d’abord', async () => {
    const { service, traces } = await seeded()
    await service.select(CTX, { channel: 'call_brief', scenarioId: 'cold_approach', persona: 'acheteur' })
    const list = await service.listTraces(CTX)
    expect(list).toHaveLength(traces.rows.length)
    expect(list[0]).toHaveProperty('decision')
  })
})
