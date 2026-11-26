import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les volumes de la grille pondérée (recette finale §9-11 — P0-03).
 *
 * Depuis que la grille est en base (`plan_definitions`), changer les défauts
 * embarqués ne change RIEN en production : le catalogue live fait foi partout.
 * Une prod déjà seedée garderait donc l'ancienne grille — et facturerait
 * 8 crédits une analyse en n'en donnant que 35 par mois à un Starter, soit
 * quatre analyses au lieu des vingt annoncées. C'est le seul endroit où l'oubli
 * d'une migration se paie en promesse commerciale non tenue.
 *
 * **Chaque UPDATE est conditionné à la valeur PRÉCÉDENTE.** Un opérateur qui a
 * accordé un volume sur mesure (geste commercial, litige, partenaire) a fait un
 * choix plus récent que cette migration : il sort intact. La même règle que la
 * migration des prix de siège du 26/07.
 *
 * Ce que la migration ne fait PAS : toucher aux soldes en cours
 * (`subscriptions.accounts_limit`). Le renouvellement mensuel applique déjà
 * `GREATEST(accounts_limit, nominal)`, donc chaque client montera au nouveau
 * nominal à son prochain cycle sans jamais redescendre. Réécrire les soldes ici
 * remettrait à zéro des compteurs en cours de cycle.
 */
export class WeightedCreditGrid1788600000002 implements MigrationInterface {
  name = 'WeightedCreditGrid1788600000002'

  /** `[clé, volume précédent, nouveau volume]`. Le volume précédent est la
   *  condition : il garantit qu'on ne touche que les lignes restées au nominal. */
  private static readonly VOLUMES: readonly [string, number, number][] = [
    ['trial', 115, 120],
    ['starter', 35, 160],
    ['team', 150, 600],
    ['growth', 420, 1600],
    ['beta', 60, 600],
    ['decouverte', 6, 48],
  ]

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, previous, next] of WeightedCreditGrid1788600000002.VOLUMES) {
      await queryRunner.query(
        `UPDATE plan_definitions
            SET accounts_limit = $3, updated_at = NOW()
          WHERE key = $1 AND accounts_limit = $2`,
        [key, previous, next],
      )
    }

    // L'offre Bêta Design Partner (§11) : 119 € HT par licence et par mois.
    // L'ancien palier « Beta » à 59 € était un reliquat sans promesse écrite ;
    // celui-ci est une offre nommée, vendue trois mois, dont les quotas
    // s'ajustent au back-office.
    await queryRunner.query(
      `UPDATE plan_definitions
          SET label = 'Bêta Design Partner', price_cents = 11900, updated_at = NOW()
        WHERE key = 'beta' AND price_cents = 5900`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE plan_definitions
          SET label = 'Beta', price_cents = 5900, updated_at = NOW()
        WHERE key = 'beta' AND price_cents = 11900`,
    )
    for (const [key, previous, next] of WeightedCreditGrid1788600000002.VOLUMES) {
      await queryRunner.query(
        `UPDATE plan_definitions
            SET accounts_limit = $2, updated_at = NOW()
          WHERE key = $1 AND accounts_limit = $3`,
        [key, previous, next],
      )
    }
  }
}
