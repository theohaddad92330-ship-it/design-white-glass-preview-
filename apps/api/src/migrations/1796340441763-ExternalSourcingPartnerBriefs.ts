import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2818 (lot T4) — CIRCUIT PARTENAIRE : le brief se PRÉPARE, il ne s'envoie
 * jamais (doctrine — voir le docblock de `external-sourcing.ts`,
 * `@bellum/contracts`, section « CIRCUIT PARTENAIRE »).
 *
 * Une seule table, ajout seulement. `partner_name` est un texte LIBRE — comme
 * `consultants.source` — parce qu'aucun répertoire de partenaires n'existe
 * dans le produit (vérifié sur trois angles différents les 26-27/09/2026,
 * commentaires #2818) : `account_partners` est un domaine DIFFÉRENT (le
 * paysage concurrentiel observé sur un compte CLIENT), pas un répertoire de
 * partenaires de sourcing. En inventer un ici serait deviner une structure que
 * le produit n'a pas tranchée.
 *
 * `prepared_at` existe, `sent_at` n'existe pas et n'existera pas ici : ce
 * fichier FERME la question « envoyé » pour cette table — un « fait » ne porte
 * jamais de preuve d'envoi (doctrine, Louis 21/09/2026).
 *
 * `feedback` est NULL tant que personne ne l'a saisi — jamais une chaîne vide,
 * qui se lirait comme un retour recueilli. GA-11/GA-12 : cette table n'a
 * aucune colonne à énumération fermée, donc aucune contrainte CHECK à faire
 * grandir plus tard.
 */
export class ExternalSourcingPartnerBriefs1796340441763 implements MigrationInterface {
  name = 'ExternalSourcingPartnerBriefs1796340441763'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS external_sourcing_partner_briefs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        need_id uuid NOT NULL REFERENCES project_needs(id) ON DELETE CASCADE,
        partner_name text NOT NULL,
        message text NOT NULL,
        conditions text NULL,
        delay text NULL,
        feedback text NULL,
        prepared_by uuid NOT NULL,
        prepared_at timestamptz NOT NULL DEFAULT now(),
        feedback_recorded_at timestamptz NULL
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS external_sourcing_partner_briefs_workspace_idx ON external_sourcing_partner_briefs (workspace_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS external_sourcing_partner_briefs_need_idx ON external_sourcing_partner_briefs (need_id)`,
    )
    await queryRunner.query(`ALTER TABLE external_sourcing_partner_briefs ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS external_sourcing_partner_briefs`)
  }
}
