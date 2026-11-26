import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La signature RÉELLE de l'utilisateur, éditable dans Bellum.
 *
 * Garde-fou n°2 des méta-analyses besoins (03/08/2026) : « ne jamais utiliser
 * "signature" comme marque-place ; insérer la signature réelle ». On peut la
 * lire chez Google (`users.settings.sendAs`), mais pas chez Microsoft — Graph
 * n'expose pas la signature Outlook, elle vit côté client. Sans cette colonne,
 * la moitié des utilisateurs auraient donc des brouillons non signés sans aucun
 * moyen d'y remédier depuis le produit.
 *
 * Ordre de résolution appliqué par `MailboxService.resolveSignature` : cette
 * colonne d'abord (une saisie explicite est une intention récente), la
 * signature du fournisseur ensuite, `null` en dernier — et `null` veut dire
 * « brouillon sans signature », jamais « signature inventée ».
 *
 * Additive et idempotente. Aucune valeur par défaut : une signature par défaut
 * serait précisément le marque-place que la règle interdit.
 */
export class MailboxSignature1788800000001 implements MigrationInterface {
  public name = 'MailboxSignature1788800000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS email_signature text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE profiles DROP COLUMN IF EXISTS email_signature`)
  }
}
