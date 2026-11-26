import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `focus_plan_block_outcomes` — épopée #2770 (#2770.63/.64/.65, #2391.51/.52/.53),
 * la MESURE POST-BLOC d'un plan de journée.
 *
 * Six lots (25→29/09/2026) avaient vérifié `git grep block_outcome|blockOutcome`
 * vide et conclu à un « système entier absent » : aucune table ne portait ce
 * que devient un bloc une fois placé. Ce n'était pas codable avant ce lot,
 * faute d'identifiant stable — `confirmFocusPlanBlock` (#2770.49/.50/.51,
 * ce jour) rend désormais `AgendaCreateResult.id`, le SEUL identifiant qu'un
 * bloc réellement créé porte. Cette table s'accroche à CET identifiant, même
 * porte que `agenda_bellum_created_event` (migration `1796350021011`).
 *
 * Trois états DÉCLARÉS (`outcome`, CHECK), jamais un quatrième deviné —
 * `résultat` (#2391.54, texte libre) et `durée réelle` (#2391.55, qui
 * supposerait de mesurer plutôt que de laisser déclaratif) restent hors de
 * cette tranche. `#2391.56` — « mesure jamais intrusive » — est structurel :
 * un UPSERT posé par un clic, rien de déduit de l'agenda ni d'un minuteur.
 *
 * UPSERTABLE, contrairement à `agenda_bellum_created_event` : une correction
 * humaine gagne toujours, quelle que soit sa date (doctrine) — se tromper de
 * bouton n'est pas une écriture qu'on ne peut jamais reprendre.
 *
 * Scopée `user_id`, jamais `workspace_id` : hors du périmètre des deux
 * gardes de démonstration (`demo-reset.service.spec.ts`, `demo-coverage.ts`),
 * même raison que `agenda_bellum_created_event` et `user_daily_brief`.
 */
export class FocusPlanBlockOutcomes1796412731846 implements MigrationInterface {
  public name = 'FocusPlanBlockOutcomes1796412731846'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS focus_plan_block_outcomes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        external_event_id text NOT NULL,
        outcome text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT focus_plan_block_outcomes_unique UNIQUE (user_id, external_event_id),
        CONSTRAINT focus_plan_block_outcomes_outcome_check CHECK (outcome IN ('realized', 'interrupted', 'postponed'))
      )
    `)

    // « Qu'est-il advenu de MES blocs ? » — la lecture attendue du web, par
    // utilisateur, même patron que `idx_agenda_bellum_created_event_user`.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_focus_plan_block_outcomes_user
        ON focus_plan_block_outcomes (user_id, updated_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
