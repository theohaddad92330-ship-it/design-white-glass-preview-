import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2012.12 (épopée #2776) — LA COUVERTURE RÉDUITE DU PROFILEUR, ENFIN
 * PERSISTÉE.
 *
 * `ProfilerAgent` calcule déjà `meta.source_health` par source facultative
 * (`ok`/`down`/`skipped`, `apps/ia/app/agents/profiler.py`, livré `846aacf3f`)
 * mais `ProfileContextService.persistSuccess` ne gardait que `envelope.data` —
 * `envelope.meta` était jeté à la frontière API, avant même d'atteindre une
 * table ou un écran (constat des lots précédents).
 *
 * Colonne SÉPARÉE de `profile_context` (jsonb existant, PDF 1) : `meta` et
 * `data` sont deux objets distincts sur l'enveloppe (`agentEnvelopeSchema`) —
 * les mélanger romprait la garde de lecture `withheldStoredContext`, qui ne
 * porte que sur `profile_context`.
 *
 * Additive et nullable : `NULL` tant qu'aucune génération n'a encore posé de
 * signal (comportement d'avant, inchangé), ou pour toute ligne déjà en base.
 */
export class ProfileSourceHealth1796321501100 implements MigrationInterface {
  public name = 'ProfileSourceHealth1796321501100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS source_health jsonb;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
