import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE CONTACT CRA — celui qui valide le relevé, côté client (PDF-22 §7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le panneau de planification montre trois contacts sur une mission — le
 * consultant, le chargé d'affaires (`missions.owner_id`, existant), et celui
 * qui valide le relevé d'activité. Les deux premiers rôles avaient déjà leur
 * chemin ; le troisième n'avait AUCUNE colonne pour le porter. `billing_contact_id`
 * est un rôle voisin mais DISTINCT : à qui la facture PART n'est pas
 * nécessairement qui VALIDE le CRA — deux entreprises clientes séparent
 * couramment les deux, et confondre les deux aurait envoyé une relance de
 * relevé à quelqu'un qui n'a jamais eu ce rôle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE RÉFÉRENCE VERS `contacts`, ET NON UN CHAMP LIBRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `billing_contact_id` référence déjà `contacts` pour la même raison : la
 * personne existe déjà comme contact du compte, avec son e-mail et son
 * téléphone tenus à jour à UN seul endroit. Un champ texte libre dupliquerait
 * une identité que le produit connaît déjà, et divergerait le jour où le
 * contact change de coordonnées.
 *
 * `ON DELETE SET NULL` : supprimer un contact ne doit pas supprimer la
 * mission qui le référence — la mission redevient « contact CRA non désigné »,
 * un état honnête, jamais une ligne cassée.
 */
export class MissionCraContact1790981000001 implements MigrationInterface {
  public name = 'MissionCraContact1790981000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS cra_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_missions_cra_contact_id ON missions (cra_contact_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_missions_cra_contact_id`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS cra_contact_id`)
  }
}
