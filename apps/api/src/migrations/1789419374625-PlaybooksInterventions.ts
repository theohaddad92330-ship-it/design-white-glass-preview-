import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * PLAYBOOKS de niveau 5 et FILE D'INTERVENTION (T11).
 *
 * `playbook_subscriptions` est le bouton d'arrêt. Défaut `enabled = false` :
 * rien ne part tant qu'un humain n'a pas armé le playbook dans son espace, et un
 * seul `UPDATE` éteint tout. C'est la garantie que réclame l'arbitrage — un envoi
 * automatique mal borné abîme une réputation d'expéditeur en une nuit et se
 * répare en semaines.
 *
 * `playbook_sends` porte l'idempotence ET le plafond. Son index unique
 * `(espace, playbook, cible)` est ce qui rend « une relance maximum par règle »
 * vrai même si le balayage est rejoué : pas de cadence, pas d'escalade.
 * Le plafond quotidien se lit sur la même table, par date.
 *
 * `interventions` est la file du responsable. Elle porte une clé de déduplication
 * pour qu'un même problème n'y apparaisse pas à chaque balayage — une file qui se
 * remplit toute seule devient une seconde boîte de réception, et une seconde
 * boîte de réception ne se lit pas.
 */
export class PlaybooksInterventions1789419374625 implements MigrationInterface {
  public name = 'PlaybooksInterventions1789419374625'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS playbook_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        playbook text NOT NULL,
        -- Défaut FAUX : rien ne part tant qu'un humain n'a pas armé.
        enabled boolean NOT NULL DEFAULT false,
        silence_days integer NOT NULL DEFAULT 7,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT playbook_subscriptions_key_check CHECK (
          playbook IN ('submission_no_reply', 'mission_renewal', 'proposal_no_reply')
        ),
        CONSTRAINT playbook_subscriptions_silence_check CHECK (silence_days BETWEEN 1 AND 90)
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS playbook_subscriptions_unique
        ON playbook_subscriptions (workspace_id, playbook)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS playbook_sends (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        playbook text NOT NULL,
        -- L'objet relancé (positionnement, mission, proposition).
        target_id uuid NOT NULL,
        recipient text NOT NULL,
        sent_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // « Une relance maximum par règle », vrai même si le balayage est rejoué.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS playbook_sends_unique
        ON playbook_sends (workspace_id, playbook, target_id)
    `)
    // Le plafond quotidien se lit ici, par date.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS playbook_sends_daily_idx ON playbook_sends (workspace_id, sent_at DESC)`,
    )

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS interventions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        kind text NOT NULL,
        subject_type text NOT NULL,
        subject_id uuid NOT NULL,
        owner_id uuid,
        detail text NOT NULL,
        state text NOT NULL DEFAULT 'open',
        opened_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz,
        resolved_by uuid,
        CONSTRAINT interventions_kind_check CHECK (
          kind IN ('submission_stalled', 'renewal_at_risk', 'invoicing_blocked', 'account_untouched')
        ),
        CONSTRAINT interventions_subject_check CHECK (
          subject_type IN ('account', 'project', 'mission', 'submission')
        ),
        CONSTRAINT interventions_state_check CHECK (state IN ('open', 'acknowledged', 'resolved'))
      )
    `)
    // Un même problème n'apparaît pas à chaque balayage : une file qui se
    // remplit toute seule devient une seconde boîte de réception.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS interventions_unique
        ON interventions (workspace_id, kind, subject_id)
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS interventions_open_idx ON interventions (workspace_id, state, opened_at DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS interventions`)
    await queryRunner.query(`DROP TABLE IF EXISTS playbook_sends`)
    await queryRunner.query(`DROP TABLE IF EXISTS playbook_subscriptions`)
  }
}
