import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2543.7 (18/09/2026) — LA DATE DE COLLECTE DES TROIS AUTRES SEGMENTS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts_collected_at` (migration `1795681472903`) a donné au rattrapage
 * ciblé (#2543/#AF) la date qu'il lui fallait pour le segment contacts — mais
 * SEUL ce segment la porte. `entities` (organigramme), `signals` (recherche)
 * et `strategy` (plan) restent DÉJÀ rejouables séparément (mécanisme identique,
 * `AnalysisOnDemandService.enrichOrganigram`/`refreshResearch`/`replan`), mais
 * sans date de collecte dédiée `SegmentCatchupService` ne peut pas décider
 * « qui est concerné » pour eux sans deviner — ce que la doctrine du 18/09
 * interdit explicitement.
 *
 * Additive, même forme EXACTE que `contacts_collected_at` : `timestamptz`,
 * NULLABLE, `IF NOT EXISTS`. `NULL` = « cette collecte n'a jamais été datée »
 * (tous les dossiers antérieurs à ce lot) — traité comme CONCERNÉ par tout
 * rattrapage futur sur ces segments (`isSegmentCollectionStale` rend `true`
 * sur `null`), jamais présumé à jour.
 *
 * Seuls écrivains prévus, un par colonne (miroir de
 * `AccountsService.applyContactsCollectedAt`) :
 *  - `entities_collected_at` ← `AnalysisPersistenceService.saveOrgChart`
 *  - `signals_collected_at`  ← `AccountsService.applyResearch` (le point de
 *    passage commun à TOUS les chemins de rafraîchissement de recherche)
 *  - `strategy_collected_at` ← `AnalysisPersistenceService.savePlan`
 *
 * ⚠️ Cette migration ne PEUPLE aucune capacité datée dans
 * `SEGMENT_CAPABILITY_EPOCH` (`packages/contracts/src/schemas/segment-catchup.ts`) —
 * elle pose seulement la colonne. Un futur correctif de collecte sur l'un de
 * ces trois segments ajoutera SA propre entrée dans cette table le jour où il
 * existe, jamais avant : dater une capacité qui n'a pas changé inventerait un
 * rattrapage sur du neuf.
 */
export class SegmentCollectedAtEntitiesSignalsStrategy1795712345678 implements MigrationInterface {
  public name = 'SegmentCollectedAtEntitiesSignalsStrategy1795712345678'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS entities_collected_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS signals_collected_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS strategy_collected_at timestamptz NULL`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
