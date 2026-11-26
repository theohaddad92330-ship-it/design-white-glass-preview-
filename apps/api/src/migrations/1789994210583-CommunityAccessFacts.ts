import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La donnée communautaire (tome 2 §5 et §24-25, ticket `BEL-DATA-005`).
 *
 * Deux objets, et pas un de plus :
 *
 * 1. `workspaces.community_data_sharing` — l'opt-in, **décoché par défaut**.
 *    C'est le principe n°1 des quatre, et un défaut à `true` ferait circuler
 *    entre clients une information qu'aucun d'eux n'a accepté de partager.
 *
 * 2. `access_fact_questions` — la mémoire des questions POSÉES. Sans elle, la
 *    règle « une question par compte et par espace, jamais reposée si ignorée »
 *    n'est pas tenable : on redemanderait à chaque affichage, et le mécanisme
 *    qui devait coûter un clic deviendrait le bruit qu'on coupe.
 *
 * La déclaration elle-même n'a pas besoin de table : elle atterrit dans
 * `access_facts`, qui porte déjà sa source, sa date, sa provenance et son
 * espace — c'est-à-dire tout ce qu'il faut pour compter des espaces distincts.
 *
 * L'unicité porte sur (espace, compte, moment) : deux membres du même espace ne
 * se posent pas la même question deux fois, et un moment DIFFÉRENT sur le même
 * compte reste légitime — « as-tu parlé référencement ? » et « ce client
 * passe-t-il par un panel ? » ne sont pas la même question.
 */
export class CommunityAccessFacts1789994210583 implements MigrationInterface {
  name = 'CommunityAccessFacts1789994210583'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS community_data_sharing BOOLEAN NOT NULL DEFAULT false`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_fact_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        moment TEXT NOT NULL,
        asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        answered_at TIMESTAMPTZ,
        answer TEXT,
        CONSTRAINT access_fact_questions_moment_check
          CHECK (moment IN ('after_refusal', 'mission_end', 'first_contact'))
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS access_fact_questions_unique
         ON access_fact_questions (workspace_id, account_id, moment)`,
    )
    // La lecture communautaire compte des espaces DISTINCTS par valeur, sur un
    // compte identifié par son SIREN — jamais par son id, qui est propre à
    // chaque espace. Sans cet index, chaque affichage d'un onglet Accès ferait
    // un balayage complet de la table.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS access_facts_kind_value_idx ON access_facts (kind, value)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS access_facts_kind_value_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS access_fact_questions`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS community_data_sharing`)
  }
}
