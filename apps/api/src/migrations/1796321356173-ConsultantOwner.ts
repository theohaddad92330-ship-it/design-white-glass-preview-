import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2185.10 — LE RÉFÉRENT COMMERCIAL D'UN TALENT (`consultants.owner_user_id`).
 *
 * Décision tranchée sans Louis (brief nuit 26/09) : le commentaire de
 * `1795200000001-ConsultantManager` nommait déjà ce champ en creux (« le
 * référent commercial… c'est `owner_id` ») sans que la colonne existe — cette
 * migration la matérialise, sous le nom `owner_user_id` pour ne pas se
 * confondre avec `manager_id` (le responsable HIÉRARCHIQUE, qui pointe vers un
 * AUTRE CONSULTANT, jamais vers un membre de l'espace).
 *
 * Vers `auth.users(id)`, PAS vers `consultants(id)` : contrairement au manager,
 * qui est souvent lui-même quelqu'un du vivier, « qui suit cette fiche côté
 * commercial » est TOUJOURS un membre de l'espace applicatif — même patron que
 * `accounts.assigned_to` (`1786958241077-AccountAssignment`).
 *
 * NULLABLE, sans backfill : `NULL` = « non attribué », un état honnête plutôt
 * qu'un propriétaire deviné du jour au lendemain sur tout le vivier existant.
 * `ON DELETE SET NULL` : le départ d'un membre libère ses fiches, il n'en
 * supprime aucune (on archive, on ne supprime pas).
 *
 * GA-11/GA-12 : la colonne (et sa contrainte SQL) arrive AVANT le code qui
 * l'écrit — service et écran suivent dans le même lot, jamais avant elle.
 *
 * ⚠️ Pas d'index : ce lot lit la colonne PAR IDENTIFIANT (résoudre un nom sur
 * une fiche ouverte), il ne FILTRE aucune liste dessus — même arbitrage que
 * `manager_id`. Un filtre par portefeuille de talents serait un chantier à
 * part, avec son propre index.
 */
export class ConsultantOwner1796321356173 implements MigrationInterface {
  public name = 'ConsultantOwner1796321356173'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS owner_user_id`)
  }
}
