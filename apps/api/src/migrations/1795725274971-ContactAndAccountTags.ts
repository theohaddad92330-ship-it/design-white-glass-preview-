import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2159.26 (décision Louis du 19/09/2026) — LES ÉTIQUETTES des contacts et des
 * comptes, alimentées à l'import, affichées sur les fiches, filtrables en liste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FORMAT : `text[]` NON NULL, UNE GRAPHIE PAR ÉTIQUETTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un tableau de texte, pas une table de jointure : une étiquette n'a ni
 * propriétaire, ni couleur, ni date — c'est un mot posé sur une fiche. `NOT NULL
 * DEFAULT '{}'` : « aucune étiquette » vaut `{}`, jamais `NULL` — un filtre
 * `tags @> ARRAY[…]` n'a alors aucun cas particulier à oublier.
 *
 * #2159.26 — graphie de la première saisie (décision Louis 19/09, « Casse
 * d'origine ») : cette migration N'EST PAS déployée, elle est corrigée EN
 * PLACE plutôt que d'en ajouter une seconde. La contrainte `<table>_tags_check`
 * N'EXIGE PLUS `lower(tags::text) = tags::text` — « SAP » reste « SAP » en
 * base, exactement la graphie que `normalizeTag`
 * (`packages/contracts/src/schemas/tags.ts`) a retenue. Elle garde : le
 * plafond (20), l'absence de vide et de `NULL`, la longueur par étiquette (40)
 * et l'absence de doublon insensible à la casse — ces deux derniers ne
 * s'écrivent pas en ligne dans un `CHECK` (Postgres interdit les subqueries et
 * les fonctions à résultat multiple dans une contrainte), donc `bellum_tags_valid`
 * les porte, en fonction IMMUTABLE, créée AVANT les contraintes qui l'appellent
 * (GA-11/GA-12 : la contrainte est élargie AVANT le code qui écrit).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RLS : RIEN À AJOUTER, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────────
 * Une COLONNE hérite des politiques de sa ligne : qui voit le contact voit ses
 * étiquettes, qui ne le voit pas ne les voit pas. Une table à part aurait
 * demandé sa propre politique — et une politique oubliée est une fuite.
 *
 * Index GIN : le filtre de liste est un `@>`, que le GIN sert directement.
 *
 * Horodatage : l'heure réelle, décalée APRÈS le maximum d'origin/main
 * (`1795716657316`) pour rester croissant — les deux tables existent depuis
 * l'origine, aucune migration plus récente n'en dépend.
 */
export class ContactAndAccountTags1795725274971 implements MigrationInterface {
  name = 'ContactAndAccountTags1795725274971'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // #2159.26 — fonction partagée par les deux contraintes, posée UNE fois,
    // AVANT elles. `length(t) > 40` tient la longueur par étiquette ;
    // `count(DISTINCT lower(t)) = cardinality(tags)` tient l'absence de
    // doublon insensible à la casse (« SAP » et « sap » ne peuvent pas
    // cohabiter sur une même fiche).
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION bellum_tags_valid(tags text[])
      RETURNS boolean
      LANGUAGE sql
      IMMUTABLE
      PARALLEL SAFE
      AS $$
        SELECT
          NOT EXISTS (SELECT 1 FROM unnest(tags) t WHERE length(t) > 40)
          AND (SELECT count(DISTINCT lower(t)) FROM unnest(tags) t) = cardinality(tags);
      $$;
    `)

    for (const table of ['contacts', 'accounts']) {
      await queryRunner.query(`
        ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
        ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_tags_check;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_tags_check CHECK (cardinality(tags) <= 20
          AND array_position(tags, '') IS NULL
          AND array_position(tags, NULL) IS NULL
          AND bellum_tags_valid(tags));
        CREATE INDEX IF NOT EXISTS idx_${table}_tags ON ${table} USING gin (tags);
      `)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['contacts', 'accounts']) {
      await queryRunner.query(`
        DROP INDEX IF EXISTS idx_${table}_tags;
        ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_tags_check;
        ALTER TABLE ${table} DROP COLUMN IF EXISTS tags;
      `)
    }
    // La fonction n'est droppable qu'APRÈS les contraintes qui la référencent.
    await queryRunner.query(`DROP FUNCTION IF EXISTS bellum_tags_valid(text[]);`)
  }
}
