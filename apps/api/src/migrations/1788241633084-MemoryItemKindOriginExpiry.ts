import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * MemoryItem complet (restitution V2 §20 — « les objets à unifier »).
 *
 * Le rapport exige pour la mémoire un contenu minimum : *fait, préférence,
 * correction, origine, portée, expiration*. `memory_pinned_facts` ne portait que
 * le fait (`fact`) et sa portée (`workspace_id` / `account_id`) : tout épinglage
 * était un FAIT, sans dire d'où il venait, et **vrai pour toujours** — c'est
 * précisément le défaut relevé par l'audit.
 *
 * Trois colonnes ferment l'écart :
 *
 * - `kind`       — la NATURE : `fact` (constat) | `preference` (façon de
 *                  travailler) | `correction` (ce que le copilote doit cesser de
 *                  faire). Défaut `fact` = ce qu'était implicitement chaque ligne
 *                  déjà en base : aucune ligne existante ne change de sens.
 * - `origin`     — la PROVENANCE : `manual` (épinglé à la main) | `copilot`
 *                  (retenu d'une réponse) | `analysis` (dérivé d'un dossier).
 *                  Défaut `manual` : les lignes existantes viennent toutes de la
 *                  carte « Mémoire », le seul chemin d'écriture existant.
 * - `expires_at` — jusqu'à QUAND l'élément vaut. NULL = sans échéance (le
 *                  comportement historique, conservé). Daté = la lecture cesse de
 *                  l'injecter dans le contexte du copilote une fois la date
 *                  passée (`MemoryService.listFacts`).
 *
 * Additive + idempotente (`ADD COLUMN IF NOT EXISTS`, contraintes créées sous
 * garde `pg_constraint`) : re-run sûr, aucune donnée réécrite, AUCUN backfill —
 * on ne devine ni l'origine ni l'échéance d'un fait déjà épinglé.
 */
export class MemoryItemKindOriginExpiry1788241633084 implements MigrationInterface {
  public name = 'MemoryItemKindOriginExpiry1788241633084'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'fact'`,
    )
    await queryRunner.query(
      `ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual'`,
    )
    await queryRunner.query(`ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS expires_at timestamptz`)

    // `ADD CONSTRAINT` n'a pas d'`IF NOT EXISTS` en Postgres : garde explicite,
    // comme les `CREATE POLICY` de la migration d'origine (`1784900700000`).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'memory_pinned_facts_kind_check'
        ) THEN
          ALTER TABLE memory_pinned_facts
            ADD CONSTRAINT memory_pinned_facts_kind_check
            CHECK (kind IN ('fact', 'preference', 'correction'));
        END IF;
      END $$;
    `)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'memory_pinned_facts_origin_check'
        ) THEN
          ALTER TABLE memory_pinned_facts
            ADD CONSTRAINT memory_pinned_facts_origin_check
            CHECK (origin IN ('manual', 'copilot', 'analysis'));
        END IF;
      END $$;
    `)

    // La lecture du copilote filtre les expirés : l'index sert ce prédicat sans
    // toucher aux lignes sans échéance (l'écrasante majorité).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_pinned_facts_expires_at_idx
        ON memory_pinned_facts (expires_at)
        WHERE expires_at IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
