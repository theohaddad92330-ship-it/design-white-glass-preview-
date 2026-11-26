import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA DATE QUI REND UN CONSENTEMENT DÉMONTRABLE — 15/09/2026, décision 7 de
 * Louis (les canaux d'alerte de Découvrir ouvrent l'envoi, et eux seuls).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FAIT QUI L'A RENDUE NÉCESSAIRE (mesuré le 15/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Il existe en base des lignes portant `weekly_digest = true` que personne n'a
 * jamais cochées : `changelog-newsletter.service.ts` insérait deux colonnes, et
 * Postgres remplissait le reste avec un `DEFAULT true`. La migration
 * `1792800260000-NotificationOutboundDefaultsOff` a corrigé le défaut pour les
 * lignes FUTURES et, à dessein, n'a réécrit aucune ligne existante.
 *
 * La leçon vaut pour TOUTE case qui commande un envoi : le dépôt sait dire
 * qu'elle vaut `true`, il ne sait dire ni QUAND ni COMMENT elle y est passée.
 * Brancher un émetteur là-dessus, c'est envoyer à des gens dont le consentement
 * est supposé, pas donné.
 *
 * `alert_consent_at` est la réponse, et elle tient en une phrase : **une date
 * ne s'écrit que sur le chemin d'un geste.** Un `DEFAULT` de colonne n'en pose
 * pas ; un `INSERT` partiel n'en invente pas. Le prédicat qui la lit vit à un
 * seul endroit — `isQualifiedOutboundConsent` (`@bellum/contracts`).
 *
 * Précédent repris sans le redécider : `notification_sms_channels.consent_at`,
 * écrit au moment où quelqu'un coche lui-même un type d'alerte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION NE FAIT PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne REMPLIT aucune ligne existante. Rétro-dater les vues déjà
 * enregistrées avec leur `created_at` fabriquerait exactement le consentement
 * supposé qu'on refuse — et rendrait la garde muette le jour où elle sert.
 * Les périmètres enregistrés avant ce jour n'enverront donc rien tant que leur
 * propriétaire n'aura pas re-choisi son canal ; c'est le comportement voulu,
 * et il est identique à celui d'aujourd'hui (aucun émetteur n'existait).
 *
 * Porte « ajout seulement » : une colonne, nullable, sans défaut, aucune
 * contrainte touchée (GA-11 / GA-12).
 */
export class DiscoverAlertConsentAt1794102345671 implements MigrationInterface {
  name = 'DiscoverAlertConsentAt1794102345671'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS alert_consent_at timestamptz`)
  }

  /**
   * Retirer la colonne efface des consentements datés par des gens. C'est le
   * prix assumé d'un `down`, qui ne se joue qu'à la main.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE saved_views DROP COLUMN IF EXISTS alert_consent_at`)
  }
}
