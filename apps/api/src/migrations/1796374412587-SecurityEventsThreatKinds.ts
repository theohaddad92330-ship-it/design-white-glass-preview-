import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Épopée #2879 (#2442.14) — GA-11/12 : le CHECK de `security_events.kind`
 * s'élargit AVANT le code IA qui écrit deux valeurs neuves.
 *
 *  · `cross_tenant_suspected` — un résultat d'outil de chat portait un
 *    identifiant d'espace (aucun outil n'a jamais besoin d'en rendre un) ;
 *  · `injection_suspected` — un résultat d'outil ressemblait à une consigne
 *    d'injection (heuristique de motifs : un SOUPÇON, jamais une preuve).
 *
 * Même table, même colonne `status_code` NULL (pas une réponse HTTP), aucune
 * donnée personnelle : `path` = `tool:<nom>`, jamais le contenu détecté.
 */
export class SecurityEventsThreatKinds1796374412587 implements MigrationInterface {
  public name = 'SecurityEventsThreatKinds1796374412587'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_kind_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied', 'leak_detected', 'cross_tenant_suspected', 'injection_suspected'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM security_events WHERE kind IN ('cross_tenant_suspected', 'injection_suspected')`,
    )
    await queryRunner.query(`ALTER TABLE security_events DROP CONSTRAINT IF EXISTS security_events_kind_check`)
    await queryRunner.query(`
      ALTER TABLE security_events
      ADD CONSTRAINT security_events_kind_check CHECK (kind IN ('authorization_denied', 'leak_detected'))
    `)
  }
}
