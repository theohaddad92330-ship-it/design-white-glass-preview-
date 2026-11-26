import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le pivot Projet (T1) — un seul objet entre le signal détecté et l'affaire.
 *
 * La table `opportunities` GARDE son nom. Le mot voyage aussi comme clé de
 * charge utile depuis le service IA (`raw_analysis.opportunities`) : la
 * renommer renommerait ce contrat inter-services au passage, pour un gain nul
 * — le nom d'une table n'est visible de personne. Ce qu'on unifie, c'est la
 * sémantique.
 *
 * Ce que la migration pose :
 *
 * 1. `stage` — LE cycle du projet, neuf valeurs, de `detected` à `won`. L'ancien
 *    `lifecycle_status` (cinq valeurs françaises) est repris UNE fois puis n'est
 *    plus lu. On ne le supprime pas : une colonne morte ne coûte rien, une
 *    colonne supprimée par erreur coûte une restauration.
 *
 * 2. `amount_cents` — le montant en CENTIMES, forme canonique. `estimated_amount`
 *    (numeric, euros) est repris et conservé : un flottant qui traverse deux
 *    conversions affiche 1 999,99 € là où le commercial a saisi 2 000.
 *
 * 3. `owner_id`, `expected_close_on`, `closed_at`, `outcome`, `loss_reason`,
 *    `stage_entered_at` — ce qu'un pipe exige pour être autre chose qu'une liste.
 *
 * 4. `project_needs` — les rôles recherchés, en SOUS-LIGNES du projet. C'est ici
 *    que « un Projet unique » se paie en clarté : compter les besoins ne gonfle
 *    plus le pipeline, parce qu'un besoin n'est plus une affaire.
 *
 * 5. `project_contacts` — qui est quoi SUR CE PROJET (sponsor, acheteur,
 *    bloqueur), distinct du rôle de décision porté par le compte.
 *
 * 6. `pipeline_stage_labels` — le renommage des cinq étapes par espace. Le
 *    nombre et l'ordre, eux, ne se configurent pas : c'est ce qui garde deux
 *    rapports comparables.
 *
 * 7. `loss_reasons` — le catalogue des motifs de perte. Un texte libre par
 *    commercial ne s'agrège jamais ; c'est pourtant la seule donnée qui dit
 *    pourquoi on perd.
 *
 * Le report d'état suit l'arbitrage Louis : `nouveau→detected`,
 * `confirme→qualified`, `obsolete→dormant`, `transforme|converti→confirmed`.
 * **Aucun projet n'est promu par la migration** — un `nouveau` détecté par
 * l'analyse reste `detected`, il n'entre pas au pipe tout seul.
 */
export class ProjectPivot1789344812907 implements MigrationInterface {
  public name = 'ProjectPivot1789344812907'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS stage text`)
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz`)
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS owner_id uuid`)
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS amount_cents bigint`)
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS currency text`)
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS expected_close_on date`)
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS closed_at timestamptz`)
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS outcome text`)
    await queryRunner.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS loss_reason text`)

    // Report d'état. `WHERE stage IS NULL` rend la migration rejouable sans
    // écraser une étape qu'un commercial aurait déjà déplacée.
    await queryRunner.query(`
      UPDATE opportunities
         SET stage = CASE lifecycle_status
                       WHEN 'nouveau'    THEN 'detected'
                       WHEN 'confirme'   THEN 'qualified'
                       WHEN 'obsolete'   THEN 'dormant'
                       WHEN 'transforme' THEN 'confirmed'
                       WHEN 'converti'   THEN 'confirmed'
                       ELSE 'detected'
                     END
       WHERE stage IS NULL
    `)
    await queryRunner.query(`UPDATE opportunities SET stage_entered_at = updated_at WHERE stage_entered_at IS NULL`)
    await queryRunner.query(`
      UPDATE opportunities
         SET amount_cents = ROUND(estimated_amount * 100)::bigint,
             currency = COALESCE(currency, 'EUR')
       WHERE estimated_amount IS NOT NULL AND amount_cents IS NULL
    `)

    await queryRunner.query(`ALTER TABLE opportunities ALTER COLUMN stage SET DEFAULT 'detected'`)
    await queryRunner.query(`ALTER TABLE opportunities ALTER COLUMN stage SET NOT NULL`)
    await queryRunner.query(`ALTER TABLE opportunities ALTER COLUMN stage_entered_at SET DEFAULT now()`)
    await queryRunner.query(`ALTER TABLE opportunities ALTER COLUMN stage_entered_at SET NOT NULL`)

    // La contrainte est posée APRÈS le report : la poser avant refuserait les
    // lignes existantes et ferait échouer le déploiement.
    await queryRunner.query(`
      ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_stage_check
    `)
    await queryRunner.query(`
      ALTER TABLE opportunities ADD CONSTRAINT opportunities_stage_check CHECK (
        stage IN ('detected','potential','qualified','confirmed','profiles_submitted','negotiation','won','lost','dormant')
      )
    `)
    await queryRunner.query(`
      ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_outcome_check
    `)
    await queryRunner.query(`
      ALTER TABLE opportunities ADD CONSTRAINT opportunities_outcome_check CHECK (
        outcome IS NULL OR outcome IN ('won','lost','abandoned')
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS opportunities_stage_idx ON opportunities (workspace_id, stage)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS opportunities_owner_idx ON opportunities (owner_id)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_needs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        project_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        title text NOT NULL,
        skills jsonb NOT NULL DEFAULT '[]'::jsonb,
        seniority text,
        headcount integer NOT NULL DEFAULT 1,
        target_tjm_cents bigint,
        start_on date,
        duration_months integer,
        location text,
        contract_kind text NOT NULL DEFAULT 'inconnu',
        status text NOT NULL DEFAULT 'open',
        deadline_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT project_needs_headcount_check CHECK (headcount >= 1),
        CONSTRAINT project_needs_contract_check CHECK (contract_kind IN ('regie','forfait','recrutement','inconnu')),
        CONSTRAINT project_needs_status_check CHECK (status IN ('open','staffed','lost','cancelled'))
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS project_needs_project_idx ON project_needs (project_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS project_needs_workspace_idx ON project_needs (workspace_id)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS project_contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        project_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        role text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT project_contacts_role_check CHECK (
          role IN ('sponsor','decideur','prescripteur','acheteur','utilisateur','bloqueur')
        )
      )
    `)
    // Une personne ne tient qu'UN rôle sur un projet : deux lignes feraient
    // apparaître le même sponsor deux fois dans le comité.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS project_contacts_unique ON project_contacts (project_id, contact_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS project_contacts_workspace_idx ON project_contacts (workspace_id)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pipeline_stage_labels (
        workspace_id uuid NOT NULL,
        stage text NOT NULL,
        label text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, stage),
        CONSTRAINT pipeline_stage_labels_stage_check CHECK (
          stage IN ('qualified','confirmed','profiles_submitted','negotiation','won')
        )
      )
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS loss_reasons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        label text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        archived boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS loss_reasons_unique ON loss_reasons (workspace_id, lower(label))
    `)

    for (const table of ['project_needs', 'project_contacts', 'pipeline_stage_labels', 'loss_reasons']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS loss_reasons`)
    await queryRunner.query(`DROP TABLE IF EXISTS pipeline_stage_labels`)
    await queryRunner.query(`DROP TABLE IF EXISTS project_contacts`)
    await queryRunner.query(`DROP TABLE IF EXISTS project_needs`)
    await queryRunner.query(`DROP INDEX IF EXISTS opportunities_owner_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS opportunities_stage_idx`)
    await queryRunner.query(`ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_outcome_check`)
    await queryRunner.query(`ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_stage_check`)
    for (const column of [
      'loss_reason',
      'outcome',
      'closed_at',
      'expected_close_on',
      'currency',
      'amount_cents',
      'owner_id',
      'stage_entered_at',
      'stage',
    ]) {
      await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS ${column}`)
    }
  }
}
