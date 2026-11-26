import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le versionnement des dossiers de compétences (PDF 3 §9.2, ticket BEL-ATS-202).
 *
 * `consultant_cv_rewrites` gardait UNE ligne par couple (consultant, besoin),
 * écrasée à chaque régénération. Le §9.2 exige l'inverse, pour une raison très
 * concrète : quand un client répond trois semaines plus tard sur un dossier, il
 * faut savoir ce qu'il a reçu. Une ligne écrasée ne le dit plus, et personne ne
 * peut alors expliquer un écart entre ce que le client cite et ce que la fiche
 * contient aujourd'hui.
 *
 * La table existante n'est PAS touchée : elle porte le CV courant du panneau de
 * matching, qui marche. Les versions s'ajoutent à côté — remplacer un chemin
 * qui fonctionne pour en poser un neuf est le meilleur moyen de casser les
 * deux.
 *
 * Le réglage d'espace arrive avec : sans lui, chaque génération redemanderait
 * une règle d'anonymisation, et quelqu'un finirait par cliquer « nom complet »
 * par habitude.
 */
export class CvVersions1789571845632 implements MigrationInterface {
  public name = 'CvVersions1789571845632'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cv_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        consultant_id uuid NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
        -- Le besoin visé. SET NULL et non CASCADE : un besoin qui disparaît
        -- ne doit pas effacer la trace de ce qu'un client a reçu.
        need_id uuid REFERENCES project_needs(id) ON DELETE SET NULL,
        version_kind text NOT NULL,
        template_key text NOT NULL DEFAULT 'default',
        language text NOT NULL DEFAULT 'fr',
        anonymisation_rule text NOT NULL DEFAULT 'nom_complet',
        sections jsonb NOT NULL DEFAULT '[]',
        -- Les compétences BARRÉES, avec leur raison : « déclarée, aucune
        -- preuve » se défend devant un client, un silence non.
        excluded_skills jsonb NOT NULL DEFAULT '[]',
        generated_by uuid,
        generated_at timestamptz NOT NULL DEFAULT now(),
        sent_to_contact_id uuid,
        CONSTRAINT cv_versions_kind_check
          CHECK (version_kind IN ('source', 'client', 'anonyme', 'enrichi', 'resume')),
        CONSTRAINT cv_versions_anonymisation_check
          CHECK (anonymisation_rule IN ('nom_complet', 'prenom_initiale', 'initiales', 'trigramme'))
      )
    `)
    // Une génération AJOUTE une ligne : aucune contrainte d'unicité, c'est tout
    // le point. L'index sert la lecture « les versions de cette personne, la
    // plus récente d'abord ».
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS cv_versions_consultant_idx
        ON cv_versions (consultant_id, generated_at DESC)
    `)

    await queryRunner.query(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS anonymisation_rule text NOT NULL DEFAULT 'nom_complet'`,
    )
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_anonymisation_check`)
    await queryRunner.query(`
      ALTER TABLE workspaces ADD CONSTRAINT workspaces_anonymisation_check
        CHECK (anonymisation_rule IN ('nom_complet', 'prenom_initiale', 'initiales', 'trigramme'))
    `)
    // Ce qu'on masque en plus du nom. Défaut vide : aucun espace existant ne
    // voit ses dossiers changer du jour au lendemain.
    await queryRunner.query(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS anonymisation_hide jsonb NOT NULL DEFAULT '[]'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS anonymisation_hide`)
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_anonymisation_check`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS anonymisation_rule`)
    await queryRunner.query(`DROP INDEX IF EXISTS cv_versions_consultant_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS cv_versions`)
  }
}
