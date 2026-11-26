import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `workspaces.timezone` — LE FUSEAU DE L'ESPACE, #1958.2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * #1958.1 (migration `1793583612847-ProfileTimezone`) a donné un fuseau à la
 * PERSONNE. Rien ne le porte pour l'ESPACE (l'ESN) : une équipe dont personne
 * n'a rempli son fuseau personnel retombe directement sur le défaut produit
 * nommé (`REFERENCE_TIMEZONE`, `apps/ia/app/prompts/current_time.py`) —
 * `Europe/Paris` — même basée à Montréal ou à Singapour. Et `workspaces.market`
 * ne comble pas ce trou : le marché dit QUI on prospecte, le fuseau dit QUAND
 * on travaille, et une ESN française qui prospecte les États-Unis reste sur
 * Paris pour son propre calendrier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AJOUT SEULEMENT, ET NULLABLE — LA MÊME RAISON QUE `profiles.timezone`
 * ─────────────────────────────────────────────────────────────────────────────
 * Un `DEFAULT 'Europe/Paris'` rendrait INDISCERNABLE « cet espace a choisi
 * Paris » de « personne n'a rien réglé », et empêcherait de distinguer plus
 * tard un espace qui a VRAIMENT confirmé Paris. `NULL` = inconnu, et
 * `resolve_applicable_timezone` (`apps/ia/app/prompts/current_time.py`) le lit
 * en DERNIER recours avant le défaut nommé : personne → rendez-vous → espace →
 * défaut produit. Tout espace existant garde donc, au bit près, le
 * comportement d'avant ce lot.
 *
 * Aucune contrainte SQL sur la VALEUR, pour la même raison que
 * `ProfileTimezone1793583612847` : la liste des fuseaux IANA périme, et une
 * contrainte figée finirait par refuser un fuseau réel. La porte est
 * `workspaceTimezoneSchema` (`packages/contracts`), qui interroge la base de
 * fuseaux de la plate-forme via `Intl`. `varchar(64)`, même borne que
 * `profiles.timezone`.
 *
 * GA-11/GA-12 — cette migration est le PREMIER des deux commits : la colonne
 * arrive AVANT le code qui l'écrit (contrats, service, contrôleur, escalier).
 */
export class WorkspaceTimezone1795205000000 implements MigrationInterface {
  public name = 'WorkspaceTimezone1795205000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS timezone varchar(64) NULL`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS timezone`)
  }
}
