import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Initial BellumAI schema: 7 tables + RLS policies + auto-update triggers +
 * pgvector extension and ivfflat index for the RAG service.
 */
export class Init1767225600000 implements MigrationInterface {
  public name = 'Init1767225600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const enableUserScopedRls = async (table: string): Promise<void> => {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      for (const op of ['select', 'insert', 'update', 'delete'] as const) {
        const clause = op === 'insert' ? 'WITH CHECK' : 'USING'
        await queryRunner.query(
          `CREATE POLICY "${table}_${op}" ON ${table} FOR ${op.toUpperCase()} ${clause} (auth.uid() = user_id)`,
        )
      }
    }

    const addUpdatedAtTrigger = async (table: string): Promise<void> => {
      await queryRunner.query(`
        CREATE TRIGGER ${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
      `)
    }

    // ─── pgvector extension ─────────────────────────────────────────────
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions`)

    // ─── Trigger function: auto-update updated_at ───────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)

    // ─── 1. profiles ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
        full_name TEXT,
        company_name TEXT,
        onboarding_data JSONB,
        onboarding_completed BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await enableUserScopedRls('profiles')
    await addUpdatedAtTrigger('profiles')

    // ─── 2. user_credits ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE user_credits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
        plan TEXT DEFAULT 'free',
        accounts_limit INTEGER DEFAULT 3,
        accounts_used INTEGER DEFAULT 0,
        enrichment_credits INTEGER DEFAULT 0,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await enableUserScopedRls('user_credits')
    await addUpdatedAtTrigger('user_credits')

    // ─── 3. accounts ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        company_name TEXT NOT NULL,
        sector TEXT,
        employees TEXT,
        revenue TEXT,
        headquarters TEXT,
        website TEXT,
        subsidiaries JSONB DEFAULT '[]',
        it_challenges JSONB DEFAULT '[]',
        recent_signals JSONB DEFAULT '[]',
        priority_score INTEGER,
        priority_justification TEXT,
        raw_analysis JSONB DEFAULT '{}',
        status TEXT DEFAULT 'analyzing' CHECK (status IN ('analyzing', 'completed', 'error')),
        error_message TEXT,
        user_context TEXT,
        api_cost_euros NUMERIC(10,4),
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await enableUserScopedRls('accounts')
    await addUpdatedAtTrigger('accounts')

    // ─── 4. contacts ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        full_name TEXT NOT NULL,
        title TEXT,
        entity TEXT,
        decision_role TEXT CHECK (decision_role IN ('sponsor','champion','operational','purchasing','influencer','blocker','unknown')),
        priority INTEGER,
        email TEXT,
        email_verified BOOLEAN DEFAULT false,
        phone TEXT,
        linkedin_url TEXT,
        profile_summary TEXT,
        why_contact TEXT,
        email_message JSONB,
        linkedin_message TEXT,
        phone_script TEXT,
        followup_message JSONB,
        user_status TEXT DEFAULT 'new' CHECK (user_status IN ('new','contacted','replied','meeting','refused','silence')),
        source TEXT CHECK (source IN ('linkedin_apify','apollo','ai_generated')),
        raw_data JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await enableUserScopedRls('contacts')
    await addUpdatedAtTrigger('contacts')

    // ─── 5. attack_angles ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE attack_angles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        title TEXT,
        description TEXT,
        entry_point TEXT,
        is_recommended BOOLEAN,
        rank INTEGER,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await enableUserScopedRls('attack_angles')

    // ─── 6. action_plans ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE action_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        strategy_type TEXT,
        strategy_justification TEXT,
        weeks JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await enableUserScopedRls('action_plans')
    await addUpdatedAtTrigger('action_plans')

    // ─── 7. rag_documents ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE rag_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
        title TEXT,
        content TEXT,
        category TEXT,
        embedding extensions.vector(1536),
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)
    await enableUserScopedRls('rag_documents')

    // ─── Auto-create profile on signup ──────────────────────────────────
    // search_path is pinned: SECURITY DEFINER alone preserves only the
    // privilege context, not the search_path. Without this pin, triggers
    // run as supabase_auth_admin (whose default search_path is
    // `auth, extensions`) fail with "relation profiles does not exist".
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      BEGIN
        INSERT INTO profiles (user_id) VALUES (NEW.id);
        RETURN NEW;
      END;
      $$
    `)

    await queryRunner.query(`
      CREATE TRIGGER on_auth_user_created_profile
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user()
    `)

    // ─── Auto-create user_credits on signup ─────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION handle_new_user_credits()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth, extensions
      AS $$
      BEGIN
        INSERT INTO user_credits (user_id, plan, accounts_limit)
        VALUES (NEW.id, 'free', 3);
        RETURN NEW;
      END;
      $$
    `)

    await queryRunner.query(`
      CREATE TRIGGER on_auth_user_created_credits
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user_credits()
    `)

    // ─── pgvector ivfflat index for similarity search ───────────────────
    await queryRunner.query(`
      CREATE INDEX rag_documents_embedding_idx
      ON rag_documents
      USING ivfflat (embedding extensions.vector_cosine_ops)
      WITH (lists = 100)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
