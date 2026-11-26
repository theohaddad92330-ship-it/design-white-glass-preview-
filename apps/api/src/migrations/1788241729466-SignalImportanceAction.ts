import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Signal complet (restitution V2 §20 — « les objets à unifier »).
 *
 * Le rapport exige pour un signal : *type, source, date, fraîcheur, IMPORTANCE,
 * ACTION*. `signal_history` (migration `1787952416309`) porte déjà les quatre
 * premiers plus tout l'historique ; il manquait la pondération et le lien vers ce
 * que le signal a déclenché. Deux colonnes, toutes deux NULLABLES :
 *
 * - `importance` — `high` | `medium` | `low`, **dérivée de règles déjà en
 *   vigueur** (`signalImportance` dans `@bellum/contracts`) : archivé au sens de
 *   la règle partagée Cockpit/Veille ⇒ `low` ; actif et SOURCÉ (la règle « un
 *   signal sans source n'est pas une preuve » du moteur de preuves) ⇒ `high` ;
 *   actif sans source ⇒ `medium`. Aucun score arbitraire n'est fabriqué : quand
 *   rien ne situe le signal dans le temps, la colonne reste `NULL` et l'écran
 *   n'affiche rien.
 * - `action_id`  — l'action (`action_plan_items`) que CE signal a effectivement
 *   déclenchée. `NULL` tant qu'il n'a rien produit — jamais un rapprochement
 *   deviné. `ON DELETE SET NULL` : supprimer l'action efface le lien, pas
 *   l'historique du signal.
 *
 * Additive + idempotente (`ADD COLUMN IF NOT EXISTS`, contrainte et FK sous
 * garde `pg_constraint`). **Aucun backfill de l'importance** : la re-dériver en
 * SQL dupliquerait la règle TypeScript et les deux copies divergeraient. Les
 * lignes existantes restent `NULL` et se stampent d'elles-mêmes à la prochaine
 * matérialisation (chaque analyse aboutie + le refresh quotidien de la veille).
 */
export class SignalImportanceAction1788241729466 implements MigrationInterface {
  public name = 'SignalImportanceAction1788241729466'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS importance text`)
    await queryRunner.query(`ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS action_id uuid`)

    // `ADD CONSTRAINT` n'a pas d'`IF NOT EXISTS` en Postgres → garde explicite.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'signal_history_importance_check'
        ) THEN
          ALTER TABLE signal_history
            ADD CONSTRAINT signal_history_importance_check
            CHECK (importance IS NULL OR importance IN ('high', 'medium', 'low'));
        END IF;
      END $$;
    `)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'signal_history_action_id_fkey'
        ) THEN
          ALTER TABLE signal_history
            ADD CONSTRAINT signal_history_action_id_fkey
            FOREIGN KEY (action_id) REFERENCES action_plan_items(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `)

    // Lecture « qu'est-ce que ce signal a déclenché ? » : seules les lignes liées.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS signal_history_action_idx
        ON signal_history (action_id)
        WHERE action_id IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
