import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le motif d'une intervention close.
 *
 * La file se vidait sans laisser de trace de ce qui avait été fait. Trois
 * semaines plus tard, « pourquoi cette facture bloquée a-t-elle été passée en
 * résolu » n'avait aucune réponse — et c'est la question qu'on se pose quand
 * elle revient.
 *
 * Le motif est OBLIGATOIRE pour clore, facultatif pour accuser réception : les
 * deux gestes ne disent pas la même chose. La règle vit dans le contrat
 * (`decideInterventionSchema`), la colonne ne fait que la conserver.
 */
export class InterventionDecisionReason1789990000003 implements MigrationInterface {
  name = 'InterventionDecisionReason1789990000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable, et sans valeur par défaut : les lignes closes AVANT cette
    // migration n'ont pas de motif, et leur en inventer un serait pire que de
    // laisser voir qu'on ne sait pas.
    await queryRunner.query(`ALTER TABLE interventions ADD COLUMN IF NOT EXISTS decision_reason text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE interventions DROP COLUMN IF EXISTS decision_reason`)
  }
}
