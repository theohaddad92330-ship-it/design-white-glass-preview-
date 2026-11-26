import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les entités juridiques d'un même espace (décision D9).
 *
 * Additive de bout en bout : la table est vide, la colonne de rattachement est
 * `NULL` partout, et un espace mono-société — c'est-à-dire tous les espaces
 * existants — se comporte exactement comme avant. Le multi-entité est une
 * capacité qu'on active en déclarant sa première société, pas un changement de
 * modèle imposé à tout le monde.
 *
 * Le rattachement porte sur les MISSIONS, et sur elles seules. C'est là que la
 * question compte : une mission est portée par une société, et c'est elle qui
 * facturera le mois. Le rattacher aussi aux comptes ou aux projets aurait été
 * plus « complet » et plus faux — un même client peut être servi par deux
 * sociétés du groupe, et forcer un choix en amont obligerait à en dupliquer la
 * fiche.
 *
 * `ON DELETE SET NULL` plutôt que `RESTRICT` : une société supprimée par erreur
 * ne doit pas rendre ses missions inaccessibles. Le chemin normal reste
 * l'archivage, qui préserve le rattachement.
 */
export class LegalEntities1789523841096 implements MigrationInterface {
  name = 'LegalEntities1789523841096'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS legal_entities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        name text NOT NULL,
        -- Libre et nullable : une ESN belge, suisse ou canadienne n'a pas de
        -- SIREN, et refuser sa création faute d'un format français serait une
        -- erreur de conception déguisée en validation.
        registration_number text,
        country text,
        archived boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT legal_entities_country_check CHECK (country IS NULL OR char_length(country) = 2)
      )
    `)
    // Deux sociétés du même nom dans le même espace sont une faute de saisie,
    // et elles rendraient tout sélecteur illisible.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS legal_entities_name_unique
        ON legal_entities (workspace_id, lower(name))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS legal_entities_workspace_idx ON legal_entities (workspace_id, archived)
    `)

    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS legal_entity_id uuid
          REFERENCES legal_entities(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS missions_legal_entity_idx ON missions (legal_entity_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS missions_legal_entity_idx`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS legal_entity_id`)
    await queryRunner.query(`DROP INDEX IF EXISTS legal_entities_workspace_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS legal_entities_name_unique`)
    await queryRunner.query(`DROP TABLE IF EXISTS legal_entities`)
  }
}
