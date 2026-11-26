import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3916.a (lot M03, 09/10/2026) — les annonces BODACC collectées EN CONTINU.
 *
 * Jusqu'ici BODACC n'était lu qu'à l'analyse : les 8 dernières annonces,
 * figées dans `raw_analysis.legal_signals` jusqu'au rejeu suivant. Une
 * procédure collective parue le lendemain n'existait pour personne.
 *
 * `public_registry_announcements` — une ligne par annonce d'un registre public,
 * rattachée au SIREN (jamais au nom). PARTAGÉE (registre de portées : `shared`,
 * audience `market`) : c'est du registre public, le même fait pour tous les
 * espaces ; le stocker par espace multiplierait la même annonce par client.
 * Ce qu'un espace SUIT reste dans `accounts`, scopée. `(source, siren, ref)`
 * rend l'écriture idempotente : une annonce relue n'est jamais « neuve », donc
 * jamais ré-alertée.
 *
 * `source` admet DÈS MAINTENANT `sirene` (#3921.a, ouvertures d'établissement)
 * — GA-11/GA-12 : la contrainte s'élargit AVANT le code qui écrit la valeur.
 *
 * `public_registry_watch_state` — jusqu'où chaque SIREN a été lu. Sans elle,
 * chaque passage relirait 24 mois, et l'écran ne pourrait pas DIRE de quand
 * date la dernière lecture (« collecte antérieure », doctrine du rattrapage).
 */
export class PublicRegistryAnnouncements1796437900301 implements MigrationInterface {
  public name = 'PublicRegistryAnnouncements1796437900301'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public_registry_announcements (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        siren         text NOT NULL CHECK (siren ~ '^[0-9]{9}$'),
        source        text NOT NULL,
        ref           text NOT NULL,
        kind          text NOT NULL,
        family_label  text,
        label         text,
        published_on  date NOT NULL,
        url           text,
        tribunal      text,
        collected_at  timestamptz NOT NULL DEFAULT now(),
        -- GA-177 — named, so GA-12 can match them against their TypeScript lists.
        CONSTRAINT public_registry_announcements_source_check CHECK (source IN ('bodacc', 'sirene')),
        CONSTRAINT public_registry_announcements_kind_check CHECK (kind IN (
          'collective_proceeding', 'creation', 'sale', 'accounts_filing',
          'modification', 'deregistration', 'new_establishment', 'other')),
        CONSTRAINT public_registry_announcements_unique UNIQUE (source, siren, ref)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS public_registry_announcements_siren_idx
        ON public_registry_announcements (siren, published_on DESC)
    `)
    await queryRunner.query(`ALTER TABLE public_registry_announcements ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public_registry_watch_state (
        siren             text PRIMARY KEY CHECK (siren ~ '^[0-9]{9}$'),
        bodacc_through    date,
        bodacc_checked_at timestamptz,
        bodacc_truncated  boolean NOT NULL DEFAULT false,
        sirene_checked_at timestamptz
      )
    `)
    await queryRunner.query(`ALTER TABLE public_registry_watch_state ENABLE ROW LEVEL SECURITY`)
    // Aucune politique permissive : lues et écrites par l'API seule (clé de
    // service) — l'écran les reçoit à travers le compte, jamais en direct.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS public_registry_watch_state`)
    await queryRunner.query(`DROP TABLE IF EXISTS public_registry_announcements`)
  }
}
