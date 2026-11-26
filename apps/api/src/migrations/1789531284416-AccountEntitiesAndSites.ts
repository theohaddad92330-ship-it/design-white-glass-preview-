import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La granularité Compte / Entité / Site (PDF 2 §2).
 *
 * Le document appelle ce point « la source d'erreur n°1 quand on code un CRM
 * pour une ESN » et le déclare déjà présent dans le dépôt. Il ne l'était pas :
 * `accounts` existait seul, `contacts.entity` était un LIBELLÉ libre sans clé,
 * un projet ne connaissait que le compte, et une mission aucun lieu.
 *
 * Ce que l'aplatissement coûtait concrètement : impossible de dire qu'une BU
 * est accessible et l'autre non (donc « verrouillé chez la DSI Groupe, ouvert
 * chez Renouvelables » ne s'écrivait nulle part), et le matching sur la
 * mobilité d'un consultant se faisait contre le siège social au lieu du site
 * où la mission se déroule.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `account_entities` n'est PAS `legal_entities`
 * ─────────────────────────────────────────────────────────────────────────
 * `legal_entities` (migration 1789523841096) porte les sociétés DE L'ESN, pour
 * savoir laquelle facture une mission. Celle-ci porte les subdivisions du
 * CLIENT. Les ranger dans la même table obligerait chaque lecture à filtrer un
 * propriétaire étranger, et un jour quelqu'un oublierait le filtre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Pourquoi `sites` n'est pas un miroir du registre
 * ─────────────────────────────────────────────────────────────────────────
 * Les établissements d'un compte sont déjà connus : ils vivent dans
 * `raw_analysis.branches`, et Capgemini en compte environ 1180. Les
 * matérialiser tous fabriquerait un millier de lignes dont personne ne se
 * servirait, la plupart purement administratives. Un `site` est donc une
 * implantation que l'ESN RETIENT — parce qu'elle y staffe, y va, y a une
 * mission. L'onglet Sites continue de lire le registre ; il propose d'en
 * retenir un. On propose, on ne matérialise pas d'office.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « Périmètre non déterminé »
 * ─────────────────────────────────────────────────────────────────────────
 * La règle du §2 est qu'un contact appartient à une entité, JAMAIS directement
 * à un compte. Un contact dont on ignore la division n'est donc pas laissé
 * sans rattachement : il rejoint l'entité par défaut du compte, marquée
 * `is_default`. Le libellé stocké est français parce qu'un lecteur SQL doit
 * comprendre la ligne ; l'écran, lui, affiche la traduction de sa langue.
 */
export class AccountEntitiesAndSites1789531284416 implements MigrationInterface {
  name = 'AccountEntitiesAndSites1789531284416'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_entities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        name text NOT NULL,
        kind text NOT NULL DEFAULT 'unknown',
        siren text,
        domain text,
        is_default boolean NOT NULL DEFAULT false,
        rank1_incumbent text NOT NULL DEFAULT 'unknown',
        rank1_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT account_entities_kind_check CHECK (kind IN ('bu','subsidiary','division','unknown')),
        CONSTRAINT account_entities_rank1_check CHECK (rank1_incumbent IN ('yes','no','unknown'))
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS account_entities_account_idx ON account_entities (account_id)`)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS account_entities_workspace_idx ON account_entities (workspace_id)`,
    )
    // Deux entités du même nom sur un compte seraient deux vérités du même
    // périmètre. La casse ne compte pas : « TF1 PUB » et « TF1 Pub » sont la
    // même division, et les garder toutes les deux rendrait le rattachement
    // d'un contact indéterministe.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_entities_unique_name
        ON account_entities (account_id, lower(name))
    `)
    // Une seule entité par défaut par compte : deux « périmètre non déterminé »
    // se partageraient les contacts orphelins sans que rien ne le dise.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_entities_single_default
        ON account_entities (account_id) WHERE is_default
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        entity_id uuid REFERENCES account_entities(id) ON DELETE SET NULL,
        label text NOT NULL,
        city text,
        postal_code text,
        country text,
        siret text,
        headcount integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT sites_headcount_check CHECK (headcount IS NULL OR headcount >= 0)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS sites_account_idx ON sites (account_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS sites_workspace_idx ON sites (workspace_id)`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS sites_unique_label ON sites (account_id, lower(label))
    `)

    // Les trois rattachements du §2. Tous NULLABLE et tous `ON DELETE SET NULL` :
    // retirer une entité ne doit jamais emporter le contact, le projet ou la
    // mission avec elle — perdre une division ne fait pas disparaître les gens.
    await queryRunner.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS entity_id uuid
        REFERENCES account_entities(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS contacts_entity_idx ON contacts (entity_id)`)
    await queryRunner.query(`
      ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS entity_id uuid
        REFERENCES account_entities(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS opportunities_entity_idx ON opportunities (entity_id)`)
    await queryRunner.query(`
      ALTER TABLE missions ADD COLUMN IF NOT EXISTS site_id uuid
        REFERENCES sites(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS missions_site_idx ON missions (site_id)`)

    // ─── Reprise ────────────────────────────────────────────────────────────
    // Les libellés déjà saisis dans `contacts.entity` deviennent des entités.
    // On ne fabrique QUE ce que la donnée porte : aucun compte ne reçoit
    // d'entité qu'un contact ne nommait pas.
    await queryRunner.query(`
      INSERT INTO account_entities (workspace_id, account_id, name)
      SELECT DISTINCT ON (c.account_id, lower(trim(c.entity)))
             c.workspace_id, c.account_id, trim(c.entity)
      FROM contacts c
      WHERE c.account_id IS NOT NULL
        AND NULLIF(trim(c.entity), '') IS NOT NULL
      ORDER BY c.account_id, lower(trim(c.entity)), c.created_at
      ON CONFLICT DO NOTHING
    `)
    // L'entité par défaut n'est créée que pour les comptes qui ont réellement
    // un contact sans division connue. Un compte dont tous les contacts sont
    // rattachés n'a pas besoin d'un « périmètre non déterminé » vide.
    await queryRunner.query(`
      INSERT INTO account_entities (workspace_id, account_id, name, is_default)
      SELECT DISTINCT ON (c.account_id)
             c.workspace_id, c.account_id, 'Périmètre non déterminé', true
      FROM contacts c
      WHERE c.account_id IS NOT NULL
        AND NULLIF(trim(c.entity), '') IS NULL
      ORDER BY c.account_id, c.created_at
      ON CONFLICT DO NOTHING
    `)
    await queryRunner.query(`
      UPDATE contacts c SET entity_id = e.id
      FROM account_entities e
      WHERE e.account_id = c.account_id
        AND c.entity_id IS NULL
        AND (
          (NULLIF(trim(c.entity), '') IS NOT NULL AND lower(e.name) = lower(trim(c.entity)))
          OR (NULLIF(trim(c.entity), '') IS NULL AND e.is_default)
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS site_id`)
    await queryRunner.query(`ALTER TABLE opportunities DROP COLUMN IF EXISTS entity_id`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS entity_id`)
    await queryRunner.query(`DROP TABLE IF EXISTS sites`)
    await queryRunner.query(`DROP TABLE IF EXISTS account_entities`)
  }
}
