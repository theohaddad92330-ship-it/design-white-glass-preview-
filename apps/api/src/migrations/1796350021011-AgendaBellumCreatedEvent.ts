import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `agenda_bellum_created_event` — épopée #2770 (#2101.19/.21/.22/.37), la
 * distinction visuelle « suggestion BellumAI » sur la grille/le plateau
 * d'agenda PARTAGÉS (`AgendaGrid`/`AgendaBoard`), pas seulement sur l'écran
 * de la fiche compte qui pose le geste (`AgendaSlotProposalTrigger`, déjà
 * livré).
 *
 * Le docblock d'`agenda-slot-proposal.ts` envisageait un marqueur qui
 * survivrait à une relecture chez Google/Microsoft (`extendedProperties`),
 * nommé « un second chantier ». Cette table est plus petite et suffit : une
 * ligne = UN évènement que `BriefingService.confirmSlotProposal` a réellement
 * écrit dans l'agenda du fournisseur (`AgendaService.createEvent`, déjà là).
 * `external_event_id` est l'identifiant que le fournisseur a RENDU à la
 * création — jamais deviné, jamais recalculé. Le web croise cette liste avec
 * les évènements lus (`event.id`) pour poser `AgendaEvent.createdByBellum` —
 * aucun second aller-retour fournisseur.
 *
 * APPEND-ONLY : un évènement créé par cette porte l'est une fois pour toutes,
 * aucune colonne `updated_at`. `UNIQUE (user_id, external_event_id)` : un
 * fournisseur ne rend jamais deux fois le même identifiant pour deux
 * créations distinctes, et `confirmSlotProposal` n'écrit qu'une ligne par
 * évènement réellement créé.
 */
export class AgendaBellumCreatedEvent1796350021011 implements MigrationInterface {
  public name = 'AgendaBellumCreatedEvent1796350021011'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agenda_bellum_created_event (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        external_event_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT agenda_bellum_created_event_unique UNIQUE (user_id, external_event_id)
      )
    `)

    // « Quels évènements ai-je créés par cette porte ? » — la lecture
    // attendue du web, par utilisateur (la liste reste petite : un geste
    // explicite par compte, jamais un remplissage automatique).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agenda_bellum_created_event_user
        ON agenda_bellum_created_event (user_id, created_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
