import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1615 / #1616 — LE VERSIONNEMENT de la mémoire marché, sur ses quatre tables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE MIGRATION CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré (`grep -E 'checksum|manifest|dataset_version|sha256'` sur le module et
 * le script d'ingestion) : **zéro résultat**. Aucune ligne des 60 067 déjà en
 * base ne dit de quel PACK elle vient, avec quelle version, ni de quelle
 * PÉRIODE d'observation le corpus parle. Impossible de revenir en arrière, de
 * distinguer une ligne d'un ancien pack d'une ligne du dernier, ou de savoir si
 * un fait est encore d'actualité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT » — POURQUOI CHAQUE COLONNE EST NULLABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * 60 067 lignes existent déjà en production et ne portent aucune de ces
 * valeurs. Une migration appliquée en production ne se défait pas : chaque
 * colonne ci-dessous est ajoutée SANS `NOT NULL` et SANS `DEFAULT` autre que
 * l'absence — les lignes déjà là restent lisibles telles quelles, et
 * `dataset_version IS NULL` se lit honnêtement « pack d'origine inconnu »,
 * jamais une valeur inventée. Rien n'est renommé, rien n'est supprimé, aucune
 * contrainte existante n'est rétrécie.
 *
 * ⚠️ `#1616.2` (renommer les 7 tables du pack) est ÉCARTÉ de ce lot : 60 067
 * lignes en production, et un renommage est exactement ce que la porte
 * « ajout seulement » interdit. Il attend sa propre migration de reprise —
 * voir le commentaire de `MARKET_MEMORY_CORPUS_LABEL` dans
 * `market-memory-import.ts`, qui pose la même règle pour l'étiquette.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CINQ COLONNES, ET POURQUOI AUCUNE N'A DE `CHECK`
 * ─────────────────────────────────────────────────────────────────────────────
 * `dataset_version` (text) — la version déclarée par `manifest.json` à la
 *   racine du pack. Aucun format n'est imposé en base : comme `source` sur
 *   `market_company_alias` (#1756), figer un format maintenant refuserait une
 *   valeur future sans qu'aucune décision produit ne l'exige. La forme est
 *   validée AVANT écriture par `validateManifest` (`market-memory-import.ts`),
 *   qui refuse le pack entier si elle est absente ou vide — la porte est
 *   applicative, pas SQL, et c'est le choix déjà fait sur cette table sœur.
 *
 * `source_checksum` (text) — sha256 hex du fichier CSV qui a produit la ligne.
 *   Pour `market_company_signal`, c'est le fichier ANCRE (`02_entreprises.csv`)
 *   qui définit l'identité de la ligne ; les trois fichiers de complétion
 *   (rotation, cessation, connecteurs) ne sont pas repris dans cette colonne
 *   — voir le commentaire de `ingest-market-memory.ts`.
 *
 * `period_start` / `period_end` (text, PAS `date`) — la PÉRIODE couverte par
 *   les observations du corpus, au format `YYYY-MM-DD`. En TEXTE et non en
 *   type `date` Postgres : une colonne `date` lue en SQL brut rend un OBJET
 *   JavaScript, pas une chaîne — un piège déjà payé sur ce dépôt (voir
 *   `MEMORY.md`, « une colonne `date` lue en SQL brut est un OBJET »). Aucune
 *   valeur ordinale n'est nécessaire ici : la colonne n'est jamais comparée en
 *   SQL, seulement affichée à l'audit. ⚠️ C'est une PÉRIODE DE CORPUS, pas une
 *   date d'observation individuelle — la distinction que `market-memory.ts`
 *   (packages/contracts) pose déjà : « aucune date n'est exposée [au produit]…
 *   la période du corpus reste en base pour l'audit ». Ces deux colonnes ne
 *   sortent donc d'aucune lecture produit, au même titre que `corpus_label`.
 *   Pas de `CHECK (period_start <= period_end)` : l'ordre est déjà garanti
 *   AVANT écriture par `validateManifest`, qui refuse tout le pack si la
 *   période est inversée — une seconde porte SQL serait une redondance sans
 *   bénéfice mesuré, pour un coût de lisibilité (GA-177 compterait une
 *   contrainte de plus à justifier).
 *
 * `imported_at` (timestamptz) — la dernière fois qu'un run d'ingestion a
 *   ÉCRIT cette ligne (insertion ou changement de valeur réel). Distincte de
 *   `updated_at` (gérée par l'ORM) : elle ne bouge PAS pour une ligne que le
 *   même pack réimporte à l'identique — voir `classifyUpserts` dans
 *   `market-memory-import.ts`, qui sépare explicitement « écrite » de
 *   « inchangée » avant toute requête SQL.
 *
 * Aucune de ces cinq colonnes ne change le classement `table-scopes.ts` : les
 * quatre tables restent `shared` / `market` (GA-16/GA-65), sans `workspace_id`
 * ni `user_id` — ce sont des colonnes de PROVENANCE du pack, pas de portée.
 */
export class MarketMemoryVersioning1791940000000 implements MigrationInterface {
  public name = 'MarketMemoryVersioning1791940000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'market_company_signal',
      'market_esn_client',
      'market_company_stack',
      'market_ex_esn_at_client',
    ]) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS dataset_version text NULL,
          ADD COLUMN IF NOT EXISTS source_checksum text NULL,
          ADD COLUMN IF NOT EXISTS period_start text NULL,
          ADD COLUMN IF NOT EXISTS period_end text NULL,
          ADD COLUMN IF NOT EXISTS imported_at timestamptz NULL
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Symétrique du `up()` — retire ce qu'il a ajouté, rien de plus. Aucune des
    // cinq colonnes n'est lue par un chemin produit : les retirer ne fait
    // réapparaître aucun défaut d'affichage, seulement perdre l'audit.
    for (const table of [
      'market_company_signal',
      'market_esn_client',
      'market_company_stack',
      'market_ex_esn_at_client',
    ]) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          DROP COLUMN IF EXISTS imported_at,
          DROP COLUMN IF EXISTS period_end,
          DROP COLUMN IF EXISTS period_start,
          DROP COLUMN IF EXISTS source_checksum,
          DROP COLUMN IF EXISTS dataset_version
      `)
    }
  }
}
