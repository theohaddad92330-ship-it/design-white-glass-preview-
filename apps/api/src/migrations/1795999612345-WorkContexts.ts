import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2455.1/.2/.3/.7 — Contextes de travail enregistrés (LAU-FINAL-168).
 *
 * Table `work_contexts` : un utilisateur qui travaille plusieurs marchés/BU/offres
 * crée des variantes de critères SANS modifier son profil principal (`profiles` /
 * `esn_profiles` restent intacts — modèle additif, table neuve). ~22 champs de
 * l'objet WORK_CONTEXT demandé ; `references` est un mot réservé SQL, colonne
 * nommée `reference_list`.
 *
 * `status` porte les QUATRE types demandés (temporaire/enregistré/partagé/archivé),
 * `visibility` porte le multi-BU (personal/bu/group) — filtrage fin fait côté
 * application (`WorkContextsService`, même patron que `portfolioScopeFor`), RLS =
 * seule frontière dure (le workspace).
 *
 * Table `work_context_activations` : trace qu'un contexte a été activé pour une
 * conversation donnée (#2455.5 — bascule = nouvelle conversation, fil d'origine
 * intact, contexte actif affiché) — jamais de mutation du fil existant.
 *
 * Additive + idempotente (`IF NOT EXISTS` partout, garde `pg_policies`).
 */
export class WorkContexts1795999612345 implements MigrationInterface {
  public name = 'WorkContexts1795999612345'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_contexts (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id    uuid NOT NULL,
        owner_user_id   uuid NOT NULL,
        name            text NOT NULL,
        visibility      text NOT NULL DEFAULT 'personal',
        business_unit_id uuid,
        objective       text,
        offer           text,
        expertise       text,
        technologies    jsonb NOT NULL DEFAULT '[]'::jsonb,
        sectors         jsonb NOT NULL DEFAULT '[]'::jsonb,
        territories     jsonb NOT NULL DEFAULT '[]'::jsonb,
        company_types   jsonb NOT NULL DEFAULT '[]'::jsonb,
        sizes           jsonb NOT NULL DEFAULT '[]'::jsonb,
        delivery_model  text,
        exclusions      jsonb NOT NULL DEFAULT '[]'::jsonb,
        reference_list  jsonb NOT NULL DEFAULT '[]'::jsonb,
        capacity        text,
        data_layers     jsonb NOT NULL DEFAULT '[]'::jsonb,
        status          text NOT NULL DEFAULT 'enregistre',
        version         integer NOT NULL DEFAULT 1,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_contexts_visibility_check CHECK (visibility IN ('personal', 'bu', 'group')),
        CONSTRAINT work_contexts_status_check CHECK (status IN ('temporaire', 'enregistre', 'partage', 'archive'))
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS work_contexts_owner_idx
        ON work_contexts (workspace_id, owner_user_id, status)
    `)

    await queryRunner.query(`ALTER TABLE work_contexts ENABLE ROW LEVEL SECURITY`)

    // Frontière dure = le workspace (défense en profondeur) ; le fin (personal/bu/group)
    // reste porté par l'application, comme `portfolioScopeFor` pour les comptes.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'work_contexts'
            AND policyname = 'Members can read their workspace work contexts'
        ) THEN
          CREATE POLICY "Members can read their workspace work contexts"
            ON work_contexts
            FOR SELECT
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'work_contexts'
            AND policyname = 'Members create their own work contexts'
        ) THEN
          CREATE POLICY "Members create their own work contexts"
            ON work_contexts
            FOR INSERT
            WITH CHECK (
              auth.uid() = owner_user_id
              AND workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'work_contexts'
            AND policyname = 'Owners update their own work contexts'
        ) THEN
          CREATE POLICY "Owners update their own work contexts"
            ON work_contexts
            FOR UPDATE
            USING (auth.uid() = owner_user_id);
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS work_context_activations (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        work_context_id  uuid NOT NULL REFERENCES work_contexts(id) ON DELETE CASCADE,
        workspace_id     uuid NOT NULL,
        user_id          uuid NOT NULL,
        conversation_id  text,
        activated_at     timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS work_context_activations_user_idx
        ON work_context_activations (workspace_id, user_id, activated_at DESC)
    `)

    await queryRunner.query(`ALTER TABLE work_context_activations ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'work_context_activations'
            AND policyname = 'Members read their own activations'
        ) THEN
          CREATE POLICY "Members read their own activations"
            ON work_context_activations
            FOR SELECT
            USING (auth.uid() = user_id);
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'work_context_activations'
            AND policyname = 'Members create their own activations'
        ) THEN
          CREATE POLICY "Members create their own activations"
            ON work_context_activations
            FOR INSERT
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
