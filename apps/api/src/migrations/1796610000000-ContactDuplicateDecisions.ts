import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4114.4 — la décision d'un humain sur une paire de personnes PROPOSÉE comme doublon
 * (`GET /contacts/account/:id/duplicate-proposals`) : « ce sont les mêmes » (`same`, la confirmation attend la
 * porte de fusion — on PROPOSE, on ne fusionne JAMAIS) ou « pas les mêmes » (`not_same`, la paire ne revient plus).
 *
 * Ajout seul. Une paire = une ligne par espace, ordre des identifiants normalisé (`left_contact_id < right_contact_id`)
 * pour qu'un même couple ne s'écrive pas deux fois. Une correction humaine gagne toujours : la dernière décision remplace.
 * RLS standard `auth.uid() = user_id` ; l'API (service-role) borne en plus par `workspace_id`.
 */
export class ContactDuplicateDecisions1796610000000 implements MigrationInterface {
  public name = 'ContactDuplicateDecisions1796610000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_duplicate_decisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        left_contact_id uuid NOT NULL,
        right_contact_id uuid NOT NULL,
        decision text NOT NULL,
        user_id uuid NOT NULL,
        decided_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT contact_duplicate_decisions_decision_check CHECK (decision IN ('same', 'not_same')),
        CONSTRAINT contact_duplicate_decisions_order CHECK (left_contact_id < right_contact_id),
        CONSTRAINT contact_duplicate_decisions_pair UNIQUE (workspace_id, left_contact_id, right_contact_id)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contact_duplicate_decisions_account_idx ON contact_duplicate_decisions (workspace_id, account_id)`,
    )
    await queryRunner.query(`ALTER TABLE contact_duplicate_decisions ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_duplicate_decisions'
                         AND policyname = 'Users can manage their own duplicate decisions') THEN
          CREATE POLICY "Users can manage their own duplicate decisions"
            ON contact_duplicate_decisions FOR ALL
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
