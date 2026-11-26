import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le report des crédits non consommés — 30 jours (grille du 16/08).
 *
 * La carte de tarifs l'annonce : « crédits non utilisés reportables sur
 * 30 jours ». Jusqu'ici le renouvellement mensuel remettait simplement le
 * compteur à zéro, et le reliquat disparaissait sans que rien ne le dise.
 *
 * Deux colonnes, et pas une table de poches : le cycle est mensuel et le report
 * dure 30 jours, donc il n'y a JAMAIS plus d'une réserve vivante à la fois. Une
 * table aurait imposé de choisir dans quel ordre vider plusieurs poches — un
 * choix qui ne se pose pas.
 *
 * `rollover_credits` s'ajoute au plafond du cycle tant que `rollover_expires_at`
 * est dans le futur, exactement comme `topup_analyses`. C'est ce qui rend la
 * mécanique sûre : aucune ligne de consommation n'a besoin de savoir dans quel
 * ordre puiser, et rien ne peut devenir négatif.
 */
export class CreditRollover1789400000002 implements MigrationInterface {
  public name = 'CreditRollover1789400000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS rollover_credits integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS rollover_expires_at timestamptz`)
    // Aucun rattrapage sur l'existant : reporter rétroactivement un reliquat que
    // personne n'a mesuré reviendrait à créditer des crédits inventés. Le report
    // commence au prochain renouvellement, et c'est vrai pour tout le monde.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS rollover_expires_at`)
    await queryRunner.query(`ALTER TABLE subscriptions DROP COLUMN IF EXISTS rollover_credits`)
  }
}
