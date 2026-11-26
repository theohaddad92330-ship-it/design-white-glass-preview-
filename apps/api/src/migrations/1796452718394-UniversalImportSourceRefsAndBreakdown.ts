import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Lot IMPORT-CRM (Louis 12/10/2026) — #4051 / #4052 / #4053. La CONTRAINTE avant le code (GA-11/GA-12).
 *
 *  · `universal_import_issues.kind` s'élargit à `to_reconcile` (#4051.2) : une société PROPOSÉE à valider,
 *    une référence inconnue, un homonyme — ni un doublon, ni un rejet. Élargissement seul : aucune ligne
 *    existante ne peut le violer.
 *  · `universal_import_jobs.source_system` (#4052.2) : le CRM d'origine déclaré, qui BORNE les références
 *    source (`sync_links`) — la même référence chez deux CRM ne désigne pas la même fiche.
 *  · `universal_import_jobs.breakdown` (#4051.1) : le bilan PAR FAMILLE, écrit dans la même transaction que
 *    le paquet (un fichier contacts crée aussi des comptes, #4053). `{}` = rien d'écrit, jamais un 0 inventé.
 *  · `universal_import_jobs.to_reconcile_count` (#4051.2) : le compteur des rattachements à trancher.
 *
 * Aucune table neuve pour les références : `sync_links` est déjà LA notion de référence source par espace
 * (connecteurs) ; un import fichier y écrit sous `csv` (préfixé par sa source) ou sous le fournisseur connu.
 */
export class UniversalImportSourceRefsAndBreakdown1796452718394 implements MigrationInterface {
  public name = 'UniversalImportSourceRefsAndBreakdown1796452718394'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE universal_import_issues DROP CONSTRAINT IF EXISTS universal_import_issues_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE universal_import_issues
        ADD CONSTRAINT universal_import_issues_kind_check
        CHECK (kind IN ('duplicate', 'rejected', 'to_reconcile'))
    `)
    await queryRunner.query(`ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS source_system text`)
    await queryRunner.query(
      `ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS breakdown jsonb NOT NULL DEFAULT '{}'::jsonb`,
    )
    await queryRunner.query(
      `ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS to_reconcile_count integer NOT NULL DEFAULT 0`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE universal_import_jobs DROP COLUMN IF EXISTS to_reconcile_count`)
    await queryRunner.query(`ALTER TABLE universal_import_jobs DROP COLUMN IF EXISTS breakdown`)
    await queryRunner.query(`ALTER TABLE universal_import_jobs DROP COLUMN IF EXISTS source_system`)
    // ⚠️ Échoue si une ligne `to_reconcile` existe — voulu : resserrer détruirait la trace d'un import réel.
    await queryRunner.query(
      `ALTER TABLE universal_import_issues DROP CONSTRAINT IF EXISTS universal_import_issues_kind_check`,
    )
    await queryRunner.query(`
      ALTER TABLE universal_import_issues
        ADD CONSTRAINT universal_import_issues_kind_check
        CHECK (kind IN ('duplicate', 'rejected'))
    `)
  }
}
