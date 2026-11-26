import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2967 (lot V39) — la SOURCE de chaque ligne du journal de transition
 * commerciale : `human` (un geste), `laura` (une proposition de Laura validée
 * par un humain — `actor_id` reste l'humain qui a validé) ou
 * `human_correction` (une correction humaine, qui gagne toujours).
 *
 * Additive : colonne NOT NULL avec défaut `'human'` — toutes les lignes déjà
 * écrites l'ont été par un geste d'utilisateur ou un appelant de service, jamais
 * par Laura seule, ce que le défaut dit exactement. Aucune ligne réécrite.
 * GA-11/GA-12 : la contrainte (liste fermée `COMMERCIAL_TRANSITION_SOURCES`,
 * `@bellum/contracts`) se pose ICI, avant le code qui écrit la valeur.
 */
export class CommercialTransitionsSource1796351088561 implements MigrationInterface {
  name = 'CommercialTransitionsSource1796351088561'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commercial_transitions
        ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'human'
    `)
    await queryRunner.query(`
      ALTER TABLE commercial_transitions
        DROP CONSTRAINT IF EXISTS commercial_transitions_source_check,
        ADD CONSTRAINT commercial_transitions_source_check
          CHECK (source IN ('human', 'laura', 'human_correction'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commercial_transitions DROP CONSTRAINT IF EXISTS commercial_transitions_source_check
    `)
    await queryRunner.query(`ALTER TABLE commercial_transitions DROP COLUMN IF EXISTS source`)
  }
}
