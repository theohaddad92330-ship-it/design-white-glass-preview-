import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2947 (#2204.60/.61/.63, lot M09 09/10/2026) — trois champs du TEMPLATE de
 * style : le PITCH (l'argument que ce style met en avant), le TON (le registre
 * déclaré : tutoiement, niveau de formalité…) et la SIGNATURE (le bloc de fin
 * d'e-mail, recopié tel quel). Chacun est DÉCLARÉ par le commercial — jamais
 * déduit, jamais rempli par défaut : `NULL` = non déclaré, et le prompt n'en
 * dit alors rien (byte-identique).
 *
 * Aucune valeur fermée, donc aucune contrainte d'énumération à élargir
 * (GA-11/GA-12) : seules des bornes de longueur, posées EN BASE en même temps
 * que la colonne — la même borne que le contrat (`message-style.ts`).
 *
 * `.59` (messages) et `.64` (exemples validés) NE sont PAS ici : ce sont des
 * textes complets, déjà portés par la bibliothèque de messages (#3427,
 * `message_library_entries`, statut `approuve`) — une seconde copie sur le
 * template dirait la même chose ailleurs (GA-26).
 *
 * Additive et idempotente (`ADD COLUMN IF NOT EXISTS`). `down` non supporté
 * (convention du dépôt).
 */
export class MessageStyleTemplatePitchToneSignature1796437900910 implements MigrationInterface {
  public name = 'MessageStyleTemplatePitchToneSignature1796437900910'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        ADD COLUMN IF NOT EXISTS pitch text,
        ADD COLUMN IF NOT EXISTS tone text,
        ADD COLUMN IF NOT EXISTS signature text
    `)
    for (const [column, max] of [
      ['pitch', 500],
      ['tone', 200],
      ['signature', 500],
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE message_style_templates DROP CONSTRAINT IF EXISTS message_style_templates_${column}_length_check`,
      )
      await queryRunner.query(`
        ALTER TABLE message_style_templates
          ADD CONSTRAINT message_style_templates_${column}_length_check
          CHECK (${column} IS NULL OR char_length(${column}) BETWEEN 1 AND ${max})
      `)
    }
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
