import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La capitalisation : ce qu'on a livré, ce qu'on peut montrer (PDF 2 §12).
 *
 * Le domaine n'existait pas — le registre des flux le DISAIT (« ni table `rex`,
 * ni `proof`, ni `testimonial` »), et le PDF 1 avait laissé `proofStrength` et
 * `isProofUsable` non écrites faute de consommateur. Conséquence concrète : à
 * la question « qu'est-ce qu'on a déjà fait chez un client comme celui-là ? »,
 * un commercial n'avait que sa mémoire et celle de ses collègues.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Trois objets, et ce qui les sépare
 * ─────────────────────────────────────────────────────────────────────────
 * Une PREUVE est une affirmation qu'on peut sortir : « migration de 400 To en
 * 6 mois ». Elle porte sa FORCE (mesurée, attestée, déclarée) et sa PORTÉE —
 * interne ou montrable au client. C'est cette portée qui empêche l'accident le
 * plus coûteux du domaine : sortir chez un prospect une preuve que le client
 * d'origine n'a jamais accepté qu'on cite.
 *
 * Un REX est le retour d'une mission terminée. Il n'est pas une preuve : il est
 * la matière brute d'où une preuve peut sortir, une fois relue.
 *
 * Un TÉMOIGNAGE exige un accord ÉCRIT et sa référence est obligatoire quand il
 * est publiable. Un témoignage sans trace d'accord est un risque juridique
 * qu'aucune ESN ne veut porter pour gagner une ligne de plaquette.
 */
export class Capitalisation1789551204833 implements MigrationInterface {
  name = 'Capitalisation1789551204833'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS proofs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        mission_id uuid,
        claim text NOT NULL,
        detail text,
        strength text NOT NULL DEFAULT 'declared',
        scope text NOT NULL DEFAULT 'internal',
        sector text,
        anonymised boolean NOT NULL DEFAULT false,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT proofs_strength_check CHECK (strength IN ('measured','attested','declared')),
        CONSTRAINT proofs_scope_check CHECK (scope IN ('internal','client_safe'))
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS proofs_workspace_idx ON proofs (workspace_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS proofs_account_idx ON proofs (account_id)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rex_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL,
        account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        summary text NOT NULL,
        what_worked text,
        what_failed text,
        collected_by uuid,
        collected_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT rex_entries_mission_unique UNIQUE (mission_id)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS rex_entries_workspace_idx ON rex_entries (workspace_id)`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
        author_name text,
        author_title text,
        quote text NOT NULL,
        -- La RÉFÉRENCE de l'accord écrit : un lien, un numéro de document, ce que
        -- l'ESN archive. Nullable en base pour permettre la saisie en deux temps,
        -- mais un témoignage PUBLIABLE sans elle est refusé côté service — la
        -- contrainte est de forme, la règle est métier.
        consent_reference text,
        publishable boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS testimonials_workspace_idx ON testimonials (workspace_id)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS testimonials`)
    await queryRunner.query(`DROP TABLE IF EXISTS rex_entries`)
    await queryRunner.query(`DROP TABLE IF EXISTS proofs`)
  }
}
