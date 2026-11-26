import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4016 L12 — AVANT que l'interrupteur d'envoi des alertes de Découvrir puisse être posé, les
 * `weekly_digest = true` que personne n'a jamais cochés repassent à `false` :
 * pas de spam au premier envoi, et un consentement supposé n'en est pas un.
 *
 * C'est le critère de `isInheritedWeeklyDigest` (`admin-weekly-digest-sweep.
 * service.ts`), écrit en SQL pour que la remise à zéro ne dépende plus d'un
 * geste d'opérateur oublié. Une ligne est « jamais cochée » si :
 *  - elle vaut `true` ET n'a jamais été réécrite (`updated_at = created_at`) ;
 *  - ET (A) elle porte `newsletter_last_entry_id` (seul `stampMarker` l'écrit,
 *    par un `.insert()` qui omet `weekly_digest`), OU (B) elle précède la
 *    migration `WeeklyDigestPreference` (lue dans `_migrations`, jamais
 *    devinée ; introuvable → (B) ne s'applique pas, fail closed).
 *
 * Une ligne réécrite est un CHOIX : on n'y touche jamais. Chaque ligne remise à
 * zéro est tracée (`weekly_digest_swept_at`) — la décision « on archive, on ne
 * supprime pas » : l'opération se relit et se défait ligne à ligne.
 *
 * IDEMPOTENTE : `weekly_digest_swept_at IS NULL` + `weekly_digest = true` ; une
 * seconde passe ne trouve rien. Aucune contrainte touchée (GA-11 / GA-12), la
 * colonne de trace existe depuis `1794100650321-WeeklyDigestSweptAt`.
 */
export class WeeklyDigestResetNeverTicked1796440190377 implements MigrationInterface {
  public name = 'WeeklyDigestResetNeverTicked1796440190377'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Base neuve (semis CI sur vraie base) : `_migrations` peut ne pas exister, et la citer
    // ferait échouer toute la requête — (B) ne s'applique alors pas, fail closed.
    const rows: Array<{ t: string | null }> = await queryRunner.query(`SELECT to_regclass('_migrations')::text AS t`)
    const beforePreference = rows?.[0]?.t
      ? `OR created_at < (
             SELECT to_timestamp(m.timestamp / 1000.0)
               FROM _migrations m
              WHERE m.name = 'WeeklyDigestPreference1785890000000'
              LIMIT 1
           )`
      : ''
    await queryRunner.query(`
      UPDATE notification_preferences
         SET weekly_digest = false,
             weekly_digest_swept_at = now()
       WHERE weekly_digest = true
         AND weekly_digest_swept_at IS NULL
         AND updated_at = created_at
         AND (
           newsletter_last_entry_id IS NOT NULL
           ${beforePreference}
         )
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
