import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les TALENTS (T5) — candidats, compétences typées, documents, rétention.
 *
 * `consultants.kind` plutôt qu'une table `candidates` (arbitrage Louis #7) :
 * ce sont les mêmes champs et le même écran, et deux tables auraient produit
 * deux recherches, deux matchings et une question permanente — « il est où,
 * celui-là ? ». Le défaut est `consultant`, donc les lignes existantes gardent
 * exactement leur sens.
 *
 * Ce que la colonne CHANGE, en revanche, c'est le régime de la donnée : un
 * consultant est justifié par un contrat de travail, un candidat non. D'où
 * `last_contact_at` (le point d'ancrage de la rétention) et le réglage par
 * espace, plafonné à 24 mois **en base** par une contrainte — un plafond qui ne
 * vit que dans un écran se contourne en tapant 120.
 *
 * `consultant_skills` est une table et non un tableau de texte : `stack` reste
 * en place et continue de servir, mais un tableau ne peut porter ni niveau, ni
 * ancienneté, ni source. Or « Kubernetes, expert, 6 ans, confirmé en entretien »
 * et « Kubernetes » écrit sur un coin de CV n'ont pas la même valeur devant un
 * client, et c'est cette différence qu'un vivier doit savoir dire.
 */
export class TalentPool1789374912846 implements MigrationInterface {
  public name = 'TalentPool1789374912846'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'consultant'`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS last_contact_at timestamptz`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS source text`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_kind_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_kind_check CHECK (kind IN ('consultant', 'candidate'))
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS consultants_kind_idx ON consultants (workspace_id, kind)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultant_skills (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consultant_id uuid NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
        -- Dénormalisé comme sur \`project_needs\` : la remise à neuf d'une salle
        -- de démonstration efface par espace, et une table qui ne le porte pas
        -- l'oblige à passer par une jointure — donc à dépendre d'un ordre de
        -- suppression que personne ne relit.
        workspace_id uuid,
        skill text NOT NULL,
        raw_label text,
        level text NOT NULL DEFAULT 'autonome',
        years integer,
        last_used_year integer,
        source text NOT NULL DEFAULT 'declared',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT consultant_skills_level_check CHECK (level IN ('notions', 'autonome', 'confirme', 'expert')),
        CONSTRAINT consultant_skills_source_check CHECK (source IN ('declared', 'cv', 'interview', 'mission'))
      )
    `)
    // Une compétence par personne : deux lignes « kubernetes » sur la même fiche
    // afficheraient deux niveaux contradictoires, et le matching en compterait
    // deux. L'écriture est donc un upsert sur cette clé.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS consultant_skills_unique ON consultant_skills (consultant_id, skill)
    `)
    // « Qui sait faire du Kubernetes ? » — la question qu'on pose vraiment.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS consultant_skills_skill_idx ON consultant_skills (skill)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultant_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consultant_id uuid NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
        workspace_id uuid,
        kind text NOT NULL DEFAULT 'cv',
        filename text NOT NULL,
        mime_type text,
        size_bytes integer,
        -- Le TEXTE extrait, pas le fichier : rien dans le produit ne réaffiche
        -- un PDF, et garder le binaire multiplierait la surface de donnée
        -- personnelle sans usage en face.
        extracted_text text,
        uploaded_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT consultant_documents_kind_check CHECK (kind IN ('cv', 'dossier', 'certificate', 'other'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultant_documents_consultant_idx ON consultant_documents (consultant_id, created_at DESC)
    `)

    // Le réglage de rétention, par espace. Le plafond est une CONTRAINTE : un
    // maximum qui ne vit que dans un écran n'en est pas un.
    await queryRunner.query(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS talent_retention_months integer NOT NULL DEFAULT 24
    `)
    await queryRunner.query(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS talent_retention_enabled boolean NOT NULL DEFAULT false
    `)
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_talent_retention_check`)
    await queryRunner.query(`
      ALTER TABLE workspaces ADD CONSTRAINT workspaces_talent_retention_check
        CHECK (talent_retention_months BETWEEN 1 AND 24)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_talent_retention_check`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS talent_retention_enabled`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS talent_retention_months`)
    await queryRunner.query(`DROP TABLE IF EXISTS consultant_documents`)
    await queryRunner.query(`DROP TABLE IF EXISTS consultant_skills`)
    await queryRunner.query(`DROP INDEX IF EXISTS consultants_kind_idx`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_kind_check`)
    for (const column of ['source', 'last_contact_at', 'kind']) {
      await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS ${column}`)
    }
  }
}
