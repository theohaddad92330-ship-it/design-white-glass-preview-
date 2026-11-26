import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2411.11 (reste, épopée #2881) — l'historique de résolution PERSISTÉ d'un
 * risque de mission (« notification fermée, non reproposée sans changement
 * matériel »).
 *
 * TRANCHE MINIMALE VERTICALE (lot r7, PASSE 3) : le moteur complet à 5 axes /
 * 6 niveaux de sévérité / carte agrégée reste hors lot (#2411.1/.8/.10,
 * toujours `reste`) — mais « fermer une notification de risque et ne pas se
 * la voir reproposer sans raison » n'a besoin d'AUCUN de ces trois chantiers :
 * c'est un geste sur le risque déjà calculé par `missionRisks()`
 * (`packages/contracts/src/schemas/mission.ts`), quel que soit le nombre
 * d'axes qu'il porte aujourd'hui ou demain.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « SANS CHANGEMENT MATÉRIEL » VEUT DIRE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Un risque est PUREMENT CALCULÉ (`missionRisks`, jamais saisi) : il n'y a pas
 * de colonne « ce risque est résolu » à inverser, et fabriquer un statut à côté
 * du calcul le ferait diverger du fait le jour où la donnée sous-jacente change
 * sans que quelqu'un revienne cliquer. `mission_updated_at_snapshot` capture
 * `missions.updated_at` AU MOMENT du geste : la résolution reste valide tant
 * que la mission n'a pas été retouchée depuis (`missions.updated_at` n'a pas
 * avancé) — la lecture (`DeliveryService`) compare les deux à chaque fois,
 * jamais une donnée dupliquée qui pourrait diverger du fait qu'elle décrit.
 * Un `UPDATE` non lié au risque referme donc aussi la fenêtre — délibérément
 * conservateur : ne jamais MASQUER un risque réel plus longtemps que ce que le
 * geste humain a couvert, plutôt que de deviner quels champs sont "matériels"
 * pour un axe qui n'existe pas encore.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAR MISSION, PAS PAR PERSONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement à `reverse_market_dismissals` (#2968, masquage PAR PERSONNE
 * d'une suggestion) : un risque de mission est un fait sur LE DOSSIER, visible
 * par toute l'équipe qui y a accès — deux collègues qui liraient des pastilles
 * différentes sur la même mission referait exactement le doute que #2411 vise
 * à lever. `resolved_by` reste une trace d'AUTEUR, jamais un filtre de lecture.
 *
 * `risk` — CHECK sur l'énumération ACTUELLE de `missionRiskSchema` (9 valeurs) :
 * GA-11/GA-12, la contrainte s'élargit ici AVANT tout code qui écrirait une
 * dixième valeur.
 *
 * PK composite `(mission_id, risk)` — un second geste sur le même risque
 * rafraîchit la même ligne (`upsert`), jamais une seconde ligne. Une valeur
 * NULL sur `resolved_at` = risque actif normalement (jamais résolu, ou
 * ré-ouvert) — même convention que `reverse_market_dismissals.dismissed_at`.
 *
 * Idempotent. `down` supporté (DROP TABLE) : table neuve, sans donnée à
 * préserver avant le premier déploiement.
 */
export class MissionRiskResolutions1796321507560 implements MigrationInterface {
  name = 'MissionRiskResolutions1796321507560'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_risk_resolutions (
        workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
        mission_id uuid NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
        risk text NOT NULL,
        CONSTRAINT mission_risk_resolutions_risk_check CHECK (
          risk IN (
            'renewal_not_started',
            'timesheet_disputed',
            'timesheet_missing',
            'margin_at_risk',
            'margin_unknown',
            'no_end_date',
            'missing_po',
            'ending_soon',
            'missing_owner'
          )
        ),
        resolved_at timestamptz,
        resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
        mission_updated_at_snapshot timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (mission_id, risk)
      )
    `)

    // Sert `DeliveryService.list()` : « les risques résolus de CES missions » —
    // index PARTIEL, une ligne ré-ouverte (`resolved_at IS NULL`) n'a pas à y
    // figurer.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mission_risk_resolutions_active
        ON mission_risk_resolutions (mission_id)
        WHERE resolved_at IS NOT NULL
    `)

    await queryRunner.query(`ALTER TABLE mission_risk_resolutions ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "mission_risk_resolutions_workspace_read" ON mission_risk_resolutions`,
    )
    await queryRunner.query(`
      CREATE POLICY "mission_risk_resolutions_workspace_read" ON mission_risk_resolutions FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_risk_resolutions`)
  }
}
