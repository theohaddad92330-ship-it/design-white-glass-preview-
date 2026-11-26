import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La portée de réutilisation descend sur la LIGNE de retour.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INVARIANT QUI N'AVAIT AUCUN PORTEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Le registre de doctrine déclare onze invariants non négociables. Dix sont
 * portés par du code. Le onzième — « le retour d'un bêta testeur ne se réutilise
 * pas tel quel chez un concurrent » — ne l'était par RIEN : ni
 * `submission_feedback` ni `account_feedback` ne portaient de champ de portée,
 * et rien n'empêchait techniquement un verbatim de client de voyager d'un espace
 * à l'autre.
 *
 * Ce n'est pas une préférence produit. Les espaces de Bellum sont des ESN, donc
 * des CONCURRENTS — la même raison qui a produit GA-43 sur le coût d'accès. Un
 * verbatim de client décrit une stratégie : des zones, des seuils, des cibles,
 * le nom d'un compte et ce qu'il a répondu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SUR LA LIGNE, ALORS QUE LE RÉGLAGE EXISTE DÉJÀ SUR L'ESPACE
 * ─────────────────────────────────────────────────────────────────────────────
 * `offer_portfolio.privacy.feedback_reuse` (addendum Stelya, migration
 * `1790024118503`) dit ce que l'espace autorise AUJOURD'HUI, pas ce qu'il
 * autorisait le jour où le retour a été écrit. Un espace qui coche
 * `generalized_only` en septembre rendrait rétroactivement réutilisable tout ce
 * qui a été dit en août : un consentement obtenu après coup.
 *
 * La ligne porte donc la TRACE de la portée du moment — même raison
 * qu'`access_facts.observed_at`, qui est la date où le fait était vrai et non
 * celle de l'écriture. Un réglage vit toujours à un seul endroit ; ce qui est
 * recopié ici n'est pas le réglage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE N'OUVRE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle POSE le verrou, elle n'ouvre aucun chemin de partage. `tenant_private`
 * par défaut sur toutes les lignes, anciennes comprises : un retour se réutilise
 * sur DÉCISION, jamais par omission — et le défaut s'applique justement à ceux
 * qui n'ont rien dit.
 *
 * La contrainte `CHECK` est posée AVANT le code qui écrit la valeur (leçon
 * `account_vocabulary.kind`, garde GA-12), et elle est NOMMÉE — les deux
 * contraintes en ligne d'`account_feedback` ne le sont pas, ce qui les rend
 * invisibles de GA-12. `beta_feedback.reuse_scope` existe depuis le 24/08 sans
 * aucune contrainte : elle la reçoit ici, sans quoi la troisième table de retour
 * accepterait n'importe quelle valeur pendant que les deux autres sont tenues.
 */
// ⚠️ Renumérotée de `…0001` à `…0002` le 27/08/2026 : elle PARTAGEAIT son
// horodatage avec `InvoiceDispute1790170000001`. TypeORM ordonne par
// l'horodatage lu dans le NOM DE CLASSE — deux migrations qui le partagent
// tombent dans un ordre décidé par la stabilité du tri, donc par l'ordre de
// lecture du disque. `migrations.spec.ts` le refuse depuis toujours et le dit :
// « Pick a fresh unique timestamp instead. » La suite API était rouge sur `main`,
// et personne ne le voyait — un merge direct ne lance aucune CI.
//
// Le renommage est SANS RISQUE en production bien qu'il change le nom enregistré
// dans `_migrations` : les deux instructions sont idempotentes (`ADD COLUMN IF
// NOT EXISTS`, et une garde explicite pour la contrainte, `ADD CONSTRAINT`
// n'ayant pas d'`IF NOT EXISTS` en Postgres). Un rejeu ne fait rien.
export class FeedbackRowReuseScope1790170000002 implements MigrationInterface {
  public name = 'FeedbackRowReuseScope1790170000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE account_feedback ADD COLUMN IF NOT EXISTS reuse_scope text NOT NULL DEFAULT 'tenant_private'`,
    )
    await queryRunner.query(
      `ALTER TABLE submission_feedback ADD COLUMN IF NOT EXISTS reuse_scope text NOT NULL DEFAULT 'tenant_private'`,
    )

    // `ADD CONSTRAINT` n'a pas d'`IF NOT EXISTS` en Postgres → garde explicite,
    // comme pour les policies RLS et `signal_history_importance_check`.
    //
    // ⚠️ Les trois instructions sont ÉCRITES, pas générées dans une boucle. Les
    // gardes du dépôt (GA-11, GA-12, GA-36) lisent ces migrations comme du
    // TEXTE : un `${table}` interpolé leur rendrait les trois contraintes
    // invisibles, et une contrainte invisible passe au vert pour toujours.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'account_feedback_reuse_scope_check'
        ) THEN
          ALTER TABLE account_feedback
            ADD CONSTRAINT account_feedback_reuse_scope_check
            CHECK (reuse_scope IN ('tenant_private', 'generalized_only'));
        END IF;
      END $$;
    `)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'submission_feedback_reuse_scope_check'
        ) THEN
          ALTER TABLE submission_feedback
            ADD CONSTRAINT submission_feedback_reuse_scope_check
            CHECK (reuse_scope IN ('tenant_private', 'generalized_only'));
        END IF;
      END $$;
    `)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'beta_feedback_reuse_scope_check'
        ) THEN
          ALTER TABLE beta_feedback
            ADD CONSTRAINT beta_feedback_reuse_scope_check
            CHECK (reuse_scope IN ('tenant_private', 'generalized_only'));
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE account_feedback DROP CONSTRAINT IF EXISTS account_feedback_reuse_scope_check`)
    await queryRunner.query(
      `ALTER TABLE submission_feedback DROP CONSTRAINT IF EXISTS submission_feedback_reuse_scope_check`,
    )
    await queryRunner.query(`ALTER TABLE beta_feedback DROP CONSTRAINT IF EXISTS beta_feedback_reuse_scope_check`)
    // `beta_feedback.reuse_scope` appartient à `1790024118503` — la retirer ici
    // défairait une autre migration.
    await queryRunner.query(`ALTER TABLE account_feedback DROP COLUMN IF EXISTS reuse_scope`)
    await queryRunner.query(`ALTER TABLE submission_feedback DROP COLUMN IF EXISTS reuse_scope`)
  }
}
