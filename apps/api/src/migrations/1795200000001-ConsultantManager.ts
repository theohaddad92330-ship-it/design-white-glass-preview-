import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE MANAGER D'UN CONSULTANT (`consultants.manager_id`) — décision de Louis du
 * 16/09/2026, #2195.12.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUELLE QUESTION CETTE COLONNE TRANCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Manager » a deux sens dans le métier ESN et ils ne se lisent pas au même
 * endroit : le responsable HIÉRARCHIQUE du consultant, ou le référent de la
 * mission CÔTÉ CLIENT. La décision nomme le premier — le second est un contact,
 * il a sa fiche ; et le référent COMMERCIAL, lui, est déjà `owner_id`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE PART SEULE, ET DEVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-11 et GA-12 : une valeur qui voyage du code vers la base voit sa contrainte
 * SQL élargie AVANT le code qui l'écrit. La colonne arrive donc dans ce commit ;
 * le service qui l'écrit et l'écran qui la saisit arrivent dans les suivants.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VERS `consultants(id)`, ET PAS VERS UN MEMBRE DE L'ESPACE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un manager d'ESN est lui-même une personne du vivier — il a un nom, un
 * métier, souvent des missions. `profiles.user_id` aurait restreint la réponse
 * aux seuls détenteurs d'un compte applicatif, c'est-à-dire aurait rendu la
 * colonne insaisissable pour la moitié des cas réels.
 *
 * `ON DELETE SET NULL` : la suppression d'un manager rend ses équipes « non
 * renseignées », elle ne supprime personne et n'invente aucun repli. C'est la
 * même règle que partout ici — « non renseigné » n'est pas « zéro », et surtout
 * pas un nom deviné.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NULLABLE, ET DEUX REFUS ÉCRITS EN SQL
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun défaut : `NULL` veut dire « personne ne l'a renseigné », et l'écran le
 * dit ainsi. Jamais un nom dérivé de la BU — `business_unit_members` donne un
 * rôle `lead` sur une unité, ce qui n'est pas le même fait, et rien ne relie
 * aujourd'hui un consultant à une BU.
 *
 * `consultants_manager_not_self` : personne n'est son propre manager. Une fiche
 * qui se désigne elle-même produirait une chaîne hiérarchique infinie à
 * l'affichage, et c'est le genre de saisie qu'un doigt fait une fois.
 *
 * ⚠️ Pas d'index : aucune requête serveur ne FILTRE sur cette colonne — elle est
 * lue par identifiant pour résoudre un nom. Un index coûterait une écriture de
 * plus à chaque mise à jour de fiche sans servir une seule lecture.
 */
export class ConsultantManager1795200000001 implements MigrationInterface {
  public name = 'ConsultantManager1795200000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS manager_id uuid
    `)
    await queryRunner.query(`
      ALTER TABLE consultants
        DROP CONSTRAINT IF EXISTS consultants_manager_id_fkey
    `)
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD CONSTRAINT consultants_manager_id_fkey
        FOREIGN KEY (manager_id) REFERENCES consultants(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      ALTER TABLE consultants
        DROP CONSTRAINT IF EXISTS consultants_manager_not_self
    `)
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD CONSTRAINT consultants_manager_not_self CHECK (
          manager_id IS NULL OR manager_id <> id
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_manager_not_self`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_manager_id_fkey`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS manager_id`)
  }
}
