import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2947 / #2204.28 — « Référencement » manquait aux dix objectifs nommés : les
 * onze autres objectifs de l'épopée (#2204.11/.18-.27) ont chacun déjà leur
 * valeur dans `OUTREACH_INTENTS` (`outreach-canonical.ts`) ; celui-ci n'en
 * avait aucune — demander à être RECOMMANDÉ auprès d'un tiers n'est ni
 * « demander une introduction » (`get_introduction`, qui vise CE contact) ni
 * « demander un retour » (`get_feedback`).
 *
 * ⚠️ LA CONTRAINTE EST ÉLARGIE AVANT LE CODE QUI ÉCRIT LA VALEUR (GA-11/GA-12) —
 * `check-constraints-cover-enums.spec.ts` compare la DERNIÈRE déclaration SQL à
 * l'énumération TypeScript ; cette migration doit donc précéder l'ajout de
 * `get_referral` à `OUTREACH_INTENTS`.
 *
 * `get_referral` s'AJOUTE EN FIN de la contrainte (GA-08 : un enum ne réordonne
 * jamais ses valeurs existantes) — les onze valeurs qui précèdent sont
 * recopiées à l'identique.
 */
export class OutreachIntentReferral1796321401203 implements MigrationInterface {
  public name = 'OutreachIntentReferral1796321401203'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_messages
        DROP CONSTRAINT IF EXISTS outreach_messages_intent_check
    `)

    await queryRunner.query(`
      ALTER TABLE outreach_messages
        ADD CONSTRAINT outreach_messages_intent_check
        CHECK (intent IN (
          'open_relationship', 'qualify_context', 'ask_orientation', 'reactivate',
          'get_introduction', 'push_profile', 'follow_meeting', 'follow_up',
          'nurture', 'get_feedback', 'prepare_partnership', 'clarify_need',
          'get_referral'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
