import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_report_attachments.download_url` — la colonne qui attendait un
 * stockage, et qui n'a plus lieu d'être (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE PART, ALORS QU'ON ARCHIVE PLUTÔT QUE DE SUPPRIMER
 * ─────────────────────────────────────────────────────────────────────────────
 * « On archive, on ne supprime pas » porte sur des FAITS — un compte, un
 * contact, une note. Ici il n'y a aucun fait à perdre : la colonne a été créée
 * le matin même (`1790970000003-ExpenseReportAttachments`), son propre docblock
 * écrivait « la colonne existe pour le jour où il en aura un [un stockage], et
 * jusque-là elle DIT l'absence », et **elle n'a JAMAIS été écrite** — ni par le
 * produit, ni par le semis de la salle de démonstration, qui y posait `NULL`
 * explicitement. Il n'existe donc, nulle part, une ligne dont cette colonne
 * porterait quelque chose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET SURTOUT : LA LAISSER SERAIT UNE PORTE À CÔTÉ DE LA PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le stockage rend un fichier par une URL SIGNÉE, fabriquée à la demande, qui
 * vit cinq minutes, et seulement après vérification du droit de lire la NOTE.
 * Une colonne `download_url` laissée là, à côté, invite exactement au geste
 * qu'on vient d'écarter : y ranger une URL durable, que la réponse de liste
 * publierait à tous les lecteurs et qu'un copier-coller ferait vivre pour
 * toujours. Ce n'est pas une hypothèse d'école — c'est le raccourci évident
 * pour qui reprendra ce code sans lire le docblock du service.
 *
 * Ce que l'écran lit désormais est `storage_object_id` : la DÉTENTION des
 * octets, jamais une adresse.
 *
 * ⚠️ `down()` la recrée NULLABLE et VIDE. C'est fidèle : elle n'a jamais rien
 * porté d'autre.
 */
export class DropAttachmentDownloadUrl1790990000003 implements MigrationInterface {
  public name = 'DropAttachmentDownloadUrl1790990000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE expense_report_attachments DROP COLUMN IF EXISTS download_url`)
    await queryRunner.query(`
      COMMENT ON TABLE expense_report_attachments IS
        'Justificatifs d''une note de frais (31/08/2026). retention_until est STOCKEE et non recalculee : ce qu''on oppose a un controle est la regle en vigueur AU MOMENT du depot. storage_object_id NULL = piece REFERENCEE sans octets - l''ecran n''offre alors aucun telechargement. Le fichier s''ouvre par une URL signee de cinq minutes, fabriquee a la demande apres verification du droit de lire la NOTE : aucune adresse durable n''est stockee.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE expense_report_attachments ADD COLUMN IF NOT EXISTS download_url text`)
  }
}
