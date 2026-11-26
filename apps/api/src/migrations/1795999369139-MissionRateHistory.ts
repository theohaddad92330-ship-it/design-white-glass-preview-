import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2407.10 / #2417.7 — LE NO-GO : « AUCUN TARIF HISTORIQUE MODIFIÉ RÉTROACTIVEMENT ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `DeliveryService.updateMission` écrasait `missions.daily_rate` en place, sans
 * trace. `RevenueService.produced()` (le CA « ce qui a été produit », jours
 * déclarés × TJM) joint les relevés d'activité PASSÉS au TJM COURANT de la
 * mission : un changement de TJM aujourd'hui réécrivait silencieusement le CA
 * produit de tous les mois déjà clos — exactement le NO-GO nommé par #2417
 * (« aucun tarif historique ne doit être modifié rétroactivement ») et par le
 * NO-GO de #2407 (« modifier… le TJM écrase l'historique financier déjà
 * produit »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA TABLE PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une fenêtre fermée par ligne : le TJM qui était en vigueur de `effective_from`
 * (inclus) à `effective_to` (exclu). `RevenueService.produced()` choisit, pour
 * chaque mois de relevé, la ligne dont la fenêtre couvre ce mois — et retombe
 * sur `missions.daily_rate` (la valeur COURANTE) quand aucune fenêtre ne le
 * couvre, ce qui est le cas de TOUTE mission qui n'a encore jamais changé de
 * TJM : comportement byte-identique à avant pour elles.
 *
 * `effective_from <= effective_to` (jamais `<` strict) : deux changements de
 * TJM le même jour ferment et ouvrent une fenêtre à la même date, et l'exiger
 * strictement aurait refusé le second changement du jour.
 */
export class MissionRateHistory1795999369139 implements MigrationInterface {
  public name = 'MissionRateHistory1795999369139'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_rate_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        daily_rate numeric NOT NULL,
        effective_from date NOT NULL,
        effective_to date NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_rate_history_window_check CHECK (effective_from <= effective_to)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS mission_rate_history_mission_idx
        ON mission_rate_history (mission_id, effective_from DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_rate_history`)
  }
}
