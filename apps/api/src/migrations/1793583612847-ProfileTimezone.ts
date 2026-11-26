import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `profiles.timezone` — LE FUSEAU D'UNE PERSONNE (décision Louis, 14/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/ia/app/prompts/current_time.py` fixait `Europe/Paris` en dur, et son
 * unique appelant de production (`apps/ia/app/routers/chat.py`) ajoute ce bloc
 * en queue du prompt système à CHAQUE tour de `/chat`. Quand quelqu'un écrit
 * « relance-la demain à 9 h », c'est le MODÈLE qui résout « demain » contre la
 * date lue dans ce bloc : un utilisateur à Montréal ou à Singapour obtenait un
 * rappel calculé sur le jour calendaire de Paris — un jour entier d'écart
 * possible autour de minuit.
 *
 * Aucune entité de profil ne portait de fuseau. Seuls les abonnements de
 * routines en avaient un (`routine_subscriptions.time_zone`, défaut
 * `Europe/Paris`), et le service IA ne le lit pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AJOUT SEULEMENT, ET NULLABLE — CE QUE ÇA ACHÈTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un `DEFAULT 'Europe/Paris'` aurait été une réponse tentante et fausse : il
 * aurait rendu INDISCERNABLE « cette personne a choisi Paris » de « personne
 * n'a jamais rien choisi », donc impossible de proposer un fuseau détecté sans
 * écraser un choix humain. `NULL` = INCONNU, et inconnu vaut le fuseau de
 * RÉFÉRENCE nommé du produit (`REFERENCE_TIMEZONE`, service IA) — jamais UTC,
 * jamais une devinette. Tout compte existant garde donc, au bit près, le
 * comportement d'avant ce lot.
 *
 * Aucune contrainte SQL sur la VALEUR : la liste des fuseaux IANA périme (un
 * fuseau est renommé, un pays change de règle), et une contrainte figée aurait
 * fini par refuser un fuseau réel — sans moyen de la corriger sans migration.
 * La porte est `updateProfileSchema` (`packages/contracts`), qui interroge la
 * base de fuseaux de la plate-forme via `Intl`. `varchar(64)` borne la taille :
 * le plus long nom IANA connu tient largement dessous.
 */
export class ProfileTimezone1793583612847 implements MigrationInterface {
  public name = 'ProfileTimezone1793583612847'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone varchar(64) NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles DROP COLUMN IF EXISTS timezone`)
  }
}
