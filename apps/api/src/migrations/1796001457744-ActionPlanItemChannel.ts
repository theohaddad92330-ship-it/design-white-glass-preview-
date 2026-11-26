import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2395.4/#2395.9 — le CANAL déjà écrit par le plan de Laura pour chaque
 * action devient une colonne de `action_plan_items`, et RATTRAPE les lignes
 * déjà écrites.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────
 * `apps/ia/app/models/outputs/plan.py` écrit déjà `channel` (linkedin | email
 * | phone | event | meeting | content) et `expectedOutcome` sur CHAQUE action
 * du plan généré. `ActionPlanItemsService.seedFromPlan` — l'écrivain qui
 * matérialise la quasi-totalité des lignes de `action_plan_items` — ne lisait
 * QUE `action`/`text` (le libellé) et jetait les deux autres champs : un
 * correctif de LECTURE inerte, personne ne posait la donnée à l'écriture.
 * Mesuré en recette prod le 24/09/2026 (f9f23f887, `GET
 * /action-os/actions?limit=250`) : 0/213 actions avec `type`, 0/213 avec
 * `expected_outcome`. `expected_outcome` avait déjà sa colonne
 * (`1795380046123`) mais restait NULL sur toutes les lignes seedées — seul
 * `channel` est neuf ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT
 * ─────────────────────────────────────────────────────────────────────────
 *  1. Ajoute `channel`, NULLABLE, sans défaut (GA-11/GA-12 : la contrainte
 *     avant le code qui écrit — voir le commit compagnon sur
 *     `action-plan-items.service.ts`).
 *  2. Contrainte le canal aux QUATRE déjà canoniques (téléphone/e-mail/
 *     LinkedIn/réunion) — `event`/`content` n'ont pas d'équivalent
 *     aujourd'hui et resteraient un mensonge de canal s'ils étaient acceptés
 *     ici puis lus ailleurs comme une des quatre valeurs.
 *  3. RATTRAPE l'existant (doctrine « un correctif de collecte rattrape
 *     l'existant ») : pour les lignes déjà SEEDÉES d'un plan encore en base
 *     (`source_plan_id` + `week_index` + `step_index` retrouvent EXACTEMENT
 *     l'action d'origine dans `action_plans.weeks`, une correspondance déjà
 *     déterministe, jamais deviné), pose `channel` et `expected_outcome`
 *     quand le plan les portait. GUARDÉ `WHERE ... IS NULL` des deux côtés :
 *     ne touche JAMAIS une valeur déjà posée (`expected_outcome` n'est
 *     éditable par aucun humain sur une ligne seedée — voir
 *     `updateActionPlanItemSchema`, qui ne porte pas ce champ — donc un NULL
 *     ici n'a jamais pu être une correction humaine effacée).
 *
 * Idempotente : rejouée deux fois, la deuxième passe ne trouve plus rien à
 * poser (`WHERE channel IS NULL` / `WHERE expected_outcome IS NULL` filtre
 * déjà tout ce qui a été rattrapé).
 *
 * ⚠️ Horodatage repris à l'intégration (GA-372, vague 32) : l'original
 * (1796000732946, choisi par la branche `fix/w42-actions-type-24-09`)
 * tombait sous le maximum déjà en service sur `origin/main`
 * (`ProviderCostLlmDetail`, 1796001419760, vague 30) — et sous
 * `TimesheetInternalReview`, elle-même reprise à 1796001454072 plus haut
 * dans cette même vague. `pnpm --filter api migration:next` a rendu
 * 1796001457744.
 */
export class ActionPlanItemChannel1796001457744 implements MigrationInterface {
  public name = 'ActionPlanItemChannel1796001457744'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS channel TEXT`)

    await queryRunner.query(`ALTER TABLE action_plan_items DROP CONSTRAINT IF EXISTS action_plan_items_channel_check`)
    await queryRunner.query(
      `ALTER TABLE action_plan_items ADD CONSTRAINT action_plan_items_channel_check
         CHECK (channel IS NULL OR channel IN ('phone', 'email', 'linkedin', 'meeting'))`,
    )

    // #2395.4 — le canal, rattrapé depuis le plan d'origine encore en base.
    await queryRunner.query(
      `UPDATE action_plan_items AS i
          SET channel = plan_action.channel
         FROM (
           SELECT
             p.id AS plan_id,
             (week.ordinality - 1) AS week_index,
             (step.ordinality - 1) AS step_index,
             step.value ->> 'channel' AS channel
           FROM action_plans p
           CROSS JOIN LATERAL jsonb_array_elements(p.weeks) WITH ORDINALITY AS week(value, ordinality)
           CROSS JOIN LATERAL jsonb_array_elements(week.value -> 'actions') WITH ORDINALITY AS step(value, ordinality)
         ) AS plan_action
        WHERE i.source_plan_id = plan_action.plan_id
          AND i.week_index = plan_action.week_index
          AND i.step_index = plan_action.step_index
          AND i.channel IS NULL
          AND plan_action.channel IN ('phone', 'email', 'linkedin', 'meeting')`,
    )

    // #2395.9 — l'attendu en texte libre, rattrapé de la même façon. Jamais
    // rangé de force dans les huit clés : c'est l'adaptateur canonique
    // (`action.ts`, lu à chaque requête) qui décide, pas cette migration.
    await queryRunner.query(
      `UPDATE action_plan_items AS i
          SET expected_outcome = plan_action.expected_outcome
         FROM (
           SELECT
             p.id AS plan_id,
             (week.ordinality - 1) AS week_index,
             (step.ordinality - 1) AS step_index,
             NULLIF(btrim(step.value ->> 'expectedOutcome'), '') AS expected_outcome
           FROM action_plans p
           CROSS JOIN LATERAL jsonb_array_elements(p.weeks) WITH ORDINALITY AS week(value, ordinality)
           CROSS JOIN LATERAL jsonb_array_elements(week.value -> 'actions') WITH ORDINALITY AS step(value, ordinality)
         ) AS plan_action
        WHERE i.source_plan_id = plan_action.plan_id
          AND i.week_index = plan_action.week_index
          AND i.step_index = plan_action.step_index
          AND i.expected_outcome IS NULL
          AND plan_action.expected_outcome IS NOT NULL`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
