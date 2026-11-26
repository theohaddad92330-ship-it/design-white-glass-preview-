import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `workspaces.default_context_mode` — #2451.9.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN RÉGLAGE, PAS UNE RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `workspace_rules` (#2081.14, migration `1789808789203-WorkspaceRules`) porte
 * DEUX règles, et son propre contrat le dit : « le socle en porte deux, et pas
 * davantage », « une règle ne fait que RESTREINDRE ». Le mode de contexte par
 * défaut ne retire aucun droit à personne — il ne fait que remplacer la valeur
 * de repli d'un fil neuf. Il vit donc sur `workspaces`, comme `market` et
 * `timezone`, pas dans `workspace_rules`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDITIVE, DÉFAUT IDENTIQUE AU COMPORTEMENT D'AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `DEFAULT 'my_activity'` reproduit `DEFAULT_LAURA_CONTEXT_MODE`
 * (`packages/contracts/src/schemas/laura-context-mode.ts`) au bit près : tout
 * espace existant garde exactement le comportement d'avant ce lot. Contrairement
 * au fuseau (#1958.2, NULL = « jamais réglé »), les trois valeurs de l'enum sont
 * TOUTES un choix valide et stable (GA-08) — il n'y a pas de troisième état
 * « non réglé » à distinguer, donc pas de `NULL`.
 *
 * GA-11/GA-12 — la contrainte CHECK sur les trois modes canoniques arrive
 * ÉLARGIE (créée) AVANT le service qui écrit la colonne.
 */
export class WorkspaceDefaultContextMode1796000665432 implements MigrationInterface {
  public name = 'WorkspaceDefaultContextMode1796000665432'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS default_context_mode text NOT NULL DEFAULT 'my_activity'`,
    )
    await queryRunner.query(
      `ALTER TABLE workspaces ADD CONSTRAINT workspaces_default_context_mode_check
         CHECK (default_context_mode IN ('my_activity', 'one_off_mission', 'neutral'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_default_context_mode_check`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS default_context_mode`)
  }
}
