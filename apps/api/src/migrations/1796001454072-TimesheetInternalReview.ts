import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2415.6 — la revue INTERNE d'un relevé d'activité, distincte de la
 * validation CLIENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue demande quatre statuts distincts sur une période de CRA : déclaré
 * (consultant), vérifié en interne, accepté (client), facturable. Trois
 * existaient déjà (`status='submitted'`, `validated_by_client_at`,
 * `blocksInvoicing`) ; le quatrième — « relu en interne, PAS ENCORE transmis
 * au client » — n'avait pas de trace, parce que les deux seules écritures du
 * module (`reject`, `validateByClient`) posent `validated_by`/
 * `validated_by_client_at` ENSEMBLE, dans le MÊME clic (`timesheets.service.ts`
 * `validateByClient`).
 *
 * TRANCHÉ SANS LOUIS (registre `.claude/notes/registre-2026-09-20-chat-lot4.md`
 * ligne 2415.6, recommandation la plus conservatrice) : la revue interne
 * devient un geste SÉPARÉ (`TimesheetsService.reviewInternally`), additif,
 * qui ne touche ni `status` ni `validated_by_client_at` — la validation client
 * garde exactement son comportement d'avant.
 *
 * Additive, nullable : les relevés déjà en base n'ont pas cette trace et ne
 * l'inventent pas rétroactivement (« non mesuré » ≠ jamais posé).
 *
 * ⚠️ Horodatage repris à l'intégration (GA-372, vague 32) : l'original
 * (1796000761561, choisi par la branche `fix/w42-chat-lot4-24-09`) tombait
 * sous le maximum déjà en service sur `origin/main` (`ProviderCostLlmDetail`,
 * 1796001419760, fusionné en vague 30). `pnpm --filter api migration:next`
 * a rendu 1796001454072.
 */
export class TimesheetInternalReview1796001454072 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        ADD COLUMN IF NOT EXISTS internal_reviewed_at timestamptz,
        ADD COLUMN IF NOT EXISTS internal_reviewed_by uuid
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        DROP COLUMN IF EXISTS internal_reviewed_at,
        DROP COLUMN IF EXISTS internal_reviewed_by
    `)
  }
}
