import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les chiffres de BELLUM : instantanés mensuels de MRR et trésorerie saisie
 * (#1645, #1649).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TROIS TABLES NE SONT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles ne portent AUCUNE donnée de client. Le MRR, le churn, le burn et le
 * runway qu'on y range sont ceux de BellumAI, pas ceux du métier des ESN qui
 * l'utilisent — c'est précisément le constat de #1645 : « ces mots existent
 * dans le code uniquement pour le métier des clients ». Elles sont donc hors
 * périmètre d'espace, déclarées comme telles au registre des portées
 * (`packages/contracts/src/schemas/table-scopes.ts`, GA-16 / GA-65), et lues
 * par la seule porte opérateur (`internal/admin/*`, `InternalSecretGuard`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES INSTANTANÉS, ET POURQUOI DES LIGNES SOUS EUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Un client qui change d'offre le 15 modifie rétroactivement le MRR de tous les
 * mois passés si on recalcule. L'instantané fige ce qui était vrai ce mois-là.
 *
 * Mais un total figé ne suffit pas à décomposer le mois SUIVANT : « nouveau » et
 * « expansion » ne se distinguent qu'en sachant qui payait quoi. D'où
 * `business_metric_snapshot_lines`, une ligne par abonné payant et par mois.
 * Sans elle, la décomposition serait devinée — et deviner « expansion » là où il
 * y a eu un départ suivi d'une arrivée raconterait la mauvaise histoire.
 *
 * ⚠️ Les mouvements sont NULLABLES et le restent. Le premier mois de la série
 * n'a pas de mois précédent : son `mrr_start_cents` vaut NULL, et « nous
 * n'avions rien mesuré » n'est pas « nous avions zéro euro ». Un `DEFAULT 0`
 * ici transformerait pour toujours une absence en fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA TRÉSORERIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre montants saisis, tous NULLABLES : un mois non saisi produit « non
 * mesuré » partout, jamais une estimation, et aucun mois n'est pré-rempli avec
 * le précédent. Le quatrième — `collected_cents` — n'est pas dans le littéral de
 * #1649 mais sa formule l'exige (« burn = fixes + variables − encaissements ») ;
 * la raison de l'ajout est écrite en tête de `treasury.ts`.
 */
export class BusinessMetrics1791820000000 implements MigrationInterface {
  public name = 'BusinessMetrics1791820000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS business_metric_snapshots (
        month text PRIMARY KEY,
        mrr_start_cents integer,
        mrr_new_cents integer,
        mrr_expansion_cents integer,
        mrr_contraction_cents integer,
        mrr_churned_cents integer,
        mrr_end_cents integer NOT NULL,
        customers_start integer,
        customers_new integer,
        customers_churned integer,
        customers_end integer NOT NULL,
        contracted_revenue_cents integer NOT NULL DEFAULT 0,
        contracted_customers integer NOT NULL DEFAULT 0,
        one_off_cents integer NOT NULL DEFAULT 0,
        one_off_customers integer NOT NULL DEFAULT 0,
        computed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT business_metric_snapshots_month_check
          CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS business_metric_snapshot_lines (
        month text NOT NULL REFERENCES business_metric_snapshots(month) ON DELETE CASCADE,
        subject_id uuid NOT NULL,
        mrr_cents integer NOT NULL,
        PRIMARY KEY (month, subject_id),
        CONSTRAINT business_metric_snapshot_lines_positive_check CHECK (mrr_cents > 0)
      )
    `)

    // La seule lecture chaude : « les lignes du mois précédent », pour décomposer
    // le mois courant. La clé primaire la sert déjà par son préfixe.

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS business_treasury_months (
        month text PRIMARY KEY,
        bank_balance_cents integer,
        fixed_expenses_cents integer,
        variable_expenses_cents integer,
        collected_cents integer,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text,
        CONSTRAINT business_treasury_months_month_check
          CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
      )
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
