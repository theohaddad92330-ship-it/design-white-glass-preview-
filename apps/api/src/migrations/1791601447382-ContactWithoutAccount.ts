import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Un contact peut exister sans entreprise — #1473.
 *
 * `contacts.account_id` était `NOT NULL`, et ce n'était pas un détail de
 * schéma : toute la lecture du produit en dépendait. Conséquence concrète, dans
 * les mots du retour : le commercial qui rencontre quelqu'un en salon, ou qui
 * reçoit une recommandation sans société, n'avait NULLE PART où le mettre. La
 * relation restait dans son téléphone.
 *
 * La création d'entreprise à la volée (#1317.1, livrée le 03/09) couvrait le
 * cas où la société est connue mais pas encore analysée. Elle ne couvre PAS
 * celui-ci : inventer une fiche « entreprise inconnue » pour satisfaire une
 * contrainte, c'est fabriquer une donnée fictive — exactement ce que le dépôt
 * s'interdit. `null` est l'état honnête, et l'écran le NOMME : « à qualifier ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Pourquoi la migration passe AVANT le code qui écrit (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Élargir une contrainte est rétro-compatible : les lignes existantes portent
 * toutes un `account_id`, et un déploiement où l'API ancienne tourne encore sur
 * le schéma neuf ne casse rien. L'inverse — du code qui écrit `null` avant que
 * la colonne l'accepte — produirait un 500 à la première saisie.
 *
 * ⚠️ L'index partiel ci-dessous n'est pas décoratif : la liste des contacts
 * filtre désormais sur « sans entreprise » (le segment « à qualifier »), et un
 * `IS NULL` sur une colonne majoritairement pleine ne se sert pas de l'index
 * ordinaire `idx_contacts_account_id`.
 */
export class ContactWithoutAccount1791601447382 implements MigrationInterface {
  public name = 'ContactWithoutAccount1791601447382'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts ALTER COLUMN account_id DROP NOT NULL`)

    // Le segment « à qualifier » de la liste des contacts. Sans index partiel,
    // il balaie toute la table pour trouver la poignée de lignes concernées.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contacts_unassigned_account
         ON contacts (workspace_id, created_at DESC)
       WHERE account_id IS NULL AND deleted_at IS NULL`,
    )

    await queryRunner.query(
      `COMMENT ON COLUMN contacts.account_id IS
       'Entreprise du contact. NULL = à qualifier (#1473) — un contact rencontré sans société connue. Toute jointure vers accounts doit être un LEFT JOIN.'`,
    )
  }

  /**
   * Le retour arrière REFUSE de mentir. Si des contacts sans entreprise
   * existent, rétablir `NOT NULL` échouerait sur eux ; les rattacher d'office à
   * un compte inventé effacerait l'information « on ne sait pas ». On les
   * ARCHIVE (`deleted_at`), ce qui est réversible et conserve la ligne — le
   * dépôt archive, il ne supprime pas.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contacts_unassigned_account`)
    await queryRunner.query(`UPDATE contacts SET deleted_at = COALESCE(deleted_at, now()) WHERE account_id IS NULL`)
    await queryRunner.query(`DELETE FROM contacts WHERE account_id IS NULL`)
    await queryRunner.query(`ALTER TABLE contacts ALTER COLUMN account_id SET NOT NULL`)
  }
}
