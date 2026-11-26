import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1960.13 — UN INCIDENT SE DÉCLARE, IL NE SE DEVINE PAS.
 *
 * Décision de Louis du 16/09/2026 : « incident connu » n'apparaît que si un
 * OPÉRATEUR a posé un drapeau dans le back-office. Explicitement refusé :
 * déduire l'incident d'un taux d'erreur ou d'un 5xx. Une panne isolée chez un
 * client n'est pas un incident connu, et **annoncer un incident qui n'existe
 * pas coûte plus cher qu'un refus nu** — l'utilisateur cesse de signaler,
 * croyant qu'on sait déjà.
 *
 * Le drapeau n'invente pas de mécanisme : il ÉTEND celui qui existe (GA-26,
 * un réglage vit à un seul endroit). Les bannières sont déjà écrites par
 * l'opérateur (`POST /internal/admin/banners`, `InternalSecretGuard`), déjà
 * planifiables, déjà bilingues, déjà lues en direct par l'app
 * (`GET /banners?placement=app`). Il leur manquait un `kind` qui dise « ceci
 * est un incident EN COURS », par opposition à `maintenance`, qui est une
 * interruption PRÉVUE — un utilisateur bloqué maintenant ne lit pas la même
 * chose dans les deux cas.
 *
 * ⚠️ GA-11 / GA-12 — la contrainte SQL s'élargit AVANT le code qui écrit la
 * valeur : cette migration passe, puis `bannerKindValues` accepte `incident`.
 * ⚠️ GA-08 — la valeur est AJOUTÉE EN FIN de liste, aucune n'est retirée ni
 * insérée au milieu.
 *
 * Sans drapeau posé, rien ne change d'un octet : aucune ligne `banners` ne
 * porte `kind = 'incident'` au moment où cette migration passe.
 */
export class BannerIncidentKind1795099184073 implements MigrationInterface {
  public name = 'BannerIncidentKind1795099184073'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La contrainte est anonyme dans `BannersTable1786100000000` (`CHECK (…)`
    // en ligne), donc Postgres l'a nommée `banners_kind_check`. On la retire
    // par ce nom, `IF EXISTS` pour rester rejouable, puis on la repose élargie
    // avec un nom EXPLICITE — la prochaine à l'élargir n'aura plus à deviner.
    await queryRunner.query(`ALTER TABLE banners DROP CONSTRAINT IF EXISTS banners_kind_check`)
    await queryRunner.query(`ALTER TABLE banners DROP CONSTRAINT IF EXISTS chk_banners_kind`)
    await queryRunner.query(`
      ALTER TABLE banners
        ADD CONSTRAINT chk_banners_kind
        CHECK (kind IN ('announcement', 'maintenance', 'offer', 'incident'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Le retour arrière RÉTRÉCIT la contrainte : il échouerait sur une ligne
    // `incident` existante, et c'est voulu — perdre en silence un incident
    // déclaré serait pire qu'une migration qui refuse de tourner.
    await queryRunner.query(`ALTER TABLE banners DROP CONSTRAINT IF EXISTS chk_banners_kind`)
    await queryRunner.query(`
      ALTER TABLE banners
        ADD CONSTRAINT banners_kind_check
        CHECK (kind IN ('announcement', 'maintenance', 'offer'))
    `)
  }
}
