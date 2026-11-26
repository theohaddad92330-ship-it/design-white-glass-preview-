import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `workspace_bridge_contacts` — le journal de contribution de la mémoire
 * collective.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL EXISTE POUR MESURER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bandeau du bas de l'écran : « Ce mois-ci, Bellum a connecté N fois deux
 * personnes de ton équipe qui ne se seraient probablement pas parlé. »
 *
 * Sans table, ce chiffre n'existe pas — et un écran qui l'afficherait à zéro
 * dirait « le produit ne sert à rien », ce qui n'est pas une mesure mais une
 * absence de mesure. La règle du dépôt s'applique mot pour mot : **« non mesuré »
 * n'est jamais « 0 »**. Tant que cette table n'a aucune ligne pour un espace, le
 * service rend `null` et l'écran écrit « pas assez d'historique pour mesurer ».
 *
 * La spec l'appelle « contribution journal for human commission arbitration » :
 * quand deux commerciaux se sont parlé grâce à un croisement, quelqu'un devra un
 * jour trancher qui a contribué à l'affaire. Cette table est la trace, pas
 * l'arbitre — elle n'attribue rien, elle enregistre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE STOCKE PAS, ET POURQUOI C'EST LA MOITIÉ DU TRAVAIL
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'y a **aucune colonne de texte**. Pas de note, pas de motif, pas de compte
 * rendu, pas de « ce qu'ils se sont dit ». Quatre identifiants, une nature de
 * croisement, une date. Le croisement est un PONT : la table qui mesure les
 * ponts n'a pas à savoir ce qui a traversé.
 *
 * C'est la même discipline que le type d'un croisement
 * (`packages/contracts/src/schemas/memory-crossing.ts`) : on retire le MOYEN,
 * pas seulement la permission. Une colonne `note text` serait remplie dans le
 * mois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PERMET PAS DE DÉDUIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Le §24 « Red Team » de la doctrine : « surveillance des salariés → **aucun
 * classement entre pairs** ». Le seul lecteur de cette table est un COMPTE
 * d'espace sur un mois — jamais une ventilation par personne, jamais un
 * classement, jamais un « qui a le plus / le moins contribué ». Les colonnes
 * `from_user_id` / `to_user_id` existent pour la déduplication (une paire, un
 * compte, par croisement et par mois) et pour l'arbitrage HUMAIN d'une
 * commission — pas pour un tableau de bord de manager.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'UNICITÉ, ET SA RAISON
 * ─────────────────────────────────────────────────────────────────────────────
 * Un commercial qui clique trois fois sur « Contacter » n'a pas connecté trois
 * paires. L'index unique compte donc **une mise en relation par (espace, compte,
 * nature, paire, mois)** — le mois est stocké tel quel (`bridged_month`, premier
 * jour du mois) plutôt que dérivé à la lecture : dériver un mois dans un index
 * unique demande une fonction immuable, et `date_trunc` sur `timestamptz` ne
 * l'est pas (elle dépend du fuseau de la session).
 *
 * `to_user_id` est NULLABLE : un croisement peut désigner un RÔLE plutôt qu'une
 * personne (« passer par le canal cadre — Sales Ops »). Un `NULL` ne collisionne
 * pas dans un index unique Postgres, d'où la colonne générée `to_user_key` qui
 * lui donne une valeur stable.
 */
export class WorkspaceBridgeContacts1791450000001 implements MigrationInterface {
  public name = 'WorkspaceBridgeContacts1791450000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS workspace_bridge_contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        kind text NOT NULL,
        from_user_id uuid NOT NULL,
        to_user_id uuid,
        to_user_key uuid NOT NULL GENERATED ALWAYS AS (COALESCE(to_user_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED,
        bridged_month date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT workspace_bridge_contacts_kind_check
          CHECK (kind IN ('openDoor', 'prospectionCollision', 'crossStaffing', 'knownReferencing'))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_bridge_contacts_once_idx
        ON workspace_bridge_contacts (workspace_id, account_id, kind, from_user_id, to_user_key, bridged_month)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS workspace_bridge_contacts_workspace_month_idx
        ON workspace_bridge_contacts (workspace_id, bridged_month)
    `)
    await queryRunner.query(`
      COMMENT ON TABLE workspace_bridge_contacts IS
        'Journal de contribution de la memoire collective : deux personnes mises en relation par un croisement. AUCUNE colonne de texte - le pont se compte, ce qui a traverse ne se stocke pas. Lu UNIQUEMENT comme un compte d espace sur un mois : jamais de ventilation par personne (doctrine, Red Team - aucun classement entre pairs).'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS workspace_bridge_contacts`)
  }
}
