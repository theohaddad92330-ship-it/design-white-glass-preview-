import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2177.6 / .8 / .24 / .25 / .28 / .30 — le DÉTAIL d'un positionnement,
 * ADDITIF sur `submissions` : destinataire, canal, message préparé,
 * disponibilité annoncée, conditions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ (tri #2177, 24/09/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * `submissionSchema` (`packages/contracts`) ne portait AUCUN de ces cinq
 * champs. #2177.25 renvoie explicitement à #2177.6 (même champ, même
 * absence) — une seule colonne couvre les deux.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CINQ COLONNES, TOUTES NULLABLES, SANS DÉFAUT (GA-11/GA-12)
 * ─────────────────────────────────────────────────────────────────────────
 * Une ligne déjà en base n'a jamais déclaré aucun de ces cinq champs, et lui
 * en inventer un serait une déclaration qui n'a pas eu lieu — même principe
 * que `substatus` (`1795999454405-SubmissionSubstatus.ts`).
 *
 *  - `recipient_contact_id` — RÉFÉRENCE `contacts(id)`, `ON DELETE SET NULL` :
 *    un contact supprimé ne doit jamais faire disparaître le positionnement
 *    qui le citait, seulement son destinataire.
 *  - `channel` — contraint aux QUATRE valeurs déjà canoniques du plan de
 *    Laura (`action_plan_items.channel`, `1796001457744-ActionPlanItemChannel.ts`) :
 *    un cinquième canal ici serait un mensonge de canal une fois lu ailleurs
 *    comme une des quatre valeurs déjà en production.
 *  - `message`, `availability`, `conditions` — texte libre, aucune contrainte
 *    de forme : ce sont des phrases préparées par un humain, pas des champs
 *    structurés.
 */
export class SubmissionRecipientDetails1796001510863 implements MigrationInterface {
  public name = 'SubmissionRecipientDetails1796001510863'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE submissions
         ADD COLUMN IF NOT EXISTS recipient_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL`,
    )
    await queryRunner.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS channel text`)
    await queryRunner.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS message text`)
    await queryRunner.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS availability text`)
    await queryRunner.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS conditions text`)

    await queryRunner.query(`ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_channel_check`)
    await queryRunner.query(
      `ALTER TABLE submissions ADD CONSTRAINT submissions_channel_check
         CHECK (channel IS NULL OR channel IN ('phone', 'email', 'linkedin', 'meeting'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_channel_check`)
    await queryRunner.query(`ALTER TABLE submissions DROP COLUMN IF EXISTS recipient_contact_id`)
    await queryRunner.query(`ALTER TABLE submissions DROP COLUMN IF EXISTS channel`)
    await queryRunner.query(`ALTER TABLE submissions DROP COLUMN IF EXISTS message`)
    await queryRunner.query(`ALTER TABLE submissions DROP COLUMN IF EXISTS availability`)
    await queryRunner.query(`ALTER TABLE submissions DROP COLUMN IF EXISTS conditions`)
  }
}
