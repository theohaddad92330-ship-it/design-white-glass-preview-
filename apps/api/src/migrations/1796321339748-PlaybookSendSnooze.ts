import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2856 — reste du lot précédent : le report (`snoozed_until`) couvrait
 * `approval_requests`, `outbound_write_requests` et `ats_write_requests`.
 * Posé ici pour `playbook_sends` (les relances de niveau 5 en attente de
 * validation).
 *
 * ⚠️ PAS de délégation (`assigned_to`) sur cette table, et c'est délibéré
 * (D58, `playbooks.service.ts:pendingForDecision`) : la messagerie d'où
 * partirait le message est PERSONNELLE — jamais confiée à un collègue. Le
 * report reste possible : reporter n'envoie rien à personne d'autre, ça
 * retire seulement la ligne de SA PROPRE file jusqu'à une date choisie.
 *
 * La contrainte est posée AVANT le code qui écrit (GA-11/12) : un report ne
 * peut pas dépasser `expires_at` QUAND elle est connue — `expires_at` est
 * nullable sur cette table (lignes historiques d'avant l'approbation),
 * contrairement aux trois autres files.
 */
export class PlaybookSendSnooze1796321339748 implements MigrationInterface {
  name = 'PlaybookSendSnooze1796321339748'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE playbook_sends ADD COLUMN IF NOT EXISTS snoozed_until timestamptz`)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'playbook_sends_snooze_before_expiry') THEN
          ALTER TABLE playbook_sends ADD CONSTRAINT playbook_sends_snooze_before_expiry
            CHECK (expires_at IS NULL OR snoozed_until IS NULL OR snoozed_until <= expires_at);
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE playbook_sends DROP CONSTRAINT IF EXISTS playbook_sends_snooze_before_expiry`)
    await queryRunner.query(`ALTER TABLE playbook_sends DROP COLUMN IF EXISTS snoozed_until`)
  }
}
