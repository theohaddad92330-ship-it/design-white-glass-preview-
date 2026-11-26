import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Socle du CRM/ATS natif (T0) — la provenance, le journal et les notes.
 *
 * Trois tables et deux colonnes, dans cet ordre de raison :
 *
 * 1. `field_provenance` — QUI a écrit CE champ. C'est le garde-fou qui rend la
 *    saisie humaine survivante au run d'analyse suivant. Sans lui, éditer une
 *    fiche est un piège : la correction disparaît la nuit suivante et
 *    l'utilisateur cesse de corriger. On le livre DANS la tranche qui ouvre
 *    l'édition, jamais après.
 *
 * 2. `record_field_audit` — append-only : ancienne valeur, nouvelle valeur,
 *    auteur, source. Répond à « qui a changé ça ? », la première question posée
 *    dès qu'une équipe partage une base.
 *
 * 3. `notes` — polymorphe (`entity_type` + `entity_id`), datée, empilable.
 *    `contacts.note` était UNE chaîne écrasée à chaque saisie : deux commerciaux
 *    sur le même contact s'effaçaient l'un l'autre, et une information non datée
 *    ne vaut rien (« le budget est gelé » — depuis quand ?). Les notes existantes
 *    sont reprises comme première note ; la colonne reste en place, plus lue par
 *    l'application, parce qu'aucune migration ne doit détruire du texte écrit à
 *    la main.
 *
 * Plus : `contacts.deleted_at` (suppression réversible — un contact effacé par
 * erreur emporte son historique) et `accounts.phone` / `accounts.address`, deux
 * champs de fiche qu'aucune collecte ne remplit et que personne ne pouvait
 * saisir.
 */
export class CrmAtsSocle1789301274613 implements MigrationInterface {
  public name = 'CrmAtsSocle1789301274613'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS field_provenance (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        field text NOT NULL,
        source text NOT NULL,
        confidence numeric(4, 3),
        actor_id uuid,
        observed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT field_provenance_source_check CHECK (source IN ('human', 'connector', 'pipeline', 'model'))
      )
    `)
    // Une seule provenance courante par champ : l'écriture est un upsert, et
    // deux lignes concurrentes rendraient l'arbitre non déterministe.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS field_provenance_unique
        ON field_provenance (entity_type, entity_id, field)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS field_provenance_entity_idx ON field_provenance (entity_type, entity_id)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS record_field_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        field text NOT NULL,
        old_value text,
        new_value text,
        source text NOT NULL,
        actor_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT record_field_audit_source_check CHECK (source IN ('human', 'connector', 'pipeline', 'model'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS record_field_audit_entity_idx
        ON record_field_audit (entity_type, entity_id, created_at DESC)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS record_field_audit_workspace_idx
        ON record_field_audit (workspace_id, created_at DESC)
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid,
        user_id uuid NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid NOT NULL,
        body text NOT NULL,
        pinned boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS notes_entity_idx ON notes (entity_type, entity_id, created_at DESC)
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS notes_workspace_idx ON notes (workspace_id)`)

    // Reprise des notes de contact existantes. `WHERE NOT EXISTS` rend la
    // migration rejouable : une reprise partielle ne duplique rien.
    await queryRunner.query(`
      INSERT INTO notes (workspace_id, user_id, entity_type, entity_id, body, created_at, updated_at)
      SELECT c.workspace_id, c.user_id, 'contact', c.id, c.note, c.updated_at, c.updated_at
      FROM contacts c
      WHERE c.note IS NOT NULL
        AND btrim(c.note) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM notes n WHERE n.entity_type = 'contact' AND n.entity_id = c.id
        )
    `)

    await queryRunner.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS deleted_at timestamptz`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS address text`)

    // RLS en défense en profondeur, comme les autres tables métier (l'API tourne
    // en service role et filtre elle-même sur le workspace).
    for (const table of ['field_provenance', 'record_field_audit', 'notes']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS address`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS phone`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN IF EXISTS deleted_at`)
    await queryRunner.query(`DROP TABLE IF EXISTS notes`)
    await queryRunner.query(`DROP TABLE IF EXISTS record_field_audit`)
    await queryRunner.query(`DROP TABLE IF EXISTS field_provenance`)
  }
}
