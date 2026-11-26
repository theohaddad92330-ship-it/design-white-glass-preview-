import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `contact_decision_role_history` — #2875 (#2402.3), le signal
 * `changement_decideur`, lot P06 (30/09/2026).
 *
 * Cinq lots avaient conclu que `changement_decideur` n'était pas émettable :
 * la définition de « décideur » existe (`contacts.decision_role`, MEDDIC),
 * mais rien ne se SOUVENAIT d'un rôle précédent — un contact ré-analysé voyait
 * sa colonne écrasée, et le passage « économique → utilisateur » ne laissait
 * aucune trace. Cette table est cette mémoire.
 *
 * Pourquoi un TRIGGER SQL plutôt qu'un appel dans chaque écrivain : le rôle
 * s'écrit depuis la persistance de l'analyse, la correction humaine, l'import,
 * la synchronisation CRM, un outil de Laura (même raison que le balayage de
 * Découvrir : un écrivain oublié serait un silence). Le trigger regarde la
 * COLONNE, donc aucun écrivain ne peut l'oublier. Il ne se déclenche que sur
 * un changement réel (`IS DISTINCT FROM`) ; l'insertion initiale n'est pas un
 * changement et ne consigne rien.
 *
 * `emitted_at` : NULL tant que le balayage n'a pas transformé la ligne en
 * `TriggerEvent` canonique ; posé ensuite — un fait n'est émis qu'une fois.
 * La ligne est ARCHIVÉE, jamais supprimée (doctrine). L'effacement RGPD d'un
 * contact emporte son historique (ON DELETE CASCADE, c67).
 */
export class ContactDecisionRoleHistory1796413205629 implements MigrationInterface {
  public name = 'ContactDecisionRoleHistory1796413205629'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_decision_role_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        workspace_id uuid,
        account_id uuid,
        from_role text,
        to_role text,
        changed_at timestamptz NOT NULL DEFAULT now(),
        emitted_at timestamptz
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_decision_role_history_pending
        ON contact_decision_role_history (changed_at) WHERE emitted_at IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_decision_role_history_contact
        ON contact_decision_role_history (contact_id, changed_at DESC)
    `)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION log_contact_decision_role_change() RETURNS trigger AS $fn$
      BEGIN
        INSERT INTO contact_decision_role_history (contact_id, workspace_id, account_id, from_role, to_role)
        VALUES (NEW.id, NEW.workspace_id, NEW.account_id, OLD.decision_role, NEW.decision_role);
        RETURN NEW;
      END
      $fn$ LANGUAGE plpgsql
    `)
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_contact_decision_role_change ON contacts`)
    await queryRunner.query(`
      CREATE TRIGGER trg_contact_decision_role_change
        AFTER UPDATE OF decision_role ON contacts
        FOR EACH ROW
        WHEN (OLD.decision_role IS DISTINCT FROM NEW.decision_role)
        EXECUTE FUNCTION log_contact_decision_role_change()
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
