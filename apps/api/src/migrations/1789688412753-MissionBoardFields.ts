import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ce qu'il manquait à une mission pour être pilotable (PDF 5 §2 et §4).
 *
 * Cinq colonnes, chacune contre une impossibilité constatée :
 *
 *  - `stage_entered_at` : sans elle, aucune alerte de séjour n'est calculable.
 *    « Cette carte est là depuis douze jours » est la seule information qui
 *    fasse bouger une colonne, et `updated_at` ne la donne pas — il bouge à
 *    chaque modification de TJM.
 *  - `contract_kind` : une mission au FORFAIT n'a ni TJM ni jours, elle se
 *    facture sur des jalons. Sans ce champ, la garde forfait est inapplicable
 *    et le module réclame un relevé d'activité à une mission qui n'en aura
 *    jamais (décision D35).
 *  - `role_title` : `label` sert de nom de mission ET de rôle cherché. Les
 *    confondre affiche « Refonte du SI paiement » là où le recruteur cherche
 *    « Architecte de plateforme ».
 *  - `billing_contact_id` : le bloqueur « contact facturation inconnu » du §8.2
 *    ne pouvait pas exister, faute de champ à regarder.
 *  - `owner_id` : `user_id` est le CRÉATEUR. Le propriétaire est celui qu'on
 *    alerte, et ce n'est pas la même personne dès qu'une mission change de main.
 *
 * Et une CONTRAINTE : `status` n'en avait aucune. Six valeurs attendues, zéro
 * garde-fou — une faute de frappe passait, et l'écran affichait une clé brute.
 * Le dépôt a déjà payé ce défaut une fois sur les statuts de mission.
 */
export class MissionBoardFields1789688412753 implements MigrationInterface {
  public name = 'MissionBoardFields1789688412753'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS contract_kind text NOT NULL DEFAULT 'regie',
        ADD COLUMN IF NOT EXISTS role_title text,
        ADD COLUMN IF NOT EXISTS billing_contact_id uuid,
        ADD COLUMN IF NOT EXISTS owner_id uuid
    `)

    // La contrainte est posée APRÈS un nettoyage : une valeur inattendue déjà
    // en base ferait échouer la migration entière, donc le déploiement entier.
    // On la ramène à `active`, l'état le moins surprenant, plutôt que de
    // refuser de démarrer.
    await queryRunner.query(`
      UPDATE missions SET status = 'active'
       WHERE status NOT IN ('onboarding', 'active', 'paused', 'ended', 'terminated', 'renewed')
    `)
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check`)
    await queryRunner.query(`
      ALTER TABLE missions ADD CONSTRAINT missions_status_check
        CHECK (status IN ('onboarding', 'active', 'paused', 'ended', 'terminated', 'renewed'))
    `)
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_contract_kind_check`)
    await queryRunner.query(`
      ALTER TABLE missions ADD CONSTRAINT missions_contract_kind_check
        CHECK (contract_kind IN ('regie', 'forfait', 'recrutement', 'inconnu'))
    `)

    // Le propriétaire par défaut est le créateur : c'est faux dès la première
    // reprise, mais c'est vrai au moment où la ligne est écrite, et laisser
    // NULL ferait disparaître les missions existantes de toute vue « les
    // miennes ».
    await queryRunner.query(`UPDATE missions SET owner_id = user_id WHERE owner_id IS NULL`)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS missions_owner_idx ON missions (workspace_id, owner_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_contract_kind_check`)
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check`)
    await queryRunner.query(`
      ALTER TABLE missions
        DROP COLUMN IF EXISTS stage_entered_at,
        DROP COLUMN IF EXISTS contract_kind,
        DROP COLUMN IF EXISTS role_title,
        DROP COLUMN IF EXISTS billing_contact_id,
        DROP COLUMN IF EXISTS owner_id
    `)
  }
}
