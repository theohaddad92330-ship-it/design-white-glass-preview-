import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * BEL-SC-243 — REX PERTE & apprentissage contrôlé (#3272).
 *
 * Deux tables, deux gestes distincts :
 *
 *  - `lost_deal_rex` : le retour d'expérience d'UNE opportunité perdue,
 *    bloquée ou classée no-go — rempli par un humain, jamais calculé.
 *    `project_id` n'est pas UNIQUE (contrairement à `rex_entries.mission_id`) :
 *    une opportunité peut être rouverte puis reperdue, et chaque perte mérite
 *    son propre REX plutôt qu'un écrasement du précédent (doctrine : on
 *    archive, on ne supprime pas).
 *  - `lost_deal_rule_proposals` : la SEULE porte vers une règle générale
 *    (voir `lost-deal-rule-proposal.ts`, @bellum/contracts). `status` reste
 *    `'pending'` par défaut en base — une ligne créée sans décision explicite
 *    ne peut pas naître `'adopted'`.
 */
export class LostDealRex1796374203141 implements MigrationInterface {
  name = 'LostDealRex1796374203141'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lost_deal_rex (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id           uuid NOT NULL,
        project_id             uuid NOT NULL,
        account_id             uuid REFERENCES accounts(id) ON DELETE SET NULL,
        perimeter              text,
        need                   text,
        people_involved        text,
        real_decider           text,
        sponsor                text,
        route_used             text,
        proof_used             text,
        angle_tried            text,
        angles_not_tried       text[] NOT NULL DEFAULT '{}',
        last_action            text,
        last_action_distinction        text,
        declared_motif         text,
        declared_motif_note            text,
        declared_motif_distinction     text,
        suspected_motif        text,
        suspected_motif_note           text,
        suspected_motif_distinction    text,
        competitor              text,
        timing                  text,
        cycle_days               integer,
        procurement_friction      text,
        consultant_gap            text,
        economics                 text,
        what_team_knows_now              text,
        what_team_knows_now_distinction  text,
        revisit_on                text,
        reuse_targets              text[] NOT NULL DEFAULT '{}',
        created_by                 uuid,
        created_at                 timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT lost_deal_rex_declared_motif_check
          CHECK (declared_motif IS NULL OR declared_motif IN (
            'timing','budget','concurrence','panel','sponsor_absent','mauvaise_personne',
            'mauvais_besoin','proposition','prix','consultant','delivery',
            'decision_interne','aucune_decision','inconnu'
          )),
        CONSTRAINT lost_deal_rex_suspected_motif_check
          CHECK (suspected_motif IS NULL OR suspected_motif IN (
            'timing','budget','concurrence','panel','sponsor_absent','mauvaise_personne',
            'mauvais_besoin','proposition','prix','consultant','delivery',
            'decision_interne','aucune_decision','inconnu'
          )),
        CONSTRAINT lost_deal_rex_last_action_distinction_check
          CHECK (last_action_distinction IS NULL OR last_action_distinction IN
            ('fait_confirme','retour_client','interpretation_commerciale','hypothese','inconnu')),
        CONSTRAINT lost_deal_rex_declared_motif_distinction_check
          CHECK (declared_motif_distinction IS NULL OR declared_motif_distinction IN
            ('fait_confirme','retour_client','interpretation_commerciale','hypothese','inconnu')),
        CONSTRAINT lost_deal_rex_suspected_motif_distinction_check
          CHECK (suspected_motif_distinction IS NULL OR suspected_motif_distinction IN
            ('fait_confirme','retour_client','interpretation_commerciale','hypothese','inconnu')),
        CONSTRAINT lost_deal_rex_what_team_knows_now_distinction_check
          CHECK (what_team_knows_now_distinction IS NULL OR what_team_knows_now_distinction IN
            ('fait_confirme','retour_client','interpretation_commerciale','hypothese','inconnu'))
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS lost_deal_rex_workspace_idx ON lost_deal_rex (workspace_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS lost_deal_rex_project_idx ON lost_deal_rex (project_id)`)
    await queryRunner.query(`ALTER TABLE lost_deal_rex ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS lost_deal_rule_proposals (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id        uuid NOT NULL,
        domain               text NOT NULL,
        convergent_rex_ids    uuid[] NOT NULL,
        observation           text NOT NULL,
        status                text NOT NULL DEFAULT 'pending',
        proposed_by            uuid,
        decided_by              uuid,
        decided_at               timestamptz,
        created_at                timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT lost_deal_rule_proposals_status_check CHECK (status IN ('pending','adopted','rejected')),
        -- « Plusieurs cas convergents » (NO-GO, #3272.7) : imposé jusqu'en base,
        -- pas seulement au schéma applicatif.
        CONSTRAINT lost_deal_rule_proposals_convergence_check CHECK (array_length(convergent_rex_ids, 1) >= 2)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS lost_deal_rule_proposals_workspace_idx ON lost_deal_rule_proposals (workspace_id)`,
    )
    await queryRunner.query(`ALTER TABLE lost_deal_rule_proposals ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS lost_deal_rule_proposals`)
    await queryRunner.query(`DROP TABLE IF EXISTS lost_deal_rex`)
  }
}
