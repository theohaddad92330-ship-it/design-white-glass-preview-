import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1622 — `market_memory_ground_truth_judgments` : LE JUGEMENT HUMAIN sur ce
 * que la mémoire marché affirme d'un couple ESN ↔ compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'écrit AUCUNE ligne. Pas un jugement d'exemple « pour montrer », pas un
 * cas fabriqué par un agent : la doctrine « jamais de donnée fictive » couvre
 * ce lot exactement comme les autres, et c'est le seul endroit du lot où elle
 * pourrait sembler négociable. Table vide ⇒ les six métriques rendent
 * `insufficient_data` avec un dénominateur de zéro, jamais un pourcentage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CHOIX DE SCHÉMA
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **AJOUT SEULEMENT.** Un jugement révisé insère une ligne de plus au lieu
 *    d'un `UPDATE` — « on archive, on ne supprime pas ». `case_key` n'est donc
 *    PAS unique : deux lignes peuvent légitimement le partager.
 * 2. **La contrainte `CHECK` sur `label` porte les SIX valeurs de
 *    `MARKET_MEMORY_GROUND_TRUTH_LABELS` (`@bellum/contracts`), dans le MÊME
 *    ordre.** GA-08 : un enum qui voyage vers SQL n'insère jamais de valeur au
 *    milieu ni n'en retire — toute septième valeur future s'AJOUTE en bout de
 *    liste, ici et dans le contrat, dans le même commit, contrainte élargie
 *    AVANT le code qui écrirait la nouvelle valeur (GA-11/GA-12).
 * 3. **Aucun `workspace_id`.** Un jugement sur la qualité du corpus PARTAGÉ de
 *    mémoire marché n'appartient à aucun espace, comme les cinq tables
 *    `market_*` elles-mêmes (GA-16).
 * 4. **Aucune clé étrangère.** Cette table ne référence aucune des cinq tables
 *    `market_*` : elle porte un SNAPSHOT de ce que l'opérateur a vu au moment
 *    de juger (`had_reading` / `reading_rank` / `reading_persons` /
 *    `reading_certainty`), pas une jointure live qui changerait de valeur si
 *    le corpus est réimporté demain.
 * 5. **`(case_key, judged_at DESC)` en index composite** — c'est la requête
 *    « le jugement le plus récent par cas » (`DISTINCT ON` côté service) qui la
 *    consomme, la seule lecture répétée de cette table.
 */
export class MarketMemoryGroundTruth1791950000000 implements MigrationInterface {
  public name = 'MarketMemoryGroundTruth1791950000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_memory_ground_truth_judgments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        case_key text NOT NULL,
        account_name text NOT NULL,
        account_website text NULL,
        account_country text NULL,
        esn_name text NOT NULL,
        had_reading boolean NOT NULL,
        reading_rank integer NULL,
        reading_persons integer NULL,
        reading_certainty text NULL,
        label text NOT NULL,
        judged_by text NOT NULL,
        judged_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_market_memory_ground_truth_label CHECK (
          label IN ('useful_and_correct', 'plausible', 'misleading', 'wrong_entity', 'irrelevant', 'unknown')
        ),
        CONSTRAINT chk_market_memory_ground_truth_certainty CHECK (
          reading_certainty IS NULL OR reading_certainty IN ('forte', 'moyenne', 'faible')
        ),
        CONSTRAINT chk_market_memory_ground_truth_rank CHECK (
          (had_reading = false AND reading_rank IS NULL) OR (had_reading = true AND reading_rank >= 1)
        )
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_memory_ground_truth_case_key ON market_memory_ground_truth_judgments (case_key, judged_at DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_memory_ground_truth_judgments`)
  }
}
