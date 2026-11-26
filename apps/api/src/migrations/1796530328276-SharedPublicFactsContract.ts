import type { MigrationInterface, QueryRunner } from 'typeorm'
import {
  SHARED_PUBLIC_FACT_KEY_PATTERN,
  SHARED_PUBLIC_FACT_WORKSPACE_MARKERS,
  SHARED_PUBLIC_FACTS_STORE,
} from '@bellum/contracts'

/**
 * #3989 (suite de #3971 point d) — LA BASE COMMUNE DES FAITS SOCIÉTÉ PUBLICS,
 * TENUE EN SQL.
 *
 * `SourceCachePublicFactsBoundary` (#4067) a borné les NATURES (registre,
 * annonces légales, marchés publics, offres, presse) et refusé les familles
 * privées d'un espace. Restaient trois règles tenues par le seul code IA
 * (`public_facts.py`) — elles passent ici en SQL, avant le code qui les écrit
 * (GA-11 / GA-12), sur la seule famille `public_facts` :
 *
 *  · `..._company_key` — la clé est une ENTREPRISE (SIREN, sinon domaine) suivie
 *    d'un JETON fermé : jamais un identifiant d'espace ou de compte, jamais un
 *    texte libre saisi par un espace ;
 *  · `..._collected_at` — un fait garde sa date de collecte (`collectedAt`) et
 *    ses lignes (`rows`). `COALESCE` : un CHECK qui s'évalue à NULL PASSE —
 *    sans lui, une ligne sans date entrait (prouvé sur PostgreSQL 16) ;
 *  · `..._no_workspace_marker` — aucune trace de l'espace ni de l'utilisateur
 *    qui a déclenché la collecte, à AUCUNE profondeur du fait.
 *
 * Ajout seulement, `NOT VALID` : les lignes déjà écrites ne sont ni relues ni
 * touchées (aucun risque de bloquer le déploiement) ; toute écriture NEUVE est
 * vérifiée. Le code IA s'arrête avant (`cached_fact` rend la collecte sans la
 * ranger) ; l'écriture du cache est « au mieux », un refus SQL n'échoue donc
 * jamais une analyse. RLS déjà activée sans politique (`1796461934273`).
 */
const { table, family } = SHARED_PUBLIC_FACTS_STORE

const WORKSPACE_MARKER_PATH = `strict $.** ? (${SHARED_PUBLIC_FACT_WORKSPACE_MARKERS.map(m => `exists(@.${m})`).join(' || ')})`

const CONSTRAINTS: ReadonlyArray<readonly [string, string]> = [
  ['source_cache_public_fact_company_key', `company_key ~ '${SHARED_PUBLIC_FACT_KEY_PATTERN}'`],
  [
    'source_cache_public_fact_collected_at',
    `(COALESCE(jsonb_typeof(payload->'collectedAt'), '') = 'string' AND COALESCE(jsonb_typeof(payload->'rows'), '') = 'array')`,
  ],
  ['source_cache_public_fact_no_workspace_marker', `NOT jsonb_path_exists(payload, '${WORKSPACE_MARKER_PATH}')`],
]

export class SharedPublicFactsContract1796530328276 implements MigrationInterface {
  public name = 'SharedPublicFactsContract1796530328276'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, rule] of CONSTRAINTS) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`)
      await queryRunner.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (source <> '${family}' OR ${rule}) NOT VALID`,
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of CONSTRAINTS) {
      await queryRunner.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`)
    }
  }
}
