import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Mémoire de relation — bloc « Mémoire » de la couche zéro (annexe méthodo p8).
 *
 * La couche zéro lisait le CRM connecté et la prospection inversée, mais rien ne
 * PERSISTAIT ce que le commercial apprend (relation, date, owner, prochaine
 * revue, issue, source). Cette colonne le capture pour le relire au run suivant.
 * Additive/nullable : NULL = aucune mémoire, comportement historique.
 */
export class AccountRelationshipMemory1788028441107 implements MigrationInterface {
  public name = 'AccountRelationshipMemory1788028441107'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS relationship_memory jsonb`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS relationship_memory`)
  }
}
