import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1916.23 — L'HISTORIQUE D'UN ÉLÉMENT DE MÉMOIRE.
 *
 * Constat du 13/09/2026 : aucun geste sur un élément épinglé ne laissait de
 * trace. `memory_pinned_facts` porte sa date de création et son auteur, rien
 * d'autre — un texte réécrit, une portée changée, une échéance posée effaçaient
 * l'état précédent sans que personne puisse dire qui l'avait fait, ni quand.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA TABLE JOURNALISE, ET CE QU'ELLE NE RECOPIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois gestes (`MEMORY_ITEM_EVENTS`) : `text_changed`, `scope_changed`,
 * `expiry_changed`, chacun avec la valeur d'avant, la valeur d'après et l'AUTEUR
 * du geste. La CRÉATION n'y entre pas : elle se lit sur la ligne elle-même
 * (`created_at`, `user_id`), qui existe pour chaque élément, y compris ceux
 * épinglés avant cette migration. La recopier donnerait deux dates de création
 * pour les nouveaux éléments et aucune pour les anciens.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CLÉS, TROIS DÉCISIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * · `workspace_id` NOT NULL — l'histoire d'un élément ne sort pas de son espace ;
 *   toute lecture la borne (`MemoryService.factHistory`).
 * · `fact_id` ON DELETE CASCADE — un élément OUBLIÉ emporte son histoire. L'écran
 *   promet « une ligne oubliée disparaît de la base, pas seulement de l'écran » ;
 *   un ancien texte survivant ici démentirait la phrase.
 * · `actor_user_id` ON DELETE SET NULL — l'effacement d'un compte retire l'AUTEUR
 *   du geste, pas le geste : l'histoire d'une règle PARTAGÉE appartient à
 *   l'espace. L'écran dit alors « auteur inconnu », jamais un prénom deviné.
 *
 * RLS activée SANS politique : aucun client direct n'a à lire ce journal, seule
 * l'API (rôle de service) y écrit et le relit, bornée par l'espace.
 *
 * Porte « ajout seulement » : une table neuve, aucune colonne existante touchée,
 * aucune donnée réécrite. Le `CHECK` est posé DÈS LA CRÉATION, sous garde de
 * ré-exécution (`ADD CONSTRAINT` n'accepte pas `IF NOT EXISTS`) — la contrainte
 * précède le code qui écrit la valeur (GA-11 / GA-12).
 */
export class MemoryFactEvents1792800150613 implements MigrationInterface {
  public name = 'MemoryFactEvents1792800150613'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS memory_fact_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        fact_id uuid NOT NULL REFERENCES memory_pinned_facts(id) ON DELETE CASCADE,
        actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
        event text NOT NULL,
        previous_value text NULL,
        new_value text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'memory_fact_events_event_check'
        ) THEN
          ALTER TABLE memory_fact_events
            ADD CONSTRAINT memory_fact_events_event_check
            CHECK (event IN ('text_changed', 'scope_changed', 'expiry_changed'));
        END IF;
      END $$;
    `)

    // La seule lecture réelle : l'histoire d'UN élément, dans l'ordre.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_fact_events_fact_idx ON memory_fact_events (fact_id, created_at)
    `)

    await queryRunner.query(`ALTER TABLE memory_fact_events ENABLE ROW LEVEL SECURITY`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
