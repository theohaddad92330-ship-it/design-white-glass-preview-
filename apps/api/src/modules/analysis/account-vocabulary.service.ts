import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { type EntityManager, Repository } from 'typeorm'
import type { AnalysisAccountVocabulary, AnalysisVocabularyTerm } from '@bellum/contracts'
import { AccountVocabularyEntity } from '../../database/entities/account-vocabulary.entity'

/**
 * The 8 vocabulary natures the DB CHECK constraint admits — the SINGLE SOURCE OF
 * TRUTH on the API side, mirroring `account_vocabulary_kind_check` in migration
 * `1783400000000-AccountVocabulary.ts`. The IA `VocabularyTerm.kind` is a free
 * string an LLM (`AccountVocabularyBuilder`, slice 2) can populate off-enum
 * (e.g. "regulation", "market", "product"); a value outside this set violates the
 * CHECK and aborts the WHOLE analysis (the QONTO incident). Every row's `kind` is
 * coerced through this whitelist (bad → `'acronym'`) so a hallucinated kind can
 * NEVER reach the INSERT. A drift test asserts this set equals the migration's.
 */
export const ACCOUNT_VOCABULARY_KINDS = [
  'entity',
  'program',
  'internal_competitor',
  'tool_erp',
  'trap_noise',
  'angle',
  'person',
  'acronym',
] as const

const ACCOUNT_VOCABULARY_KIND_SET: ReadonlySet<string> = new Set(ACCOUNT_VOCABULARY_KINDS)

/** Coerce an IA/prior `kind` into a DB-valid nature. Case/whitespace-insensitive;
 *  anything outside {@link ACCOUNT_VOCABULARY_KINDS} falls back to `'acronym'` so
 *  the DB CHECK is never violated. */
function coerceKind(raw: string | null | undefined): string {
  const k = (raw ?? '').trim().toLowerCase()
  return ACCOUNT_VOCABULARY_KIND_SET.has(k) ? k : 'acronym'
}

/** Accent/case-insensitive term key — mirrors the IA `normalize_name`, so the
 *  dedup/merge key matches between the deterministic builder and the DB. */
function termKey(term: string): string {
  return term
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

@Injectable()
export class AccountVocabularyService {
  constructor(
    @InjectRepository(AccountVocabularyEntity)
    private readonly repo: Repository<AccountVocabularyEntity>,
  ) {}

  /**
   * Persist the group's reading grid as normalized rows, MERGING with what is
   * already stored (Théo's "mergeable au re-run"):
   * - a deterministic re-derive refreshes kind / meaning / relatedEntity /
   *   truthStatus, but PRESERVES prior enrichment (commercialWhy, aliases) when
   *   the incoming value is empty — so a plain re-run never wipes the LLM
   *   AccountVocabularyBuilder's work;
   * - terms already stored but absent from this run are KEPT (a partial re-run
   *   must not drop the rest of the grid).
   * Upsert is keyed on (account_id, term_key).
   *
   * Multi-user Phase 2: every stamped row carries ``workspace_id`` (the run
   * owner's active workspace, resolved by the caller) so the team-scoped reads
   * see it — including rows re-derived on a merge, which backfills any prior
   * null. ``user_id`` is kept as created-by attribution. See
   * ``agent_docs/multi-user-workspaces.md``.
   */
  async saveVocabulary(
    accountId: string,
    userId: string,
    workspaceId: string,
    vocab: AnalysisAccountVocabulary | undefined,
    manager?: EntityManager,
  ): Promise<number> {
    const terms = vocab?.terms ?? []
    if (!terms.length) return 0
    const repo = manager ? manager.getRepository(AccountVocabularyEntity) : this.repo
    const existing = await repo.find({ where: { account_id: accountId } })
    const byKey = new Map(existing.map(r => [r.term_key, r]))

    const rows: AccountVocabularyEntity[] = []
    const seen = new Set<string>()
    for (const t of terms) {
      const term = (t.term ?? '').trim()
      const key = termKey(term)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const prior = byKey.get(key)
      rows.push(
        repo.create({
          id: prior?.id, // present → UPDATE, absent → INSERT
          user_id: userId,
          workspace_id: workspaceId,
          account_id: accountId,
          term,
          term_key: key,
          // Whitelist the merged kind (incoming wins, else prior) — an LLM can
          // emit a nature outside the DB CHECK; a bad value degrades to 'acronym'
          // rather than aborting the whole analysis at the INSERT. Merge order is
          // otherwise unchanged (see the drift + adversarial specs).
          kind: coerceKind(t.kind || prior?.kind),
          meaning: t.meaning || prior?.meaning || null,
          commercial_why: t.commercialWhy || prior?.commercial_why || null,
          aliases: t.aliases?.length ? t.aliases : (prior?.aliases ?? []),
          related_entity: t.relatedEntity || prior?.related_entity || null,
          truth_status: t.truthStatus || prior?.truth_status || null,
          source_refs: t.sourceRefs?.length ? t.sourceRefs : (prior?.source_refs ?? []),
        }),
      )
    }
    await repo.save(rows)
    return rows.length
  }

  /**
   * The stored reading grid of an account (Théo p.17/21 « Vocabulaire du
   * groupe »), in the camelCase wire shape the front consumes — one row per
   * term: sens / impact commercial / source / statut de vérité. Ordered by the
   * accent-insensitive term key so the grid renders in a stable alphabetical
   * order. Nullable columns collapse to `undefined` (never invented values).
   */
  async listForAccount(accountId: string): Promise<AnalysisVocabularyTerm[]> {
    const rows = await this.repo.find({ where: { account_id: accountId }, order: { term_key: 'ASC' } })
    return rows.map(r => ({
      term: r.term,
      kind: r.kind,
      meaning: r.meaning ?? undefined,
      commercialWhy: r.commercial_why ?? undefined,
      aliases: r.aliases ?? [],
      relatedEntity: r.related_entity ?? undefined,
      truthStatus: r.truth_status ?? undefined,
      sourceRefs: r.source_refs ?? [],
    }))
  }
}
