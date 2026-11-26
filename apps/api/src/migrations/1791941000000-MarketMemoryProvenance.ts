import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1615.4 / #1616.3 / #1603.5 — TROIS COLONNES DE PROVENANCE DE PLUS, sur les
 * mêmes quatre tables que `1791940000000-MarketMemoryVersioning`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE `1791940000000-MarketMemoryVersioning` A DÉJÀ FAIT, ET CE QUI RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette migration antérieure (#1615/#1616, commit `eebd8f5e4`, 09/09/2026) a
 * déjà ajouté `dataset_version`, `source_checksum`, `period_start`,
 * `period_end`, `imported_at`. Un balayage daté du 11/09 qui affirmerait
 * qu'AUCUNE ligne ne porte de version ou de période serait donc FAUX contre
 * cet arbre — voir `market-memory-import.ts` (`MARKET_MEMORY_CORPUS_LABEL`) et
 * son historique.
 *
 * Ce qui manquait encore, mesuré (`grep -E 'methodology_version|source_family|
 * source_artifact_uri' apps/api/src/database/entities/market-*.entity.ts` →
 * zéro résultat avant cette migration) et demandé explicitement par #1616.3 :
 * `methodology_version`, `source_family`. Et par #1615.4 : `source_artifact_uri`
 * (l'URI/lien Drive de l'artefact source, distincte de `source_checksum` qui
 * est l'empreinte du FICHIER, pas l'endroit d'où il vient).
 *
 * ⚠️ #1616.3 demandait AUSSI `evidence_count` et `coverage`. Elles ne sont PAS
 * ajoutées ici, et c'est un choix délibéré, pas un oubli :
 *
 *  - `evidence_count` EXISTE DÉJÀ sous d'autres noms, à un seul endroit
 *    chacun (GA-26) : `paths_total` sur `market_company_signal`, `persons`
 *    sur les trois tables de liens (`market_esn_client`,
 *    `market_company_stack`, `market_ex_esn_at_client`). Ouvrir une SECONDE
 *    colonne portant la même donnée créerait exactement le défaut que ce
 *    dépôt nomme « deux dérivations qui divergent » — laquelle des deux
 *    ferait foi le jour où elles ne seraient plus égales ?
 *  - `coverage` est un TAUX qui doit se lire « ce qu'on SAIT », jamais « ce
 *    que le marché FAIT » (doctrine `c65_couverture_nest_pas_un_fait_de_
 *    marche`, GA-259) : le stocker comme une colonne BRUTE, écrite une fois à
 *    l'import et relue telle quelle, est précisément le risque que la
 *    doctrine nomme — une valeur figée au jour de l'import se lirait comme un
 *    fait de marché permanent. `MarketMemoryService` calcule déjà ce type de
 *    taux À LA LECTURE (`MARKET_MEMORY_MIN_PATHS`) ; un jour où un taux de
 *    couverture par ligne serait nécessaire, il devrait être recalculé au
 *    même endroit, pas figé ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT » — même raisonnement que la migration précédente
 * ─────────────────────────────────────────────────────────────────────────────
 * NULLABLE, sans `DEFAULT` : les 60 067 lignes déjà en base (et celles déjà
 * écrites par `MarketMemoryVersioning`) n'en portent aucune, et `NULL` se lit
 * honnêtement « information non déclarée par ce pack », jamais une valeur
 * inventée. Aucune de ces trois colonnes ne sort d'une lecture produit — même
 * statut que `corpus_label`, `dataset_version`, `period_start`/`period_end`.
 */
export class MarketMemoryProvenance1791941000000 implements MigrationInterface {
  public name = 'MarketMemoryProvenance1791941000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'market_company_signal',
      'market_esn_client',
      'market_company_stack',
      'market_ex_esn_at_client',
    ]) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS methodology_version text NULL,
          ADD COLUMN IF NOT EXISTS source_family text NULL,
          ADD COLUMN IF NOT EXISTS source_artifact_uri text NULL
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Symétrique du `up()`. Aucune des trois colonnes n'est lue par un chemin
    // produit : les retirer ne fait réapparaître aucun défaut d'affichage,
    // seulement perdre un peu d'audit.
    for (const table of [
      'market_company_signal',
      'market_esn_client',
      'market_company_stack',
      'market_ex_esn_at_client',
    ]) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          DROP COLUMN IF EXISTS source_artifact_uri,
          DROP COLUMN IF EXISTS source_family,
          DROP COLUMN IF EXISTS methodology_version
      `)
    }
  }
}
