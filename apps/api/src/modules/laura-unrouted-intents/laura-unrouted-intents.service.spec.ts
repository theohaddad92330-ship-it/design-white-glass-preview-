import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Logger } from '@nestjs/common'
import { hashBehavioralSession, MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import { LauraUnroutedIntentsService } from './laura-unrouted-intents.service'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : la trace anonyme des demandes que
 * Laura n'a pas su router. L'écriture (sans identité) et la lecture (agrégée,
 * plancher à la LECTURE).
 */

function makeRepo() {
  return {
    insert: jest.fn().mockResolvedValue({ identifiers: [{ id: 'row-1' }] }),
    manager: { query: jest.fn().mockResolvedValue([]) },
  }
}

const NOW = new Date('2026-09-13T21:30:00.000Z')

describe('LauraUnroutedIntentsService.record — #1949.23', () => {
  const saved = process.env['LAURA_UNROUTED_INTENTS_DISABLED']
  beforeEach(() => delete process.env['LAURA_UNROUTED_INTENTS_DISABLED'])
  afterEach(() => {
    jest.restoreAllMocks()
    if (saved === undefined) delete process.env['LAURA_UNROUTED_INTENTS_DISABLED']
    else process.env['LAURA_UNROUTED_INTENTS_DISABLED'] = saved
  })

  it('écrit le JOUR, la surface, la langue, la catégorie, le texte masqué et sa clé, un hash tourné — et rien d’autre', async () => {
    const repo = makeRepo()
    const service = new LauraUnroutedIntentsService(repo as never)

    const outcome = await service.record({
      signal: { category: 'hors_perimetre', text: 'Quel temps fera-t-il ?' },
      workspaceId: 'ws-1',
      surface: 'chat',
      language: 'fr',
      now: NOW,
    })

    expect(outcome).toBe('written')
    expect(repo.insert).toHaveBeenCalledTimes(1)
    const [row] = repo.insert.mock.calls[0] as [Record<string, unknown>]
    expect(row).toEqual({
      occurred_on: '2026-09-13',
      surface: 'chat',
      language: 'fr',
      category: 'hors_perimetre',
      text_masked: 'Quel temps fera-t-il ?',
      text_normalized: 'quel temps fera t il',
      workspace_day_hash: hashBehavioralSession('ws-1', NOW),
    })
    // Aucun identifiant d'espace ni de personne n'atteint la ligne.
    expect(JSON.stringify(row)).not.toContain('ws-1')
  })

  it('le hash TOURNE d’un jour à l’autre — on ne suit pas un espace dans le temps', async () => {
    const repo = makeRepo()
    const service = new LauraUnroutedIntentsService(repo as never)
    const signal = { category: 'capacite_absente' as const, text: 'Exporte vers mon ERP' }

    await service.record({ signal, workspaceId: 'ws-1', surface: 'chat', language: null, now: NOW })
    await service.record({
      signal,
      workspaceId: 'ws-1',
      surface: 'chat',
      language: null,
      now: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    })

    const [first, second] = repo.insert.mock.calls.map(
      call => (call[0] as { workspace_day_hash: string }).workspace_day_hash,
    )
    expect(first).not.toBe(second)
  })

  it('interrupteur posé → aucune écriture', async () => {
    process.env['LAURA_UNROUTED_INTENTS_DISABLED'] = 'true'
    const repo = makeRepo()
    const service = new LauraUnroutedIntentsService(repo as never)

    const outcome = await service.record({
      signal: { category: 'hors_perimetre', text: 'x' },
      workspaceId: 'ws-1',
      surface: 'chat',
      language: 'fr',
      now: NOW,
    })

    expect(outcome).toBe('cut')
    expect(repo.insert).not.toHaveBeenCalled()
  })

  it('une écriture en échec ne lève jamais, et le journal ne recopie NI le texte NI l’erreur', async () => {
    const repo = makeRepo()
    repo.insert.mockRejectedValue(new Error('violates check constraint — Quel temps fera-t-il ?'))
    const errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const service = new LauraUnroutedIntentsService(repo as never)

    const outcome = await service.record({
      signal: { category: 'hors_perimetre', text: 'Quel temps fera-t-il ?' },
      workspaceId: 'ws-1',
      surface: 'chat',
      language: 'fr',
      now: NOW,
    })

    expect(outcome).toBe('failed')
    expect(errors).toHaveBeenCalled()
    expect(JSON.stringify(errors.mock.calls)).not.toContain('Quel temps')
  })
})

describe('LauraUnroutedIntentsService.report — #1949.23, plancher appliqué à la LECTURE', () => {
  const groupRow = (text: string, distinct: number) => ({
    textNormalized: text.toLowerCase(),
    sample: text,
    occurrences: distinct + 1,
    distinctOccurrences: distinct,
    surfaces: ['chat'],
    categories: ['hors_perimetre'],
    languages: ['fr'],
  })

  it('rend les groupes publiables et le COMPTE des groupes retenus — jamais leur texte', async () => {
    const repo = makeRepo()
    repo.manager.query.mockImplementation(async (sql: string) =>
      sql.includes('GROUP BY')
        ? [groupRow('Quel temps fera-t-il', MIN_DISTINCT_SESSIONS_FOR_A_METRIC), groupRow('Réserve un train', 2)]
        : [{ recorded: 9 }],
    )
    const service = new LauraUnroutedIntentsService(repo as never)

    const report = await service.report(30, NOW)

    expect(report.windowDays).toBe(30)
    expect(report.minDistinctOccurrences).toBe(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)
    expect(report.recorded).toBe(9)
    expect(report.groups.map(group => group.text)).toEqual(['Quel temps fera-t-il'])
    expect(report.withheldGroups).toBe(1)
    expect(JSON.stringify(report)).not.toContain('train')
  })

  it('la fenêtre est paramétrée et bornée par la rétention — jamais concaténée dans le SQL', async () => {
    const repo = makeRepo()
    const service = new LauraUnroutedIntentsService(repo as never)

    const report = await service.report(365, NOW)

    expect(report.windowDays).toBe(90)
    for (const [sql, params] of repo.manager.query.mock.calls as [string, unknown[]][]) {
      expect(sql).not.toContain('2026-')
      expect(params[0]).toBe('2026-06-15')
    }
  })

  it('une fenêtre illisible retombe sur la rétention, jamais sur NaN', async () => {
    const repo = makeRepo()
    const service = new LauraUnroutedIntentsService(repo as never)
    expect((await service.report(Number.NaN, NOW)).windowDays).toBe(90)
    expect((await service.report(undefined, NOW)).windowDays).toBe(90)
  })

  it('un compte illisible n’est pas zéro — `recorded` vaut null', async () => {
    const repo = makeRepo()
    repo.manager.query.mockImplementation(async (sql: string) => (sql.includes('GROUP BY') ? [] : [{}]))
    const service = new LauraUnroutedIntentsService(repo as never)
    expect((await service.report(30, NOW)).recorded).toBeNull()
  })
})

describe('laura_unrouted_intents — effacement de compte et export : rien à y chercher', () => {
  it('l’entité ne porte AUCUNE colonne d’identité — ni utilisateur, ni espace', () => {
    // C'est ce qui rend le traitement anonyme au sens du stockage, et c'est
    // pourquoi `PrivacyDeletionService` (art. 17) et `PrivacyExportService`
    // (art. 15/20) n'ont ni filtre ni ligne à rendre ici.
    const source = readFileSync(
      join(__dirname, '..', '..', 'database', 'entities', 'laura-unrouted-intent.entity.ts'),
      'utf8',
    )
    const columns = [...source.matchAll(/^ {2}([a-z_]+)[!?]?:/gm)].map(match => match[1])
    expect(columns).toEqual(
      expect.arrayContaining(['occurred_on', 'surface', 'language', 'category', 'text_masked', 'workspace_day_hash']),
    )
    expect(columns).not.toContain('user_id')
    expect(columns).not.toContain('workspace_id')
    expect(columns).not.toContain('created_at')
  })
})
