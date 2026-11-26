import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3262 (BEL-SC-233) — L'AUTEUR MANQUANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * La porte G1 (`priority_gate`, migration antérieure) et le board d'effort
 * (`sprint`, tome 5 §28) gardent déjà chacun une RAISON et une DATE —
 * `gate_reason`/`gate_decided_at`, `sprint_exit_reason`/`sprint_entered_at`.
 * Aucun des deux ne garde QUI a décidé. Sur un espace à plusieurs commerciaux,
 * « ce compte est en No-Go depuis le 12/03, motif : pas de budget » ne dit pas
 * qui a pris la décision — la spec #3262 l'exige explicitement (« conserver :
 * raison, date, AUTEUR »).
 *
 * GA-11/GA-12 — cette migration ARRIVE AVANT `AccountGateService.decide` et
 * `SprintsService.move`, dans le même commit.
 *
 * Deux colonnes UUID nullable, jamais NOT NULL : tout compte déjà écarté ou
 * déjà sorti d'un sprint AVANT cette migration n'a pas d'auteur connu, et
 * `null` le dit — lui en inventer un (le premier admin, le créateur du compte)
 * fabriquerait une attribution que personne n'a faite. Une bascule
 * AUTOMATIQUE (`SprintsService.applyEvent`, sur `meeting_booked` par exemple)
 * reste aussi à `null` : ce n'est pas un commercial qui a décidé.
 */
export class AccountStopDecisionAuthors1796373379395 implements MigrationInterface {
  name = 'AccountStopDecisionAuthors1796373379395'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS gate_decided_by uuid,
        ADD COLUMN IF NOT EXISTS sprint_decided_by uuid
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        DROP COLUMN IF EXISTS gate_decided_by,
        DROP COLUMN IF EXISTS sprint_decided_by
    `)
  }
}
