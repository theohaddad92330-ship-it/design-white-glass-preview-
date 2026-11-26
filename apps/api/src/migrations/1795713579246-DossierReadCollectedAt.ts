import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2118.51 (18/09/2026) — LA DATE DE COLLECTE DU CINQUIÈME SEGMENT : LA LECTURE
 * EN SEPT AXES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2118 a livré la lecture du dossier en sept axes (`evaluation.dossier_read`,
 * commit `4c8169c81239666d8b4eb7959dd06ff1ad35ace0`, 14/09/2026). Un compte
 * analysé AVANT ce commit n'a jamais eu la moindre chance de porter cette
 * décomposition : son verdict s'affiche, sa décomposition n'existe pas (voir
 * THALES en production le 18/09). Ce n'est pas une re-collecte (aucun
 * fournisseur externe) — Phase 4 relit la recherche + les contacts déjà en
 * base et re-décompose le score, exactement ce que `replan` fait déjà pour le
 * segment `strategy`. Louis tranche (18/09/2026) : la lecture en sept axes
 * devient son PROPRE segment de rattrapage, sur le modèle EXACT de `contacts`
 * — distinct de `strategy`, parce qu'une future capacité sur la stratégie
 * elle-même (l'angle, le mode d'entrée) ne doit jamais dater ce segment-ci, et
 * réciproquement.
 *
 * Additive, même forme EXACTE que `contacts_collected_at` /
 * `strategy_collected_at` : `timestamptz`, NULLABLE, `IF NOT EXISTS`. `NULL` =
 * « cette lecture n'a jamais été datée » (tout dossier antérieur à ce lot) —
 * traité comme CONCERNÉ par le rattrapage (`isSegmentCollectionStale` rend
 * `true` sur `null`), jamais présumé à jour.
 *
 * Seul écrivain prévu : `AnalysisPersistenceService.savePlan`, au MÊME point
 * et sous la MÊME condition que `applyStrategyCollectedAt` — c'est là que
 * `evaluation.dossier_read` est réellement écrit (Phase 4, pipeline complet OU
 * « Changer de stratégie »/rattrapage).
 */
export class DossierReadCollectedAt1795713579246 implements MigrationInterface {
  public name = 'DossierReadCollectedAt1795713579246'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dossier_read_collected_at timestamptz NULL`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
