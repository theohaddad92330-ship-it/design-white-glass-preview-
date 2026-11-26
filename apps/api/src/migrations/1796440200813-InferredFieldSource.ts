import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4016 lot L4 (décision Louis 11/10/2026) — LA PROVENANCE `inferred`, une
 * valeur ESTIMÉE, toujours badgée « estimé », jamais une preuve.
 *
 * GA-11 / GA-12 — cette migration ARRIVE AVANT le code qui écrit la valeur :
 * elle élargit les DEUX tables qui portent la provenance PAR CHAMP
 * (`field_provenance`, l'arbitre courant ; `record_field_audit`, le journal),
 * en repartant de la dernière liste déclarée (`1789301274613-CrmAtsSocle`).
 *
 * Ce qu'elle n'élargit PAS, et c'est voulu : la finance (`mission_expenses`,
 * `supplier_invoices`, `outgoing_payments`), les retours de mission, les faits
 * d'accès et les actions du plan gardent leurs quatre sources
 * (`EVIDENCE_FIELD_SOURCES`) — la base y dit NON à une estimation.
 */
export class InferredFieldSource1796440200813 implements MigrationInterface {
  name = 'InferredFieldSource1796440200813'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE field_provenance DROP CONSTRAINT IF EXISTS field_provenance_source_check`)
    await queryRunner.query(`
      ALTER TABLE field_provenance
        ADD CONSTRAINT field_provenance_source_check
        CHECK (source IN ('human', 'connector', 'pipeline', 'model', 'inferred'))
    `)
    await queryRunner.query(`ALTER TABLE record_field_audit DROP CONSTRAINT IF EXISTS record_field_audit_source_check`)
    await queryRunner.query(`
      ALTER TABLE record_field_audit
        ADD CONSTRAINT record_field_audit_source_check
        CHECK (source IN ('human', 'connector', 'pipeline', 'model', 'inferred'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On archive, on ne supprime pas : une ligne estimée REDEVIENT un modèle
    // (la source la plus faible qui existait) plutôt que de disparaître.
    await queryRunner.query(`UPDATE field_provenance SET source = 'model' WHERE source = 'inferred'`)
    await queryRunner.query(`UPDATE record_field_audit SET source = 'model' WHERE source = 'inferred'`)
    await queryRunner.query(`ALTER TABLE field_provenance DROP CONSTRAINT IF EXISTS field_provenance_source_check`)
    await queryRunner.query(`
      ALTER TABLE field_provenance
        ADD CONSTRAINT field_provenance_source_check
        CHECK (source IN ('human', 'connector', 'pipeline', 'model'))
    `)
    await queryRunner.query(`ALTER TABLE record_field_audit DROP CONSTRAINT IF EXISTS record_field_audit_source_check`)
    await queryRunner.query(`
      ALTER TABLE record_field_audit
        ADD CONSTRAINT record_field_audit_source_check
        CHECK (source IN ('human', 'connector', 'pipeline', 'model'))
    `)
  }
}
