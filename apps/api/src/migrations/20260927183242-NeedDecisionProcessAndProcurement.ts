import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2939 (#2174.32/.33/.34) — LE PROCESSUS DE DÉCISION, LE DÉCIDEUR, LES ACHATS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS COLONNES ADDITIVES, MÊME PATRON QUE `NeedFields`/`NeedOriginChannelCertifications`
 * ─────────────────────────────────────────────────────────────────────────────
 * `decision_process` est un texte libre — même famille que `presentation_process`
 * (`1789537604211-NeedFields.ts`) : jamais une énumération de ses étapes, ce
 * n'est ni le TRAVAIL de recrutement (`presentation_process` porte déjà les
 * entretiens) ni la vente elle-même, c'est comment LE CLIENT décide en interne
 * (comité, DSI, validation budgétaire…).
 *
 * `decision_maker_contact_id` est une PERSONNE, jamais une chaîne de
 * caractères — même forme que `contact_id` (l'interlocuteur, migration
 * antérieure) : un contact DE CE COMPTE, vérifié côté serveur avant écriture
 * (voir `assertContactBelongsToAccount`, `project-pipeline.service.ts`).
 *
 * `procurement_involvement` réutilise EXACTEMENT les deux valeurs déjà nommées
 * par le compilateur de besoin (`NEED_PROCUREMENT_INVOLVEMENTS`,
 * `need-compilation.ts`, #2322.49) : le service achats est dans la boucle, ou
 * il ne l'est pas — deux valeurs, pas trois, un « peut-être » ferait passer une
 * absence de réponse pour un arbitrage.
 *
 * Les trois colonnes sont NULLABLE : un besoin déjà en base n'a ni processus,
 * ni décideur, ni achats connus — « non renseigné » est une réponse honnête,
 * jamais un défaut deviné.
 */
export class NeedDecisionProcessAndProcurement20260927183242 implements MigrationInterface {
  name = 'NeedDecisionProcessAndProcurement20260927183242'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD COLUMN IF NOT EXISTS decision_process text,
        ADD COLUMN IF NOT EXISTS decision_maker_contact_id uuid,
        ADD COLUMN IF NOT EXISTS procurement_involvement text
    `)

    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_procurement_involvement_check CHECK (
        procurement_involvement IS NULL OR procurement_involvement IN ('implique','non_implique')
      )
    `)

    // Même garde que `contact_id` : un décideur d'un compte disparu ne doit pas
    // rester une référence morte — `ON DELETE SET NULL`, jamais `CASCADE` (le
    // besoin, lui, survit à un contact supprimé, il redevient simplement « non
    // renseigné »).
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_decision_maker_contact_id_fkey
        FOREIGN KEY (decision_maker_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_decision_maker_contact_id_fkey`,
    )
    await queryRunner.query(
      `ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_procurement_involvement_check`,
    )
    await queryRunner.query(`
      ALTER TABLE project_needs
        DROP COLUMN IF EXISTS decision_process,
        DROP COLUMN IF EXISTS decision_maker_contact_id,
        DROP COLUMN IF EXISTS procurement_involvement
    `)
  }
}
