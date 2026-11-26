import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * DEUX CLICS, UN SEUL EFFET — la trace qui rend le routeur d'actions idempotent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `actionIntentSchema` et le dispatch d'`ActionRouterService` n'avaient aucune
 * clé d'idempotence — un `grep idempot` sur le module ne rendait qu'un
 * commentaire renvoyant à l'idempotence de la capacité SOUS-JACENTE
 * (`send_email`, protégé en aval par `already_sent`). Un double clic, un rejeu
 * de requête ou une reprise après timeout produisaient donc deux effets sur
 * TOUT AUTRE intent : deux notes CRM, deux événements d'agenda (avec deux
 * invitations parties chez un client), deux notifications.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CLÉ N'EST PAS DÉRIVÉE DU CONTENU (D520)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le piège déjà payé dans ce dépôt (fiche mémoire `deterministic-jobid-trap`,
 * revécu le 30/08 sur `sprint_switches` — voir sa migration jumelle) : une clé
 * dérivée de « même compte + même intent » confondrait deux gestes légitimes
 * séparés dans le temps — envoyer deux relances au même contact à trois
 * semaines d'écart est normal, et NE DOIT PAS se voir absorbé comme un rejeu.
 * `idempotency_key` est donc une chaîne OPAQUE fournie par l'appelant (un
 * identifiant généré une fois par TENTATIVE, pas par intention) : la colonne ne
 * porte aucune contrainte sur sa forme, seulement sur son unicité PAR ESPACE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MÊME MOTIF QUE `credit_reservations` ET `sprint_switches` — SUIVI, PAS RÉINVENTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * L'unicité est portée par la BASE (`action_dispatch_attempts_dedupe_idx`), pas
 * par un `SELECT` applicatif avant écriture : deux requêtes concurrentes
 * liraient toutes les deux une table vide avant que l'une n'écrive. Le service
 * insère une ligne de RÉCLAMATION avant d'exécuter l'effet, puis la complète
 * une fois le résultat connu (l'effet lui-même — appel Apollo, HubSpot,
 * calendrier — ne peut pas vivre dans la même transaction que cet insert, il
 * est asynchrone et distant). Une violation d'unicité sur l'insert n'est pas
 * une erreur : c'est le rejeu d'une tentative déjà réclamée, et le service
 * relit la ligne existante plutôt que de rejouer l'effet — exactement la même
 * leçon que `credit_reservations_live_reference_idx` (action-os) et
 * `sprint_switches_dedupe_idx` (sprints).
 *
 * `status` reste NULL tant que l'effet n'est pas terminé : une seconde
 * tentative qui arrive PENDANT ce court intervalle (vraie concurrence) trouve
 * une ligne sans résultat et se rend `skipped` — jamais une ré-exécution,
 * jamais une erreur.
 *
 * Table dédiée plutôt qu'une colonne sur `user_actions` : cette ligne n'est pas
 * un événement du journal d'activité (métier), c'est la mécanique de
 * déduplication du transport — les deux ont des durées de vie différentes.
 *
 * Sans entité TypeORM (comme `sprint_switches`) : le service y accède par SQL
 * brut via un dépôt déjà injecté (`this.accounts.query`), donc rien à
 * enregistrer dans `database.module.ts` ni dans le registre GA-65
 * (`table-scopes.ts`) — `workspace_id` porte la portée et se déduit déjà.
 */
export class ActionDispatchIdempotency1790958812345 implements MigrationInterface {
  name = 'ActionDispatchIdempotency1790958812345'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS action_dispatch_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        idempotency_key text NOT NULL,
        intent_type text NOT NULL,
        -- NULL tant que l'effet est en vol ; posé une seule fois, à l'issue.
        status text,
        reason text,
        external_ref text,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        CONSTRAINT action_dispatch_attempts_status_check
          CHECK (status IS NULL OR status IN (
            'queued', 'done', 'failed', 'skipped', 'partial', 'cancelled', 'awaiting_approval', 'unknown'
          ))
      )
    `)
    // La clé d'idempotence : une SECONDE tentative portant la même clé, dans le
    // même espace, ne déclenche jamais un second effet.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS action_dispatch_attempts_dedupe_idx
        ON action_dispatch_attempts (workspace_id, idempotency_key)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS action_dispatch_attempts_dedupe_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS action_dispatch_attempts`)
  }
}
