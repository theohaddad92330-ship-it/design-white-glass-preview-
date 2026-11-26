import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `contact_stops` — « cette personne a demandé qu'on cesse ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE, ET PAS UNE COLONNE SUR `contacts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Un arrêt est un FAIT DATÉ, prononcé par quelqu'un, pour une raison. Une
 * colonne booléenne perdrait les trois : qui l'a posé, quand, et pourquoi. Or
 * c'est exactement ce qu'il faut pouvoir montrer le jour où la personne demande
 * ce qu'on sait d'elle. On archive, on ne remplace pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE (T-169, mesuré le 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt savait DÉCRIRE un refus — `WORKFLOW_OUTCOME_CATALOG` porte
 * `do_not_call` comme condition d'arrêt de la motion d'appel à froid — et
 * `outcomeStopsMotion` savait le reconnaître. Aucune ligne de production ne
 * l'appelait. Le seul verrou réel du produit était `email_suppressions`,
 * indexée par ADRESSE : un contact joint par téléphone, ou sans adresse, n'avait
 * aucun verrou. « Une réponse arrête tout définitivement » était du texte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE VOCABULAIRE, ET POURQUOI IL EST PLUS COURT QUE LES `stop` DU CATALOGUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois raisons viennent d'une motion (`do_not_call`, `confirmed_wrong_contact`,
 * `relationship_invalid`) et deux du transport (`unsubscribed`, `bounced`).
 * `mission_end_confirmed` et `candidate_unavailable` arrêtent une motion sans
 * rien dire de la personne : les verser ici ferait taire des relances
 * légitimes. Un arrêt inventé est aussi coûteux qu'une insistance.
 *
 * La contrainte est posée AVANT le code qui écrit ces valeurs (GA-11/GA-12), et
 * son ordre est celui de `CONTACT_STOP_REASONS` (GA-08 : un enum ne perd jamais
 * de valeur et n'en insère jamais au milieu).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DE LEVÉE, ET C'EST UNE DÉCISION
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune colonne `lifted_at` : la table est en AJOUT SEUL. Défaire un refus est
 * un geste dont le titulaire est la PERSONNE, pas nous, et le produit n'offre
 * déjà aucun moyen de retirer un désabonnement — poser une porte de levée ici
 * introduirait une asymétrie que personne n'a tranchée. Le jour où elle l'est,
 * elle arrivera avec sa migration. Décision D351.
 */
export class ContactStops1790880000122 implements MigrationInterface {
  public name = 'ContactStops1790880000122'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_stops (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        contact_id uuid NOT NULL,
        reason text NOT NULL,
        motion text,
        outcome text,
        note text,
        declared_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT contact_stops_reason_check CHECK (
          reason IN ('do_not_call', 'confirmed_wrong_contact', 'relationship_invalid', 'unsubscribed', 'bounced')
        )
      )
    `)
    // Un contact ne porte qu'UN arrêt. Le second geste est un no-op, pas une
    // seconde ligne : « ne me contactez plus » dit deux fois est le même fait.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS contact_stops_contact_unique ON contact_stops (contact_id)
    `)
    // La question posée à chaque armement : « qui est arrêté dans cet espace ? »
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contact_stops_workspace_idx ON contact_stops (workspace_id, contact_id)`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE contact_stops IS 'Refus de contact, par personne. Ajout seul — on archive, on ne supprime pas.'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contact_stops`)
  }
}
