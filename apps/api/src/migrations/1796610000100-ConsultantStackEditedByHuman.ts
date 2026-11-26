import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #5016.3 — « une correction humaine gagne » : `syncStack` réinjectait dans `consultants.stack` une compétence
 * qu'une personne venait de retirer du formulaire. Ce marqueur dit « la stack a été corrigée à la main à cette
 * date » ; au-delà, seules les compétences entrées APRÈS cette date s'y ajoutent.
 * Ajout seul, nullable : une fiche jamais corrigée à la main reste NULL, rien n'est supposé.
 */
export class ConsultantStackEditedByHuman1796610000100 implements MigrationInterface {
  public name = 'ConsultantStackEditedByHuman1796610000100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS stack_edited_by_human_at timestamptz`)
  }

  public async down(): Promise<void> {
    // Ajout seul : la colonne reste.
  }
}
