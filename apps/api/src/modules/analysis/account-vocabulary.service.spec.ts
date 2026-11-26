import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Repository } from 'typeorm'
import type { AnalysisAccountVocabulary } from '@bellum/contracts'
import { AccountVocabularyEntity } from '../../database/entities/account-vocabulary.entity'
import { ACCOUNT_VOCABULARY_KINDS, AccountVocabularyService } from './account-vocabulary.service'

function makeRepo(existing: Partial<AccountVocabularyEntity>[] = []) {
  const saved: Partial<AccountVocabularyEntity>[] = []
  return {
    find: jest.fn().mockResolvedValue(existing),
    create: jest.fn((x: Partial<AccountVocabularyEntity>) => x),
    save: jest.fn((rows: Partial<AccountVocabularyEntity>[]) => {
      saved.push(...rows)
      return Promise.resolve(rows)
    }),
    saved: () => saved,
  }
}

describe('AccountVocabularyService.saveVocabulary', () => {
  it('inserts new terms, dedupes by normalised term, skips empty', async () => {
    const repo = makeRepo([])
    const svc = new AccountVocabularyService(repo as unknown as Repository<AccountVocabularyEntity>)
    const n = await svc.saveVocabulary('acc-1', 'user-1', 'ws-1', {
      version: 'v1',
      terms: [
        { term: 'Axians', kind: 'entity' },
        { term: 'axians', kind: 'entity' }, // dup by key → dropped
        { term: '  ', kind: 'entity' }, // empty → skipped
      ],
    })
    expect(n).toBe(1)
    expect(repo.saved()[0].term_key).toBe('axians')
    expect(repo.saved()[0].id).toBeUndefined() // insert
    // Multi-user Phase 2: the row carries the active workspace + created-by user.
    expect(repo.saved()[0].workspace_id).toBe('ws-1')
    expect(repo.saved()[0].user_id).toBe('user-1')
  })

  it('merges: a deterministic re-run refreshes derived fields but PRESERVES enrichment', async () => {
    const prior: Partial<AccountVocabularyEntity> = {
      id: 'row-1',
      term_key: 'axians',
      kind: 'entity',
      meaning: 'old',
      commercial_why: 'ESN interne du groupe VINCI',
      aliases: ['VESI'],
    }
    const repo = makeRepo([prior])
    const svc = new AccountVocabularyService(repo as unknown as Repository<AccountVocabularyEntity>)
    await svc.saveVocabulary('acc-1', 'user-1', 'ws-1', {
      version: 'v1',
      terms: [{ term: 'Axians', kind: 'internal_competitor', meaning: 'new' }], // no commercialWhy/aliases
    })
    const row = repo.saved()[0]
    expect(row.id).toBe('row-1') // upsert (UPDATE, not a duplicate INSERT)
    expect(row.kind).toBe('internal_competitor') // deterministic refresh
    expect(row.meaning).toBe('new') // refreshed
    expect(row.commercial_why).toBe('ESN interne du groupe VINCI') // enrichment PRESERVED
    expect(row.aliases).toEqual(['VESI']) // preserved
    // Multi-user Phase 2: a merged/updated row also (back)fills workspace_id.
    expect(row.workspace_id).toBe('ws-1')
  })

  it('is a no-op on empty / undefined vocab', async () => {
    const repo = makeRepo([])
    const svc = new AccountVocabularyService(repo as unknown as Repository<AccountVocabularyEntity>)
    expect(await svc.saveVocabulary('a', 'u', 'w', undefined)).toBe(0)
    expect(await svc.saveVocabulary('a', 'u', 'w', { version: 'v1', terms: [] })).toBe(0)
    expect(repo.save).not.toHaveBeenCalled()
  })
})

describe('AccountVocabularyService.listForAccount', () => {
  it('maps stored rows to the camelCase wire shape, ordered by term', async () => {
    const rows: Partial<AccountVocabularyEntity>[] = [
      {
        term: 'Axians',
        term_key: 'axians',
        kind: 'internal_competitor',
        meaning: 'ESN interne du groupe VINCI',
        commercial_why: 'Concurrencer ou rang 2',
        aliases: ['VESI'],
        related_entity: 'VINCI Energies',
        truth_status: 'risque',
        source_refs: ['https://example.com/axians'],
      },
      {
        term: 'TDSI',
        term_key: 'tdsi',
        kind: 'acronym',
        meaning: null,
        commercial_why: null,
        aliases: [],
        related_entity: null,
        truth_status: null,
        source_refs: [],
      },
    ]
    const repo = makeRepo()
    repo.find.mockResolvedValue(rows)
    const svc = new AccountVocabularyService(repo as unknown as Repository<AccountVocabularyEntity>)

    const terms = await svc.listForAccount('acc-1')

    // Query scoped to the account, deterministic alphabetical order.
    expect(repo.find).toHaveBeenCalledWith({ where: { account_id: 'acc-1' }, order: { term_key: 'ASC' } })
    expect(terms).toEqual([
      {
        term: 'Axians',
        kind: 'internal_competitor',
        meaning: 'ESN interne du groupe VINCI',
        commercialWhy: 'Concurrencer ou rang 2',
        aliases: ['VESI'],
        relatedEntity: 'VINCI Energies',
        truthStatus: 'risque',
        sourceRefs: ['https://example.com/axians'],
      },
      // Nullable columns collapse to undefined / empty arrays — never invented values.
      { term: 'TDSI', kind: 'acronym', aliases: [], sourceRefs: [] },
    ])
  })

  it('returns [] for an account without a stored grid', async () => {
    const repo = makeRepo()
    const svc = new AccountVocabularyService(repo as unknown as Repository<AccountVocabularyEntity>)
    expect(await svc.listForAccount('acc-none')).toEqual([])
  })
})

// The exact bug class that errored a COMPLETE QONTO dossier: an LLM emits a
// vocabulary `kind` outside the DB CHECK set → the INSERT violates
// `account_vocabulary_kind_check` → the whole analysis is marked 'error'. These
// two guards catch it before prod: the drift guard keeps code ⇄ DB in lock-step,
// the adversarial test proves a hallucinated kind is coerced, never thrown.
describe('AccountVocabularyService — kind DB-constraint safety', () => {
  /** The `kind IN (...)` whitelist the DB CHECK enforces, parsed straight from the
   *  migration so this test is the single binding between code and schema. */
  function migrationKinds(): Set<string> {
    const migration = readFileSync(join(__dirname, '../../migrations/1783400000000-AccountVocabulary.ts'), 'utf8')
    const inList = /kind\s+TEXT\s+NOT NULL\s+CHECK\s*\(\s*kind\s+IN\s*\(([^)]*)\)/i.exec(migration)
    if (!inList) throw new Error('could not parse the kind CHECK list from the AccountVocabulary migration')
    return new Set(Array.from(inList[1].matchAll(/'([^']+)'/g), m => m[1]))
  }

  it('drift guard: the code whitelist EQUALS the DB CHECK constraint', () => {
    // Fails loudly if a kind is added to the DB but not the code (or vice-versa),
    // so the two can never silently diverge and re-open the constraint hole.
    expect(new Set(ACCOUNT_VOCABULARY_KINDS)).toEqual(migrationKinds())
    expect(ACCOUNT_VOCABULARY_KINDS).toContain('acronym') // the safe fallback must itself be valid
  })

  it('coerces invalid/hallucinated kinds to acronym, preserves valid ones, and never throws', async () => {
    const repo = makeRepo([])
    const svc = new AccountVocabularyService(repo as unknown as Repository<AccountVocabularyEntity>)

    const vocab = {
      version: 'v1',
      terms: [
        { term: 'RGPD', kind: 'regulation' }, // hallucinated nature → acronym
        { term: 'SaaS Market', kind: 'MARKET' }, // off-enum + upper-case → acronym
        { term: 'Concept X', kind: 'concept' }, // off-enum → acronym
        { term: 'Blank', kind: '' }, // empty → acronym
        { term: 'Nullish', kind: null as unknown as string }, // null → acronym
        { term: 'Axians', kind: 'entity' }, // valid → passes through
        { term: 'Codex', kind: '  TOOL_ERP ' }, // valid but padded/upper → tool_erp
      ],
    } satisfies AnalysisAccountVocabulary

    // (a) must NOT throw — a bad kind degrades, it never aborts the persist.
    const n = await svc.saveVocabulary('acc-1', 'user-1', 'ws-1', vocab)
    expect(n).toBe(7)

    const byTerm = Object.fromEntries(repo.saved().map(r => [r.term, r.kind]))
    // (b) invalid kinds coerced to the safe fallback.
    expect(byTerm['RGPD']).toBe('acronym')
    expect(byTerm['SaaS Market']).toBe('acronym')
    expect(byTerm['Concept X']).toBe('acronym')
    expect(byTerm['Blank']).toBe('acronym')
    expect(byTerm['Nullish']).toBe('acronym')
    // (c) valid kinds pass through (normalised to canonical lower-case).
    expect(byTerm['Axians']).toBe('entity')
    expect(byTerm['Codex']).toBe('tool_erp')

    // Belt-and-suspenders: EVERY persisted kind is DB-valid — nothing that could
    // violate the CHECK constraint ever reaches the INSERT.
    const allowed = new Set<string>(ACCOUNT_VOCABULARY_KINDS)
    for (const r of repo.saved()) expect(allowed.has(r.kind as string)).toBe(true)
  })

  it('a hallucinated incoming kind coerces to acronym even over a valid prior (incoming-wins, then whitelist)', async () => {
    const prior: Partial<AccountVocabularyEntity> = { id: 'row-1', term_key: 'axians', kind: 'entity' }
    const repo = makeRepo([prior])
    const svc = new AccountVocabularyService(repo as unknown as Repository<AccountVocabularyEntity>)

    await svc.saveVocabulary('acc-1', 'user-1', 'ws-1', {
      version: 'v1',
      terms: [{ term: 'Axians', kind: 'market' }], // bad refresh over a good prior
    })

    expect(repo.saved()[0].kind).toBe('acronym') // never the invalid 'market'
  })
})
