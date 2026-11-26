import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2004 — la machine d'état canonique de l'onboarding nomme DIX états pour
 * `user_onboarding_state.status` ; la contrainte n'en portait que TROIS
 * (`not_started`, `in_progress`, `completed`, posées en ligne dans
 * `1780000000000-OnboardingProfilesSchema`, ligne 127).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PÉRIMÈTRE DE CE LOT — élargir la contrainte, RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2004 porte aussi des demandes de machine d'état applicative (reprise
 * exacte après fermeture/perte de réseau/paiement/invitation/erreur IA/import
 * long), d'entitlement et de facturation : ce sont des décisions produit qui
 * restent à l'utilisateur. Cette migration ne fait qu'ouvrir la place —
 * **aucun code n'écrit encore les neuf valeurs nouvelles** (`identity_in_progress`,
 * `audit_in_progress`, `audit_generating`, `audit_to_review`, `audit_validated`,
 * `data_enrichment_optional`, `first_value_ready` ; les deux dernières de
 * l'issue — `activated`, `refresh_required` — sont incluses aussi).
 *
 * LE COMPTE, parce qu'un total est un argument : l'issue nomme DIX états, dont
 * `not_started` existait déjà — soit NEUF valeurs à ajouter. Les deux valeurs
 * historiques que l'issue ne nomme pas (`in_progress`, `completed`) sont
 * CONSERVÉES, puisque des lignes les portent déjà et qu'une contrainte ne perd
 * jamais une valeur écrite (GA-08). La contrainte porte donc DOUZE valeurs,
 * exactement celles de `onboardingStatusSchema`, dans le même ordre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION PART AVANT LE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit** (gardes GA-11 et GA-12) — même discipline que
 * `1790700016001-MissionChannelPortage`. Les trois valeurs existantes sont
 * recopiées EN TÊTE et DANS LEUR ORDRE ; les neuf nouvelles s'ajoutent EN FIN,
 * dans l'ordre où l'issue les énumère — jamais une réécriture de la contrainte
 * qui perdrait une valeur déjà écrite (GA-08 côté TypeScript, GA-11 côté SQL).
 *
 * ⚠️ L'HORODATAGE n'est pas un nombre rond, et c'est la garde
 * `src/database/migrations.spec.ts` qui l'exige : elle rejette tout horodatage
 * divisible par 100 000 000 à partir de `1786600000001`. La raison est écrite
 * dans la garde — trois collisions d'affilée parce que chacun choisit à la main
 * la même centaine de milliards. Premier jet de ce lot : `1793500000000`, rond,
 * rouge en CI. `Date.now()` ne servait à rien ici : l'horloge de la machine
 * (1789383494449) est DERRIÈRE les migrations du dépôt, donc sa valeur aurait
 * été antérieure au maximum de main. La queue de cette lecture réelle
 * (…83494449) a été greffée sur la marge déjà retenue.
 *
 * ⚠️ La contrainte d'origine est un `CHECK` EN LIGNE, SANS NOM : Postgres l'a
 * donc nommée automatiquement `user_onboarding_state_status_check`
 * (convention `<table>_<colonne>_check`) — c'est ce nom qu'on redéclare ici en
 * l'ÉLARGISSANT, cette fois via un `ADD CONSTRAINT` NOMMÉ (GA-177), ce qui la
 * fait entrer sous GA-12 (`check-constraints-cover-enums.spec.ts`, entrée
 * `user_onboarding_state_status_check: 'onboardingStatusSchema'`) — invisible
 * à cette garde tant qu'elle restait en ligne.
 */
export class OnboardingStatusStates1793583494449 implements MigrationInterface {
  name = 'OnboardingStatusStates1793583494449'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user_onboarding_state DROP CONSTRAINT IF EXISTS user_onboarding_state_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE user_onboarding_state ADD CONSTRAINT user_onboarding_state_status_check CHECK (
        status IN (
          'not_started', 'in_progress', 'completed',
          'identity_in_progress', 'audit_in_progress', 'audit_generating',
          'audit_to_review', 'audit_validated', 'data_enrichment_optional',
          'first_value_ready', 'activated', 'refresh_required'
        )
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Défensif seulement : aucun code n'écrit les neuf valeurs nouvelles dans
    // ce lot, donc aucune ligne ne devrait les porter — mais un `down()` qui
    // suppose plutôt que vérifie est ce qui a rendu une migration inverse
    // injouable ailleurs dans ce dépôt (voir MissionChannelPortage). `unknown`
    // n'existe pas dans cette énumération ; `not_started` est la seule valeur
    // dont on est certain qu'aucune ligne existante ne la contredit.
    await queryRunner.query(`
      UPDATE user_onboarding_state SET status = 'not_started' WHERE status NOT IN (
        'not_started', 'in_progress', 'completed'
      )
    `)

    await queryRunner.query(
      `ALTER TABLE user_onboarding_state DROP CONSTRAINT IF EXISTS user_onboarding_state_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE user_onboarding_state ADD CONSTRAINT user_onboarding_state_status_check CHECK (
        status IN ('not_started', 'in_progress', 'completed')
      )
    `)
  }
}
