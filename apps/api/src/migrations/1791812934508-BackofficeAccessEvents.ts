import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le journal d'accès du back-office (#1671.2).
 *
 * POURQUOI UNE TABLE, ET PAS UN `console.warn` DE PLUS
 * Onze événements d'accès étaient déjà émis — tous en `console.warn`, vers les
 * journaux d'exécution de Vercel. Trois choses en découlaient, et l'issue les
 * demande toutes les trois :
 *  · ils ne survivaient pas (quelques heures à quelques jours, jamais 12 mois) ;
 *  · ils n'étaient pas requêtables — on ne compte pas « quatre échecs » dans
 *    une ligne de log, et c'est exactement ce que l'alerte de #1671.3 exige ;
 *  · l'IP et le navigateur n'étaient pas seulement absents du stockage : ils
 *    n'étaient jamais LUS.
 *
 * ⚠️ CETTE TABLE NE PORTE AUCUNE DONNÉE DE CLIENT. Ni compte consulté, ni
 * contact, ni contenu — seulement des opérateurs et leurs entrées. C'est ce qui
 * permet de la garder douze mois sans que la question de la finalité se repose,
 * et c'est aussi pourquoi elle est SÉPARÉE du journal d'actions (#1666, encore
 * ouvert), dont la rétention est plus longue et le sujet différent.
 *
 * ⚠️ `ip`, `user_agent` et `country` sont NULLABLES et le restent : Vercel les
 * fournit presque toujours, et « presque » n'est pas « toujours ». Les remplir
 * par `'inconnu'` ferait d'une lacune un fait — et l'alerte « pays inhabituel »
 * compterait `'inconnu'` comme un pays.
 */
export class BackofficeAccessEvents1791812934508 implements MigrationInterface {
  public name = 'BackofficeAccessEvents1791812934508'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS backoffice_access_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event text NOT NULL,
        actor_email text,
        actor_role text,
        reason text,
        detail text,
        ip text,
        user_agent text,
        country text,
        target text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT backoffice_access_events_event_check CHECK (event IN (
          'connexion',
          'connexion_refusee',
          'acces_refuse',
          'deconnexion',
          'enrolement_demarre',
          'enrolement_confirme',
          'enrolement_refuse',
          'capacite_refusee',
          'email_revele'
        ))
      )
    `)

    // « Les dernières connexions » de la page d'état de sécurité : la lecture la
    // plus fréquente est « les N derniers événements », tous acteurs confondus.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_backoffice_access_events_recent
        ON backoffice_access_events (created_at DESC)
    `)

    // L'alerte de #1671.3 compte les échecs D'UNE adresse sur une FENÊTRE, et
    // relit les pays déjà vus pour elle. Sans cet index, les deux lectures
    // balaieraient la table entière à chaque tentative de connexion.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_backoffice_access_events_actor
        ON backoffice_access_events (actor_email, event, created_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
