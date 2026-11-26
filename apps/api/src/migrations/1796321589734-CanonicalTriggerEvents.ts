import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2875 (#2402.9, épopée « moteur de déclencheurs commerciaux canonique ») —
 * LE REGISTRE, pas encore le moteur.
 *
 * Le registre note lui-même que cette table ne doit « pas être ajoutée seule
 * (code que personne n'appelle), à livrer avec au moins un premier émetteur
 * migré » — c'est ce que fait ce lot : `GovernanceService.proposeDuplicates`
 * (un des cinq points d'émission dispersés cités par #2402.1) écrit ici EN
 * PLUS de `duplicate_pairs`, jamais à sa place. Les quatre autres points
 * d'émission (`intervention-rules.ts`, `discover_signals.py`,
 * `credits.service.ts`, `DeliveryRoutinesService`) ne migrent pas dans ce
 * lot — chacun est un second morceau, pas une ligne.
 *
 * `kind` porte un CHECK délibérément étroit (un seul membre aujourd'hui) :
 * GA-11/12 veut la contrainte SQL élargie AVANT le code qui écrit une valeur
 * neuve — un futur émetteur migré commence donc par une migration qui élargit
 * ce CHECK, jamais par un code qui écrirait une valeur que la colonne refuse
 * encore.
 */
export class CanonicalTriggerEvents1796321589734 implements MigrationInterface {
  public name = 'CanonicalTriggerEvents1796321589734'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS canonical_trigger_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        kind text NOT NULL,
        source_module text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        occurred_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT canonical_trigger_events_kind_check CHECK (kind IN ('duplicate_pair_detected'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS canonical_trigger_events_workspace_idx
      ON canonical_trigger_events (workspace_id, kind, occurred_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS canonical_trigger_events`)
  }
}
