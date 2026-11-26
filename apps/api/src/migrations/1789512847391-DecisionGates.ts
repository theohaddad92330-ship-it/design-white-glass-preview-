import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le journal des portes de décision (BEL-ARCH-005).
 *
 * Deux écritures, et l'ordre compte. La CONTRAINTE d'abord : `gate_decision`
 * est une valeur qui voyage du code vers la base, et la règle du dépôt est
 * qu'on élargit le `CHECK` AVANT de livrer le code qui l'écrit. La leçon a
 * coûté cher une fois — la contrainte de `account_vocabulary.kind` marquait des
 * dossiers COMPLETS en « Erreur », sans que rien ne dise pourquoi.
 *
 * La table ensuite. Elle ne remplace pas `activities` : la timeline montre
 * qu'une décision a été prise, ce journal retient ce qui ne s'affiche nulle
 * part — le motif, et surtout **la liste de ce qui manquait au moment de
 * décider**. C'est cette liste qui, six mois plus tard, explique un résultat.
 *
 * `missing` est du `jsonb` et non une table fille : ce sont des étiquettes
 * courtes saisies par un humain, jamais jointes ni agrégées. Une table fille y
 * ajouterait une jointure sur chaque lecture sans rien rendre de plus.
 */
export class DecisionGates1789512847391 implements MigrationInterface {
  name = 'DecisionGates1789512847391'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. La contrainte, AVANT le code qui écrira la valeur.
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_kind_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_kind_check CHECK (
        kind IN (
          'email', 'call', 'meeting', 'note', 'task', 'stage_change',
          'crm_export', 'linkedin', 'analysis', 'workflow', 'gate_decision'
        )
      )
    `)

    // 2. Le journal.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS decision_gate_crossings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        gate text NOT NULL,
        decision text NOT NULL,
        subject text NOT NULL,
        -- Du texte et non un uuid : l'armement d'un playbook vise sa CLÉ, dont le
        -- catalogue vit dans le code et non dans une table.
        subject_id text NOT NULL,
        reason text,
        -- Ce qui manquait. Une liste VIDE veut dire « rien ne manquait » ;
        -- l'absence de colonne aurait voulu dire « on n'a pas regardé », et les
        -- deux ne se relisent pas pareil.
        missing jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT decision_gate_crossings_gate_check CHECK (
          gate IN (
            'account_priority', 'contact_qualification', 'need_staffable', 'submission_send',
            'playbook_arming', 'erp_write', 'invoice_readiness', 'project_close'
          )
        ),
        CONSTRAINT decision_gate_crossings_decision_check CHECK (decision IN ('accept', 'refuse', 'force')),
        CONSTRAINT decision_gate_crossings_subject_check CHECK (
          subject IN ('account', 'contact', 'project', 'need', 'submission', 'mission', 'playbook')
        )
      )
    `)

    // Lecture par sujet : « qu'a-t-on décidé sur ce compte, et que savait-on ? »
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS decision_gate_crossings_subject_idx
        ON decision_gate_crossings (workspace_id, subject, subject_id, created_at DESC)
    `)
    // Lecture par porte : « combien de projets a-t-on clos sans connaître le budget ? »
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS decision_gate_crossings_gate_idx
        ON decision_gate_crossings (workspace_id, gate, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS decision_gate_crossings_gate_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS decision_gate_crossings_subject_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS decision_gate_crossings`)
    // La contrainte revient à son périmètre d'origine. Les lignes `gate_decision`
    // déjà écrites l'empêcheraient — c'est voulu : un retour arrière qui
    // supprimerait silencieusement de l'historique serait pire que son échec.
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_kind_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_kind_check CHECK (
        kind IN (
          'email', 'call', 'meeting', 'note', 'task', 'stage_change',
          'crm_export', 'linkedin', 'analysis', 'workflow'
        )
      )
    `)
  }
}
