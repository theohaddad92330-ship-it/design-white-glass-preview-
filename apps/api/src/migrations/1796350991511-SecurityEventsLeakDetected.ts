import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2879 (#2442.15), lot V36 (28/09/2026) — GA-11/12 : le CHECK
 * s'élargit AVANT le code qui écrit une valeur neuve, jamais après.
 *
 * Deuxième espèce de `security_events.kind` (la première, `authorization_denied`,
 * `1796322009123-SecurityEvents.ts`) — une fuite d'identité détectée par
 * `guard_shared_corpus_pii_reporting_leak` côté IA (`apps/ia/app/services/
 * shared_corpus_pii_guard.py`) quand un e-mail, un téléphone ou une URL de
 * profil personnel apparaît dans le résultat d'un outil de chat dont le
 * corpus est PARTAGÉ entre espaces (`SHARED_CORPUS_TOOLS` : mémoire marché,
 * partenaires, territoire). Une identité de personne y est structurellement
 * un bug, jamais une donnée légitime.
 *
 * `status_code` n'a pas de sens pour cette espèce (ce n'est pas une réponse
 * HTTP) : la colonne devient NULLABLE et son CHECK accepte NULL en plus de
 * 401/403 — jamais une valeur inventée pour combler une contrainte NOT NULL.
 */
export class SecurityEventsLeakDetected1796350991511 implements MigrationInterface {
  public name = 'SecurityEventsLeakDetected1796350991511'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE security_events ALTER COLUMN status_code DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_status_code_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_status_code_check CHECK (status_code IS NULL OR status_code IN (401, 403))
    `)
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_kind_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied', 'leak_detected'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_kind_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied'))
    `)
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_status_code_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_status_code_check CHECK (status_code IN (401, 403))
    `)
    await queryRunner.query(`ALTER TABLE security_events ALTER COLUMN status_code SET NOT NULL`)
  }
}
