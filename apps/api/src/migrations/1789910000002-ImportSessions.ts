import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'assistant d'import (PDF 7 §7, BEL-INT-602).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SESSION, ET PAS UN SIMPLE ENDPOINT
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que la règle centrale du ticket est temporelle : « `apply` REFUSE si
 * aucun dry-run n'est enregistré ». Un endpoint qui simule et écrit dans le même
 * appel ne peut pas tenir cette promesse — il faut que la simulation SURVIVE au
 * clic suivant, et qu'elle soit celle-là et pas une autre.
 *
 * D'où `report`, figé, et `report_at` : approuver un import à partir d'un
 * rapport de la semaine dernière écrirait un état que plus personne n'a en tête.
 * C'est le même raisonnement que la prévisualisation figée des écritures ERP.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INSTANTANÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `snapshot` garde, AVANT écriture, les valeurs qui vont être remplacées. C'est
 * ce qui rend l'annulation possible — et l'annulation est la seule chose qui
 * rende un import de 200 000 lignes acceptable pour quelqu'un qui a déjà vu une
 * migration mal tourner. Il reste consultable au-delà de la fenêtre : « on ne
 * peut plus annuler » n'est pas « on ne sait plus ce qui s'est passé ».
 *
 * ⚠️ Ce qui n'est PAS ici : le fichier déposé. On garde ce qu'on a COMPRIS
 * (le mapping, le rapport, l'instantané), pas la matière première — un CSV de
 * prospection contient des données personnelles qu'on n'a aucune raison de
 * conserver après l'import.
 */
export class ImportSessions1789910000002 implements MigrationInterface {
  name = 'ImportSessions1789910000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS import_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        created_by uuid NOT NULL,
        source text NOT NULL,
        object_type text NOT NULL,
        state text NOT NULL DEFAULT 'draft',
        mapping jsonb,
        report jsonb,
        report_at timestamptz,
        snapshot jsonb,
        applied_at timestamptz,
        rolled_back_at timestamptz,
        created_count integer NOT NULL DEFAULT 0,
        updated_count integer NOT NULL DEFAULT 0,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT import_sessions_state_check
          CHECK (state IN ('draft', 'simulated', 'applied', 'rolled_back', 'failed'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS import_sessions_workspace_idx ON import_sessions (workspace_id, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS import_sessions`)
  }
}
