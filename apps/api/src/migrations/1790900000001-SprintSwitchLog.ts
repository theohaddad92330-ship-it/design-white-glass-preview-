import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La trace d'une bascule d'EFFORT automatique (tome 5 §28-31, m8).
 *
 * `POST /sprints/accounts/:id/event` était livré, testé, **sans aucun
 * appelant** — le défaut n°1 de ce dépôt. En le branchant, deux exigences
 * jusqu'ici absentes deviennent réelles :
 *
 *  1. **Traçable** : « qu'est-ce qui a fait bouger ce compte ? » doit avoir une
 *     réponse. `sprint_entered_at` disait QUAND, jamais POURQUOI.
 *  2. **Idempotent, par la bonne clé.** Le piège n'est PAS `(account_id,
 *     event)` — deux VRAIES réponses positives, à des semaines d'écart, sur
 *     le même compte, doivent bien basculer deux fois (voir la fiche mémoire
 *     `deterministic-jobid-trap` : une clé qui ne borne pas par
 *     l'OCCURRENCE confond deux runs distincts). La clé est donc la
 *     RÉFÉRENCE de ce qui a déclenché l'évènement (`source_ref` — l'id de
 *     l'action au journal d'activité, par exemple) : rejouer la MÊME cause ne
 *     bascule pas une seconde fois, et une correction humaine posée entre les
 *     deux appels n'est jamais écrasée par le rejeu (`SprintsService.applyEvent`
 *     relit l'état courant sur un doublon plutôt que de le réappliquer).
 *
 * L'unicité est portée par la BASE (`sprint_switches_dedupe_idx`), pas par un
 * `SELECT` applicatif avant écriture : deux appels concurrents liraient tous
 * les deux une table vide avant que l'un n'écrive (même leçon que
 * `credit_reservations_live_reference_idx` dans `action-os`). Le service
 * rattrape la violation d'unicité plutôt que la laisser remonter — une course
 * n'est pas une erreur.
 *
 * Table dédiée plutôt qu'une colonne de plus sur `accounts` : une bascule
 * s'ARCHIVE, elle ne s'écrase pas (« on archive, on ne supprime pas ») — une
 * seule colonne « dernière raison » perdrait l'historique au SECOND
 * évènement automatique sur le même compte.
 *
 * ⚠️ `event` accepte déjà les SEPT valeurs de `SPRINT_EVENTS`, `became_client`
 * compris, alors que le code qui écrit `became_client` arrive dans ce même
 * lot mais dans un commit SÉPARÉ, après celui-ci. Ce n'est pas un
 * élargissement a posteriori (GA-11/GA-12) : la table n'existe pas encore
 * ailleurs, donc rien ne peut avoir écrit une valeur que cette contrainte
 * refuserait — la contrainte est simplement complète dès sa création, et le
 * commit qui la crée est bien celui qui précède, pas celui qui suit, le code
 * TypeScript qui référence `became_client`.
 */
export class SprintSwitchLog1790900000001 implements MigrationInterface {
  name = 'SprintSwitchLog1790900000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sprint_switches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        event text NOT NULL CHECK (event IN (
          'positive_reply',
          'meeting_booked',
          'two_relances_no_reply',
          'thirty_days_idle',
          'asks_for_plan',
          'strong_signal',
          'became_client'
        )),
        source_ref text NOT NULL,
        from_level text NOT NULL CHECK (from_level IN ('focus', 'extension', 'volume', 'no_go')),
        to_level text NOT NULL CHECK (to_level IN ('focus', 'extension', 'volume', 'no_go')),
        reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // La clé d'idempotence : REJOUER la même cause (même compte, même
    // évènement, même référence) ne bascule pas deux fois.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS sprint_switches_dedupe_idx
         ON sprint_switches (account_id, event, source_ref)`,
    )
    // Pour retrouver l'historique d'un compte sans scanner toute la table.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS sprint_switches_account_idx
         ON sprint_switches (workspace_id, account_id, created_at DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS sprint_switches_account_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS sprint_switches_dedupe_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS sprint_switches`)
  }
}
