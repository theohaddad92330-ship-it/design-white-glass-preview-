import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La couche BU / agence — la DIMENSION, avant le code qui l'écrit (#2005.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN OBJET, ET PAS UNE ÉTIQUETTE SUR L'UTILISATEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Une BU a un territoire, un responsable, des membres, des comptes et un état.
 * Portée par une colonne `business_unit text` sur `workspace_members`, elle
 * n'aurait ni identité stable (deux orthographes = deux BU), ni possibilité
 * qu'un compte lui appartienne, ni demande d'accès. C'est l'arbitrage « dimension
 * COMPLÈTE » du 15/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CETTE MIGRATION PART AVANT LE CODE — GA-11 / GA-12
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle est seule dans son commit. Les trois `CHECK` qu'elle pose
 * (`business_units.kind`, `business_units.status`, `business_unit_members.membership`,
 * `business_unit_access_requests.status`, `workspace_members.business_unit_access`)
 * doivent exister en base AVANT la première ligne de TypeScript qui écrit l'une
 * de ces valeurs — sinon le déploiement passe le code avant la contrainte et la
 * première écriture est rejetée en production.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDITIVE DE BOUT EN BOUT — CE QUI EXISTE NE BOUGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * · aucune colonne supprimée, aucune renommée, aucune contrainte rétrécie ;
 * · `accounts.business_unit_id` est NULLABLE : les comptes d'aujourd'hui n'ont
 *   pas de BU et doivent rester visibles exactement de qui les voyait hier ;
 * · `workspace_members.business_unit_access` vaut `'workspace'` par défaut,
 *   c'est-à-dire le comportement HISTORIQUE — personne ne perd un accès le jour
 *   du déploiement. Le niveau `'business_unit'` est un RÉTRÉCISSEMENT qu'un
 *   responsable doit poser explicitement, jamais un défaut.
 *
 * ⚠️ Le `workspace_id` est répété sur CHAQUE table, y compris celles qu'une
 * jointure suffirait à borner. Ce n'est pas de la dénormalisation décorative :
 * c'est ce qui permet à toute lecture de garder son `WHERE workspace_id = $1`
 * même quand elle ajoute un filtre de BU. Le risque n°1 de ce chantier est
 * qu'une jointure REMPLACE la borne d'espace au lieu de s'y ajouter ; une
 * colonne d'espace présente partout rend la forme correcte la plus courte à
 * écrire.
 */
export class BusinessUnits1793710000000 implements MigrationInterface {
  name = 'BusinessUnits1793710000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Le périmètre lui-même ────────────────────────────────────────────────
    // `kind` porte les sept réponses de la question « à quelle échelle
    // travailles-tu réellement ? » (#2087.2 à #2087.8). Elles sont un FAIT
    // déclaré par l'espace, pas un classement : aucune n'ouvre ni ne ferme un
    // droit — c'est `business_unit_access` qui le fait, et lui seul.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS business_units (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        name text NOT NULL,
        kind text NOT NULL DEFAULT 'business_unit',
        -- Les sept champs de la saisie #2087.11. Tous nullables : un périmètre
        -- créé en trois secondes pendant l'onboarding n'a qu'un nom, et un
        -- champ vide vaut « pas renseigné », jamais zéro.
        territory text,
        specialties jsonb NOT NULL DEFAULT '[]'::jsonb,
        consultant_count integer,
        team_size integer,
        lead_user_id uuid,
        portfolio_note text,
        status text NOT NULL DEFAULT 'active',
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT business_units_kind_check CHECK (
          kind IN (
            'company', 'business_unit', 'agency', 'sales_team',
            'territory', 'new_venture', 'solo'
          )
        ),
        CONSTRAINT business_units_status_check CHECK (status IN ('active', 'archived')),
        -- Un compte de consultants négatif n'existe pas ; un compte à zéro, si
        -- (une agence qui ouvre). La borne basse est donc 0, pas 1.
        CONSTRAINT business_units_consultant_count_check CHECK (consultant_count IS NULL OR consultant_count >= 0),
        CONSTRAINT business_units_team_size_check CHECK (team_size IS NULL OR team_size >= 0)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS business_units_workspace_idx ON business_units (workspace_id)
    `)
    // Deux « Agence Lyon » dans le même espace sont une erreur de saisie, pas
    // deux périmètres. La casse ne compte pas : « Agence Lyon » et « agence
    // lyon » désignent la même équipe pour tout le monde sauf pour Postgres.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS business_units_workspace_name_unique
        ON business_units (workspace_id, lower(name))
    `)

    // ── Qui appartient à quel périmètre ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS business_unit_members (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        business_unit_id uuid NOT NULL REFERENCES business_units (id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        membership text NOT NULL DEFAULT 'member',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT business_unit_members_membership_check CHECK (membership IN ('lead', 'member'))
      )
    `)
    // Une personne appartient à PLUSIEURS BU (un responsable de deux agences),
    // mais pas deux fois à la même.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS business_unit_members_unique
        ON business_unit_members (business_unit_id, user_id)
    `)
    // La lecture chaude : « quels périmètres porte CETTE personne », à chaque
    // requête cloisonnée.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS business_unit_members_member_idx
        ON business_unit_members (workspace_id, user_id)
    `)

    // ── « Demander l'accès » (#2087.16) ──────────────────────────────────────
    // Une demande, pas une adhésion : rejoindre un périmètre qu'on ne porte pas
    // se DEMANDE, et quelqu'un répond. Sans cette table, le bouton « Demander
    // l'accès » n'aurait nulle part où écrire et serait un bouton qui ment.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS business_unit_access_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        business_unit_id uuid NOT NULL REFERENCES business_units (id) ON DELETE CASCADE,
        user_id uuid NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        message text,
        decided_by uuid,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT business_unit_access_requests_status_check CHECK (
          status IN ('pending', 'granted', 'refused')
        )
      )
    `)
    // Une seule demande EN COURS par personne et par périmètre. Les demandes
    // tranchées restent : une décision d'accès est une trace, on ne l'efface pas.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS business_unit_access_requests_pending_unique
        ON business_unit_access_requests (business_unit_id, user_id)
        WHERE status = 'pending'
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS business_unit_access_requests_workspace_idx
        ON business_unit_access_requests (workspace_id, status)
    `)

    // ── Le niveau d'accès INTERMÉDIAIRE ──────────────────────────────────────
    // `'workspace'` = tout l'espace, le comportement historique et le DÉFAUT.
    // `'business_unit'` = ses périmètres, et ce que personne ne porte.
    //
    // ⚠️ Ce n'est PAS un rôle. Un rôle dit ce qu'on a le droit de FAIRE ; ceci
    // dit sur quoi. Les mélanger obligerait à dupliquer les neuf rôles fois
    // deux — et c'est ainsi qu'une matrice de droits devient illisible.
    await queryRunner.query(`
      ALTER TABLE workspace_members
        ADD COLUMN IF NOT EXISTS business_unit_access text NOT NULL DEFAULT 'workspace'
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_business_unit_access_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspace_members
        ADD CONSTRAINT workspace_members_business_unit_access_check CHECK (
          business_unit_access IN ('workspace', 'business_unit')
        )
    `)

    // ── Le rattachement d'un compte à un périmètre (#2081.10) ────────────────
    // NULLABLE, et c'est la moitié qui compte : tout ce qui existe aujourd'hui
    // n'a pas de BU. Un compte sans BU reste visible de qui le voyait avant —
    // la dimension AJOUTE une borne, elle ne fait disparaître personne.
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS business_unit_id uuid
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS accounts_business_unit_idx
        ON accounts (workspace_id, business_unit_id)
    `)

    // ── Le filet RLS (#2005.12, #2081.20) ────────────────────────────────────
    // ⚠️ Un FILET, pas la serrure : l'API se connecte en superuser Postgres et
    // contourne RLS (c'est écrit en tête de `1784600000001-WorkspaceRlsPolicies`).
    // L'autorisation réelle vit dans la couche service, et c'est elle que les
    // tests nommés de ce lot mesurent. La politique ci-dessous protège l'autre
    // porte : un accès direct à la base avec un JWT Supabase.
    //
    // Elle borne l'ESPACE, pas la BU. Le cloisonnement intra-espace dépend de
    // `business_unit_access`, qui est une règle de produit — l'écrire en SQL
    // ici la dupliquerait (GA-26 : un réglage vit à un seul endroit) et la
    // ferait diverger à la première évolution.
    const memberOf = `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())`
    for (const table of ['business_units', 'business_unit_members', 'business_unit_access_requests']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      await queryRunner.query(`DROP POLICY IF EXISTS "${table}_workspace_access" ON ${table}`)
      await queryRunner.query(`
        CREATE POLICY "${table}_workspace_access" ON ${table} FOR ALL
          USING (${memberOf})
          WITH CHECK (${memberOf})
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS accounts_business_unit_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS business_unit_access_requests`)
    await queryRunner.query(`DROP TABLE IF EXISTS business_unit_members`)
    await queryRunner.query(`DROP TABLE IF EXISTS business_units`)
    // `accounts.business_unit_id` et `workspace_members.business_unit_access`
    // NE sont PAS retirées. Elles portent des rattachements et des niveaux
    // d'accès posés à la main ; les supprimer au retour arrière détruirait un
    // travail d'organisation qu'aucune ré-application ne saurait reconstruire.
    // Une colonne nullable en trop ne coûte rien ; une colonne perdue, si.
  }
}
