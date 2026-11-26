import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La portée de réutilisation d'un retour bêta (addendum Stelya §20, D-ST-07).
 *
 * Le souhait de Ludovic est explicite : « ses réponses ne doivent pas devenir un
 * avantage direct pour ses concurrents ». Or un retour bêta détaillé décrit une
 * stratégie — des zones, des seuils, des cibles, un lexique — c'est-à-dire
 * exactement ce qui distingue une entreprise de ses concurrents.
 *
 * `tenant_private` par DÉFAUT, et c'est la seule valeur par défaut acceptable :
 * un retour se réutilise sur décision, jamais par omission. `generalized_only`
 * n'autorise que le MOTIF anonymisé (« le secteur appartient à la mission »),
 * jamais la valeur qui l'a inspiré.
 *
 * La colonne ne fait rien à elle seule — elle DÉCLARE. Ce qui la rend utile est
 * qu'elle est écrite dans l'issue ouverte pour ce retour : la personne qui la
 * lit sait, sans avoir à demander, ce qu'elle a le droit d'en faire.
 */
export class FeedbackReuseScope1790024118503 implements MigrationInterface {
  name = 'FeedbackReuseScope1790024118503'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS reuse_scope text NOT NULL DEFAULT 'tenant_private'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE beta_feedback DROP COLUMN IF EXISTS reuse_scope`)
  }
}
