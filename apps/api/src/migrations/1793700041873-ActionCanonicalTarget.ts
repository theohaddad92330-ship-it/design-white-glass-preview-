import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2123.1-.10 — une action du plan vise un OBJET CANONIQUE, plus du texte
 * flottant.
 *
 * Le Plan d'action listait « rappeler le DSI » sans que rien ne mène au
 * contact, au projet ou au besoin ; trois mécanismes portaient le mot
 * « action » sans être le même objet (`agent_docs/plan-un-seul-chemin-de-tache.md`).
 * `action_plan_items` est celui qui survit — c'est une LIGNE, elle est déjà lue
 * par cinq appelants —, donc c'est ici que l'objet visé s'écrit.
 *
 *  - `target_kind` — l'une des huit natures (`ACTION_TARGET_KINDS`).
 *  - `target_id` — l'identifiant dans SON référentiel. TEXT et non UUID :
 *    une tâche CRM et une clé de vérification n'en sont pas.
 *  - `target_label` — ce que l'humain lit, stocké avec l'action pour qu'elle
 *    reste lisible quand l'objet visé a été archivé.
 *
 * ⚠️ **Ajout seulement** — la migration précède le code qui écrit ces valeurs
 * (GA-11 / GA-12). Les colonnes sont NULLABLES : les lignes déjà écrites n'ont
 * pas d'objet et ne doivent pas devenir illisibles. Le `CHECK` de paire
 * interdit la moitié d'un objet (une nature sans identifiant), qui serait une
 * tâche flottante déguisée. Chaque énoncé est idempotent.
 *
 * ⚠️ L'horodatage est une VRAIE milliseconde, pas un nombre rond : trois
 * collisions d'affilée sont arrivées parce que chacun choisit à la main la
 * même centaine de milliards, si bien que deux branches fusionnées en
 * parallèle prennent la même valeur — et TypeORM ordonne par cet horodatage,
 * avec un tri STABLE, donc une paire en collision s'exécute dans l'ordre de
 * chargement des fichiers, qui dépend du système de fichiers. Renommée à la
 * fusion (`1793700000000` → `1793700041873`, `migrations.spec.ts` rouge) :
 * elle n'était encore partie nulle part, donc son nom n'est la clé d'aucune
 * ligne de `_migrations` en production.
 */
export class ActionCanonicalTarget1793700041873 implements MigrationInterface {
  public name = 'ActionCanonicalTarget1793700041873'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS target_kind TEXT`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS target_id TEXT`)
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS target_label TEXT`)

    await queryRunner.query(
      `ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_target_kind_check`,
    )
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_target_kind_check
         CHECK (target_kind IS NULL OR target_kind IN ('contact', 'meeting', 'crm_task', 'sequence', 'project', 'need', 'partner', 'verification'))`,
    )

    // Une nature sans identifiant serait une tâche flottante déguisée : la
    // carte afficherait « contact » sans pouvoir ouvrir personne.
    await queryRunner.query(
      `ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_target_pair_check`,
    )
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_target_pair_check
         CHECK ((target_kind IS NULL AND target_id IS NULL) OR (target_kind IS NOT NULL AND target_id IS NOT NULL))`,
    )

    // « Toutes les actions qui visent ce contact » reste un balayage ciblé.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS action_plan_items_target_idx
         ON action_plan_items (target_kind, target_id) WHERE target_kind IS NOT NULL`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
