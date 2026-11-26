import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les champs d'un besoin que le §7.3 du PDF 2 énumère et que la table n'avait pas.
 *
 * Huit sur vingt-huit existaient. Ceux-ci sont ceux dont un écran a réellement
 * besoin : l'urgence (le badge de la colonne « Rôle »), la provenance (d'où
 * vient ce besoin — un besoin détecté par un pipeline ne se traite pas comme un
 * besoin dicté par un client), le demandeur, le porteur, et le contexte que
 * personne ne peut deviner (budget, plancher de TJM, environnement technique,
 * contraintes).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Ce qui n'est PAS dupliqué
 * ─────────────────────────────────────────────────────────────────────────
 * `account_id`, `entity_id` et `site_id` ne sont pas recopiés sur le besoin.
 * Le §7.3 les liste comme « héritage », et c'est exactement pour ça qu'ils
 * n'ont pas leur place ici : ils se lisent par le projet parent, qui est
 * obligatoire. Les recopier créerait deux vérités du rattachement, et le jour
 * où quelqu'un déplace le projet, la moitié des besoins resteraient accrochés
 * à l'ancien compte sans que rien ne le dise.
 *
 * `closing_chance` n'est pas ajouté : l'arbitrage n°4 du 16/08 interdit toute
 * probabilité, et un « score de chance de closing » en est une. Voir le
 * tracker, item 129.
 */
export class NeedFields1789537604211 implements MigrationInterface {
  name = 'NeedFields1789537604211'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD COLUMN IF NOT EXISTS urgency text,
        ADD COLUMN IF NOT EXISTS source text,
        ADD COLUMN IF NOT EXISTS provenance text,
        ADD COLUMN IF NOT EXISTS detected_at timestamptz,
        ADD COLUMN IF NOT EXISTS contact_id uuid,
        ADD COLUMN IF NOT EXISTS owner_id uuid,
        ADD COLUMN IF NOT EXISTS budget_cents bigint,
        ADD COLUMN IF NOT EXISTS min_tjm_cents bigint,
        ADD COLUMN IF NOT EXISTS expertise text,
        ADD COLUMN IF NOT EXISTS context text,
        ADD COLUMN IF NOT EXISTS stack jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS constraints text
    `)

    // L'urgence est CONTRAINTE : quatre valeurs, et `NULL` veut dire « personne
    // ne l'a dite ». Un défaut « normale » ferait passer pour un arbitrage ce
    // qui n'est qu'une absence de réponse.
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_urgency_check CHECK (
        urgency IS NULL OR urgency IN ('basse','normale','haute','critique')
      )
    `)
    // Les onze sources de création du §7.2. LinkedIn n'y figure pas, et c'est
    // un refus : le scraping expose le compte de l'utilisateur à la suspension.
    // Le chemin retenu est `pasted_text` — l'utilisateur colle une offre, on
    // l'extrait, et la provenance reste HUMAINE parce que c'est lui qui a
    // apporté le texte.
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_source_check CHECK (
        source IS NULL OR source IN (
          'manual','from_account','job_posting','hiring_signal','company_news','tender',
          'client_email','meeting_notes','crm_import','ats_import','csv_import','pasted_text'
        )
      )
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_provenance_check CHECK (
        provenance IS NULL OR provenance IN ('human','connector','pipeline','model')
      )
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_budget_check CHECK (
        budget_cents IS NULL OR budget_cents >= 0
      )
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_min_tjm_check CHECK (
        min_tjm_cents IS NULL OR min_tjm_cents >= 0
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS project_needs_owner_idx ON project_needs (owner_id)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const constraint of [
      'project_needs_urgency_check',
      'project_needs_source_check',
      'project_needs_provenance_check',
      'project_needs_budget_check',
      'project_needs_min_tjm_check',
    ]) {
      await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS ${constraint}`)
    }
    await queryRunner.query(`
      ALTER TABLE project_needs
        DROP COLUMN IF EXISTS urgency,
        DROP COLUMN IF EXISTS source,
        DROP COLUMN IF EXISTS provenance,
        DROP COLUMN IF EXISTS detected_at,
        DROP COLUMN IF EXISTS contact_id,
        DROP COLUMN IF EXISTS owner_id,
        DROP COLUMN IF EXISTS budget_cents,
        DROP COLUMN IF EXISTS min_tjm_cents,
        DROP COLUMN IF EXISTS expertise,
        DROP COLUMN IF EXISTS context,
        DROP COLUMN IF EXISTS stack,
        DROP COLUMN IF EXISTS constraints
    `)
  }
}
