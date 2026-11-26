import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le relevé ESCALADÉ — #2196.24 (17/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `dueReminders` (`timesheets.service.ts`) porte, depuis la cadence des trois
 * relances (`TIMESHEET_REMINDER_SCHEDULE_DAYS`), le commentaire : « au-delà de
 * trois, le sujet remonte à un humain : le produit s'arrête ». Le calcul était
 * juste et testé — et il ne POSAIT rien : la troisième relance enregistrée
 * laissait la ligne en `missing`, exactement comme la première. Le résumé du
 * CRA (#2196.6) et sa colonne « Statut » (#2196.24) n'avaient donc aucun moyen
 * de compter « ceci a besoin d'un humain » séparément de « on n'a encore rien
 * reçu ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE : LA CONTRAINTE D'ABORD, LE CODE ENSUITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Même leçon que `1790290000001-TimesheetRejection` (GA-11 / GA-12) : la liste
 * repart des HUIT valeurs de cette dernière migration de contrainte et n'en
 * perd aucune, `escalated` est ajouté EN FIN comme GA-08 l'exige côté
 * TypeScript (`TIMESHEET_STATUSES`, `packages/contracts/src/schemas/mission.ts`).
 *
 * Aucune nouvelle colonne : `reminders_sent` et `last_reminder_at` portent déjà
 * tout ce qu'il faut savoir (`1789691847302-TimesheetDepth`) — `escalated` est
 * un STATUT, pas un fait neuf.
 */
export class TimesheetEscalation1795410000001 implements MigrationInterface {
  public name = 'TimesheetEscalation1795410000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_status_check`)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets ADD CONSTRAINT mission_timesheets_status_check
        CHECK (status IN (
          'draft', 'submitted', 'validated', 'disputed', 'expected', 'missing',
          'not_required', 'rejected', 'escalated'
        ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les lignes escaladées repassent en `missing` AVANT que la contrainte ne
    // se resserre : sans ça, l'`ADD CONSTRAINT` échouerait sur elles et le
    // retour arrière resterait bloqué à mi-chemin — même précaution que
    // `TimesheetRejection` pour `rejected` → `draft`. `missing` et non `draft`
    // : une ligne escaladée n'a JAMAIS eu de dépôt, `draft` affirmerait le
    // contraire.
    await queryRunner.query(`UPDATE mission_timesheets SET status = 'missing' WHERE status = 'escalated'`)
    await queryRunner.query(`ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_status_check`)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets ADD CONSTRAINT mission_timesheets_status_check
        CHECK (status IN (
          'draft', 'submitted', 'validated', 'disputed', 'expected', 'missing',
          'not_required', 'rejected'
        ))
    `)
  }
}
