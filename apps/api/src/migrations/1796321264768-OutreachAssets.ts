import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `outreach_assets` — le catalogue de la bibliothèque d'assets outreach (#2838,
 * épopée du 25/09/2026), avant tout gate d'envoi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `asset` : zéro occurrence dans `apps/api/src` et `packages/contracts/src`
 * avant ce lot — recherche de code confirmée sur `contacts`/`outreach-*`. Le
 * plus proche est `bellum_icebreaker.py` RÈGLE 6 (« Ne joins ni CV ni plaquette
 * à un premier message sans contexte »), qui GATE le premier message sans
 * modéliser aucun objet asset réutilisable. Construire #2372.6 (« asset utile
 * annoncé puis envoyé seulement après intérêt confirmé ») suppose ce catalogue
 * d'abord — l'écrire sans lui produirait un gate qui ne retient rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DE FICHIER ICI, À DESSEIN (comme `need_documents` à l'origine)
 * ─────────────────────────────────────────────────────────────────────────────
 * `need_documents` a d'abord existé SANS `storage_object_id`
 * (`1790974000001-NeedDocuments`) avant qu'un lot dédié
 * (`1790990000002-StoredFileLinks`) ne l'ajoute avec le stockage. Même geste
 * ici : la colonne et le domaine de stockage (`storage_objects_domain_check`)
 * n'ont aucun appelant tant que l'écran de dépôt de fichier n'existe pas —
 * les ajouter maintenant serait du code (une colonne, une valeur d'énumération)
 * que personne n'écrit ni ne lit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `category` / `usage_rights` en `CHECK`, pas en enum PostgreSQL (GA-08) : un
 * enum PostgreSQL ne perd jamais de valeur et n'en insère jamais au milieu,
 * quand un `CHECK` se réécrit dans une migration ultérieure sans toucher aux
 * lignes existantes. Les deux valeurs sont la copie exacte de
 * `OUTREACH_ASSET_CATEGORIES` / `OUTREACH_ASSET_USAGE_RIGHTS`
 * (`packages/contracts/src/schemas/outreach-asset.ts`), gardée par GA-12
 * (`check-constraints-cover-enums.spec.ts`).
 */
export class OutreachAssets1796321264768 implements MigrationInterface {
  public name = 'OutreachAssets1796321264768'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outreach_assets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        title text NOT NULL,
        description text,
        category text NOT NULL,
        usage_rights text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outreach_assets_category_check
          CHECK (category IN ('case_study', 'company_brochure', 'resume', 'other')),
        CONSTRAINT outreach_assets_usage_rights_check
          CHECK (usage_rights IN ('always', 'after_interest_confirmed'))
      )
    `)
    // La lecture du catalogue est TOUJOURS bornée par espace (GA-46) : un index
    // sur `workspace_id` seul, ordonné par création, comme `library_items`.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outreach_assets_workspace_idx
        ON outreach_assets (workspace_id, created_at ASC)
    `)
    await queryRunner.query(`
      COMMENT ON TABLE outreach_assets IS
        'Le catalogue de la bibliotheque d''assets outreach (#2838) - metadonnees et droits d''usage, avant tout gate d''envoi. Pas de fichier rattache dans ce lot : voir le docblock de la migration.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outreach_assets`)
  }
}
