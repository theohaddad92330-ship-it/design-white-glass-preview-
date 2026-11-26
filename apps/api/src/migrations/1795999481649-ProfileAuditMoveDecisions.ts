import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2074.16 — « L'utilisateur VALIDE ou MODIFIE avant création dans Actions » :
 * `profiles.audit_move_decisions`, la décision humaine (valider/modifier/
 * écarter) sur un mouvement d'audit PROPOSÉ (`AuditMove`, packages/contracts/
 * src/schemas/commercial-audit-moves.ts, verrouillé ce soir — cette migration
 * ne le touche pas).
 *
 * Même précédent que `chosen_entry_strategy` (#2073.8,
 * `1795300741628-ProfileChosenEntryStrategy.ts`) : une colonne SÉPARÉE de
 * `profile_context`, jamais réécrite par une régénération du profil — « une
 * correction humaine gagne toujours ». Clé JSONB = `AuditMove.ruleId`.
 *
 * PAS de contrainte `CHECK` ici (GA-11/GA-12 ne s'appliquent qu'à un scalaire
 * d'énumération) : c'est un objet clé→valeur, pas une colonne à valeur
 * unique — même choix que `agenda_calendar_ids`
 * (`1789312845371-AgendaSelectedCalendars.ts`), une autre colonne `jsonb`
 * libre sur `profiles`. La forme de chaque entrée (`status` parmi `valide`/
 * `modifie`/`ecarte`, `decidedAt`) est validée à l'écriture par
 * `recordAuditMoveDecisionSchema` (Zod, côté service), pas en base.
 *
 * EN AJOUT SEULEMENT, `NULL` par défaut : `NULL`/`{}` = aucune décision, le
 * mouvement reste `propose` (voir `auditMovesFrom`, contrat verrouillé).
 */
export class ProfileAuditMoveDecisions1795999481649 implements MigrationInterface {
  public name = 'ProfileAuditMoveDecisions1795999481649'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS audit_move_decisions jsonb`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
