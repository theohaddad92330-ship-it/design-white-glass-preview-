import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Théo A signaux (R22-ECRAN-a6) — LA BIBLIOTHÈQUE D'INFORMATIONS PAR COMPTE ET SES VEILLES.
 *
 * AJOUT SEULEMENT : deux tables neuves, aucune colonne existante touchée.
 *
 *  · `signal_user_states` — l'état PERSONNEL d'un signal (enregistré · écarté · corbeille), par (utilisateur,
 *    compte, fait). Le fait est désigné par sa clé normalisée, pas par l'identifiant du flux (qui change à chaque
 *    ré-analyse). Retirer l'état retire la préférence, jamais le signal : « on archive, on ne supprime pas ».
 *  · `signal_watches` — une veille par compte (comptes, natures, sujets, cadence, départ, fuseau, canal, partage).
 *    « Supprimer » ARCHIVE (`archived_at`) : les informations déjà collectées ne dépendent pas de la veille.
 *
 * Contraintes NOMMÉES (GA-177), posées AVANT le code qui écrit (GA-11 / GA-12), alignées sur les contrats :
 *  · `signal_user_states_state_check` ↔ `SIGNAL_USER_STATES` ;
 *  · `signal_watches_cadence_check` ↔ `SIGNAL_WATCH_CADENCES` ; `_channel_check` ↔ `SIGNAL_WATCH_CHANNELS` ;
 *    `_state_check` ↔ `SIGNAL_WATCH_STATES` ;
 *  · `signal_user_states_once` — une seule ligne par (utilisateur, compte, fait), mise à jour plutôt que dupliquée.
 *
 * `ON DELETE CASCADE` explicite : le reset démo (et l'effacement d'un compte ou d'un utilisateur) emporte ses
 * lignes au lieu d'échouer sur une FK pendante.
 */
export class SignalLibrary1796575001843 implements MigrationInterface {
  public name = 'SignalLibrary1796575001843'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS signal_user_states (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        signal_key text NOT NULL,
        state text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT signal_user_states_state_check CHECK (state IN ('saved', 'discarded', 'trashed')),
        CONSTRAINT signal_user_states_key_len CHECK (char_length(signal_key) BETWEEN 1 AND 300),
        CONSTRAINT signal_user_states_once UNIQUE (user_id, account_id, signal_key)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS signal_user_states_user_idx ON signal_user_states (user_id, state)`,
    )
    await queryRunner.query(`ALTER TABLE signal_user_states ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY signal_user_states_own ON signal_user_states FOR ALL
          USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS signal_watches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name text NOT NULL,
        account_ids uuid[] NOT NULL,
        natures text[] NOT NULL DEFAULT '{}',
        keywords text[] NOT NULL DEFAULT '{}',
        cadence text NOT NULL,
        starts_on date NOT NULL,
        timezone text NOT NULL DEFAULT 'Europe/Paris',
        channel text NOT NULL DEFAULT 'in_app',
        shared boolean NOT NULL DEFAULT false,
        state text NOT NULL DEFAULT 'active',
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT signal_watches_cadence_check CHECK (cadence IN ('daily', '3_days', '5_days', 'weekly', 'biweekly', '30_days')),
        CONSTRAINT signal_watches_channel_check CHECK (channel IN ('in_app', 'email', 'digest')),
        CONSTRAINT signal_watches_state_check CHECK (state IN ('active', 'paused')),
        CONSTRAINT signal_watches_accounts_nonempty CHECK (cardinality(account_ids) >= 1)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS signal_watches_workspace_idx ON signal_watches (workspace_id) WHERE archived_at IS NULL`,
    )
    await queryRunner.query(`ALTER TABLE signal_watches ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY signal_watches_visible ON signal_watches FOR SELECT
          USING (
            user_id = auth.uid()
            OR (shared AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = signal_watches.workspace_id AND m.user_id = auth.uid()))
          );
        CREATE POLICY signal_watches_own_write ON signal_watches FOR ALL
          USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS signal_watches`)
    await queryRunner.query(`DROP TABLE IF EXISTS signal_user_states`)
  }
}
