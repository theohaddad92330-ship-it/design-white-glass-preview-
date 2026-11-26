import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1681.4 — sépare le flux COMPORTEMENTAL du flux d'AUDIT sur `product_events`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `product_events` sert déjà deux usages incompatibles : un journal d'AUDIT
 * d'espace (`member_removed`, `portfolio_handed_over`…), qui DOIT nommer son
 * acteur, et — depuis #1682 — un flux COMPORTEMENTAL (`screen_viewed`,
 * `filter_applied`…) que la doctrine (`c64_analytique_produit`, règle 4)
 * interdit d'attribuer à une personne : « l'identifiant est un hash de
 * SESSION, jamais d'utilisateur ». Or `user_id uuid NOT NULL` et
 * `ProductAnalyticsService.track()` refusaient déjà d'écrire sans lui.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT — AJOUT SEULEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ÉLARGIT une contrainte (retire un `NOT NULL`), exactement le sens dans
 * lequel une contrainte a le droit de bouger avant le code qui écrit la
 * nouvelle valeur (GA-11/GA-12, et le même geste que `ContactWithoutAccount`,
 * 1791601447382, sur `contacts.account_id`) : aucune ligne existante ne perd
 * quoi que ce soit, un déploiement où l'ancienne API tourne encore sur ce
 * schéma ne casse rien, et le nouveau chemin d'écriture
 * (`ProductAnalyticsService.trackBehavioral()`) ne peut écrire qu'APRÈS que
 * cette migration soit passée.
 *
 * Elle ne crée AUCUNE colonne : `session_id` existait déjà (libre, nullable) et
 * n'avait ni écrivain ni lecteur — c'est elle qui porte désormais le hash de
 * session tourné (`hashBehavioralSession()`, `@bellum/contracts`) plutôt qu'un
 * nouveau champ à côté. Le seul ajout matériel est un index, nécessaire pour
 * compter des SESSIONS DISTINCTES sans balayer toute la table.
 */
export class ProductEventsBehavioral1789104731562 implements MigrationInterface {
  public name = 'ProductEventsBehavioral1789104731562'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE product_events ALTER COLUMN user_id DROP NOT NULL`)

    await queryRunner.query(
      `COMMENT ON COLUMN product_events.user_id IS
       'Acteur d’un événement d’AUDIT (member_removed, portfolio_handed_over…) — jamais NULL sur ce flux. NULL sur un événement COMPORTEMENTAL (#1681.4) : ce flux ne porte aucun identifiant de personne, par doctrine (c64_analytique_produit, règle 4).'`,
    )

    await queryRunner.query(
      `COMMENT ON COLUMN product_events.session_id IS
       'NULL sur un événement d’AUDIT (corrélé par user_id). Sur un événement COMPORTEMENTAL (#1681.4), le hash de session TOURNÉ (hashBehavioralSession(), @bellum/contracts) — jamais le germe brut, jamais un identifiant d’utilisateur.'`,
    )

    // Compter des sessions DISTINCTES par écran/fonction/parcours (règle 1 de la
    // doctrine, MIN_DISTINCT_SESSIONS_FOR_A_METRIC) suppose de lire session_id
    // sans balayer toute la table — le même besoin que l'index déjà posé sur
    // (event_name, occurred_at) pour la lecture par type d'événement.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS product_events_session_occurred_idx
       ON product_events (session_id, occurred_at DESC)`,
    )
  }

  /**
   * Le retour arrière ne ment pas : des lignes COMPORTEMENTALES (`user_id IS
   * NULL`) ne peuvent pas rétroactivement porter un acteur qu'elles n'ont
   * jamais eu. Comme `ContactWithoutAccount` (1791601447382), on les retire —
   * une télémétrie perdue au retour arrière, jamais un acteur inventé — avant
   * de rétablir la contrainte.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS product_events_session_occurred_idx`)
    await queryRunner.query(`DELETE FROM product_events WHERE user_id IS NULL`)
    await queryRunner.query(`ALTER TABLE product_events ALTER COLUMN user_id SET NOT NULL`)
  }
}
