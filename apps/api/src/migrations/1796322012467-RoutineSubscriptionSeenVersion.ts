import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2916 (#2399.6) — LE DÉCLENCHEUR qui fait avancer le versioning, fondation.
 *
 * `RoutineDefinition.version` (posé au lot précédent) n'avait qu'un lecteur :
 * un humain en revue de code. Rien ne distinguait, pour un utilisateur DÉJÀ
 * abonné, « je connais la version actuelle » de « la routine a changé depuis
 * la dernière fois que j'ai réglé cet écran » — le versioning existait dans le
 * catalogue, jamais dans l'abonnement qu'il est censé protéger.
 *
 * `seen_version` porte la version que CE compte a vue en dernier sur CETTE
 * routine. Colonne ADDITIVE, `NOT NULL DEFAULT 1` : toutes les définitions du
 * catalogue sont encore à la version 1 aujourd'hui (aucun contenu versionné
 * n'a réellement changé), donc `1` est la valeur VRAIE pour chaque ligne
 * existante — pas une valeur de remplissage. Une routine dont le contenu
 * change fera avancer `RoutineDefinition.version` sans toucher aux lignes
 * déjà posées : leur `seen_version` resterait alors EN RETARD, ce qui est
 * exactement ce que #2399.7 (ancienne/nouvelle version, différences) a besoin
 * de lire pour distinguer un abonnement à jour d'un abonnement périmé.
 */
export class RoutineSubscriptionSeenVersion1796322012467 implements MigrationInterface {
  name = 'RoutineSubscriptionSeenVersion1796322012467'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE routine_subscriptions ADD COLUMN IF NOT EXISTS seen_version integer NOT NULL DEFAULT 1;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE routine_subscriptions DROP COLUMN IF EXISTS seen_version;
    `)
  }
}
