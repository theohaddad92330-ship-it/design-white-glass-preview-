import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2948 (#2329.19/.22/.23) — mobilité FINE : fréquence sur site, international,
 * restrictions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `1789579634812-TalentMobilityPreferences` posait déjà `mobility_zones`
 * (départements/régions FRANÇAISES), `remote_preference` et `travel_acceptance`
 * (des déplacements PONCTUELS, ailleurs qu'au domicile). Aucun des trois ne
 * répond à « à quelle fréquence est-elle attendue sur SITE client » (une
 * question distincte de « accepte-t-elle de se déplacer »), ni à « accepte-t-elle
 * une mission à l'étranger » (`mobility_zones` ne contient que du national), ni
 * à une restriction NOMMÉE (permis, découché, garde d'enfant…) — trois colonnes
 * absentes, mesurées sur `consultant.entity.ts` avant ce lot.
 *
 * Domicile (#2329.17) N'EST PAS repris ici : `consultants.location`
 * (`1796001541963-ConsultantLocation`) le porte déjà — déjà là, pas un manque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `text` SANS CHECK, MÊME PATRON QUE LES DEUX COLONNES VOISINES
 * ─────────────────────────────────────────────────────────────────────────────
 * `remote_preference`/`travel_acceptance` sont `text nullable` SANS contrainte
 * SQL, validées côté application (`talentMobilitySchema`) — c'est délibéré, pas
 * un oubli (voir leur commentaire dans `consultant.entity.ts`). `site_frequency`
 * suit le même patron : ajouter une valeur à `SITE_FREQUENCIES` ne demandera
 * jamais de migration.
 *
 * TOUT est `nullable` sans défaut : `null` = « on n'a pas demandé », jamais une
 * valeur inventée (§8.2).
 */
export class ConsultantMobilityFine20260927181100 implements MigrationInterface {
  name = 'ConsultantMobilityFine20260927181100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS site_frequency text NULL,
        ADD COLUMN IF NOT EXISTS international_mobility boolean NULL,
        ADD COLUMN IF NOT EXISTS mobility_restrictions text NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        DROP COLUMN IF EXISTS mobility_restrictions,
        DROP COLUMN IF EXISTS international_mobility,
        DROP COLUMN IF EXISTS site_frequency
    `)
  }
}
