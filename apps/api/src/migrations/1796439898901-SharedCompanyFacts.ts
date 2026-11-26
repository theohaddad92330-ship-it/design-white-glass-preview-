import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3989 (suite de #3971 point d) + #2877 (#2385.5 GLOBAL) — LA BASE COMMUNE
 * CAPITALISE SUR TOUT, ANONYMISÉ AU BESOIN.
 * Élargissement daté de c92 (Louis 11/10/2026) : `c94_base_commune_capitalise_tout`.
 *
 * Quatre gestes, tous posés ICI avant le code qui écrit (GA-11 / GA-12) :
 *
 *  · `shared_company_people` — les faits société PARTAGÉS (organigramme,
 *    contacts publics). Ce que Bellum a collecté entre TEL QUEL (`origin =
 *    'bellum'` : nom, poste, profil public, empreintes d'effacement) ; ce
 *    qu'un utilisateur a apporté entre ANONYMISÉ (`origin = 'user'` : le
 *    poste seul). La base le TIENT : `..._user_anonymized_check` refuse une
 *    ligne « user » qui porterait un nom, un profil ou une empreinte — GA-43
 *    relit ce CHECK. Aucune colonne de portée : jamais l'espace qui a
 *    collecté. Pas d'e-mail ni de téléphone : ce lot ne partage pas les
 *    coordonnées (reste nommé au registre, c94).
 *  · `shared_person_erasures` — l'effacement RGPD (c67) propagé : des
 *    empreintes HMAC de portée « base commune », aucune donnée de la personne.
 *  · `shared_message_learning_aggregates` — #2877 GLOBAL : des COMPTES par
 *    signal d'apprentissage des messages, k ≥ 3 espaces, jetons fermés.
 *  · `contacts_source_check` élargi à `shared_base` (une fiche recopiée).
 *
 * Contraintes NOMMÉES (GA-177). RLS activée sans politique : seul le service
 * (clé de service) lit et écrit ; aucun client ne lit ces tables en direct.
 */
export class SharedCompanyFacts1796439898901 implements MigrationInterface {
  public name = 'SharedCompanyFacts1796439898901'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shared_company_people (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scope text NOT NULL,
        company_key text NOT NULL,
        origin text NOT NULL,
        fact_key text NOT NULL,
        full_name text NULL,
        title text NULL,
        linkedin_url text NULL,
        person_fingerprints text[] NOT NULL DEFAULT '{}',
        first_shared_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shared_company_people_scope_check CHECK (scope IN ('live', 'demo')),
        CONSTRAINT shared_company_people_origin_check CHECK (origin IN ('bellum', 'user')),
        CONSTRAINT shared_company_people_company_key_check CHECK (company_key ~ '^(siren_[0-9]{9}|domain_[a-z0-9_]{1,113})$'),
        CONSTRAINT shared_company_people_fact_key_check CHECK (fact_key ~ '^[0-9a-f]{64}$'),
        CONSTRAINT shared_company_people_user_anonymized_check CHECK (origin = 'bellum' OR (full_name IS NULL AND linkedin_url IS NULL AND cardinality(person_fingerprints) = 0)),
        CONSTRAINT shared_company_people_bellum_named_check CHECK (origin = 'user' OR (full_name IS NOT NULL AND cardinality(person_fingerprints) >= 1)),
        CONSTRAINT shared_company_people_fingerprints_check CHECK (cardinality(person_fingerprints) = 0 OR array_to_string(person_fingerprints, ',') ~ '^[0-9a-f]{64}(,[0-9a-f]{64})*$'),
        CONSTRAINT shared_company_people_fact_unique UNIQUE (scope, company_key, fact_key)
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS shared_company_people_company_idx ON shared_company_people (scope, company_key)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS shared_company_people_fingerprints_idx ON shared_company_people USING gin (person_fingerprints)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shared_person_erasures (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        erased_at timestamptz NOT NULL DEFAULT now(),
        fingerprints text[] NOT NULL,
        CONSTRAINT shared_person_erasures_fingerprints_check CHECK (cardinality(fingerprints) >= 1 AND array_to_string(fingerprints, ',') ~ '^[0-9a-f]{64}(,[0-9a-f]{64})*$')
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS shared_person_erasures_fingerprints_idx ON shared_person_erasures USING gin (fingerprints)`,
    )
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shared_message_learning_aggregates (
        scope text NOT NULL,
        signal text NOT NULL,
        count integer NOT NULL,
        contributing_workspaces integer NOT NULL,
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (scope, signal),
        CONSTRAINT shared_message_learning_aggregates_scope_check CHECK (scope IN ('live', 'demo')),
        CONSTRAINT shared_message_learning_aggregates_signal_check CHECK (signal IN ('approved_without_edit', 'approved_after_edit', 'rejected', 'sent', 'replied', 'bounced', 'wrong_fact', 'wrong_cta', 'wrong_persona')),
        CONSTRAINT shared_message_learning_aggregates_count_check CHECK (count >= 0),
        CONSTRAINT shared_message_learning_aggregates_k_check CHECK (contributing_workspaces >= 3)
      )
    `)
    for (const table of ['shared_company_people', 'shared_person_erasures', 'shared_message_learning_aggregates']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
    // GA-11/12 — la source d'une fiche recopiée depuis la base commune, AVANT le
    // code qui l'écrit. Liste réécrite en entier, comme `1796436688517`, à partir de la dernière déclarée (`1796438093817`, qui ajoute `job_posting`).
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact', 'demo', 'hunter', 'lusha', 'import', 'crm', 'meeting', 'kaspr', 'fullenrich', 'job_posting', 'shared_base'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
