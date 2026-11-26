import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2073.8 — « Choisir cette stratégie » : `profiles.chosen_entry_strategy`,
 * DISTINCT du champ CALCULÉ par le profileur (`profiles.profile_context
 * ->'idealAccountProfile'->>'entryStrategy'`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX COLONNES, DEUX FAITS
 * ─────────────────────────────────────────────────────────────────────────────
 * `AuditStrategyOptions.tsx` affiche les quatre voies connues et marque celle
 * que le profileur a RETENUE (`idealAccountProfile.entryStrategy`, dans le
 * JSONB `profile_context`, réécrit en entier à chaque régénération). Aucun
 * champ ne PERSISTAIT le choix de l'utilisateur — son docblock le disait
 * lui-même. Écrire le choix dans le même champ calculé le ferait écraser à la
 * prochaine régénération du profil ; une correction humaine gagne toujours,
 * donc une SECONDE colonne, jamais un partage de la première.
 *
 * EN AJOUT SEULEMENT, nullable et sans défaut (GA-11 / GA-12 : la contrainte
 * et la colonne existent avant le code qui écrit — voir le commit suivant,
 * `POST /profile-context/entry-strategy`). `NULL` = aucun choix explicite :
 * le lecteur retombe alors sur le champ calculé (voir
 * `buildCommercialAudit`, `apps/web/.../lib/build-audit.ts`).
 *
 * La contrainte reprend la liste ACTUELLE de `entryStrategyValues`
 * (`packages/contracts/src/schemas/profile-context.ts`) — GA-12 vérifie que
 * les deux ne divergent jamais.
 */
export class ProfileChosenEntryStrategy1795300741628 implements MigrationInterface {
  public name = 'ProfileChosenEntryStrategy1795300741628'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chosen_entry_strategy text`)
    await queryRunner.query(`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_chosen_entry_strategy_check`)
    await queryRunner.query(
      `ALTER TABLE profiles ADD CONSTRAINT profiles_chosen_entry_strategy_check CHECK (chosen_entry_strategy IS NULL OR chosen_entry_strategy IN ('topDown', 'bottomUp', 'multiThread', 'referral'))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
