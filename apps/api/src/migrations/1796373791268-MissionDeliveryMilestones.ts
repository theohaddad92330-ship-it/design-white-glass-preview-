import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3269 (BEL-SC-240) — les six jalons de delivery qu'aucun objet canonique
 * existant ne couvre : brief consultant, brief client, documents et accès,
 * premier check, revue de début, suivi périodique. Catalogue et projection :
 * `packages/contracts/src/schemas/mission-delivery-milestones.ts` (GA-26) ;
 * la contrainte `item_key` est posée AVANT le code qui l'écrit (GA-11/GA-12).
 *
 * Même patron que `mission_end_checks` (`1796321339461`) : un geste n'est
 * jamais supprimé, une re-confirmation ARCHIVE la ligne en vigueur — on
 * archive, on ne supprime pas. Une seule ligne en vigueur par (mission, item).
 *
 * Les onze autres jalons de la spec (démarrage, satisfaction, CRA, risque,
 * renouvellement, fin de mission, REX interne/client, preuve réutilisable,
 * expansion, disponibilité future) se PROJETTENT depuis leur table existante
 * — rien à créer pour eux ici.
 */
export class MissionDeliveryMilestones1796373791268 implements MigrationInterface {
  public name = 'MissionDeliveryMilestones1796373791268'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_delivery_milestones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        item_key text NOT NULL,
        note text NOT NULL,
        confirmed_by uuid NOT NULL,
        confirmed_at timestamptz NOT NULL DEFAULT now(),
        archived_at timestamptz NULL,
        archived_by uuid NULL,
        CONSTRAINT mission_delivery_milestones_item_key_check CHECK (item_key IN (
          'brief_consultant', 'brief_client', 'documents_acces',
          'premier_check', 'revue_debut', 'suivi_periodique'
        )),
        CONSTRAINT mission_delivery_milestones_note_check CHECK (length(btrim(note)) > 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_delivery_milestones_live
        ON mission_delivery_milestones (mission_id, item_key) WHERE archived_at IS NULL;
      ALTER TABLE mission_delivery_milestones ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "mission_delivery_milestones_workspace_read" ON mission_delivery_milestones;
      CREATE POLICY "mission_delivery_milestones_workspace_read" ON mission_delivery_milestones FOR SELECT
        USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS mission_delivery_milestones;
    `)
  }
}
