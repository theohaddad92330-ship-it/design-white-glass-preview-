import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Élargit `contacts_source_check` à la source `import`.
 *
 * ⚠️ Un contact venu d'un import de masse était estampillé `manual`, exactement
 * comme une fiche saisie à la main. Six mois plus tard, personne ne peut plus
 * dire ce qui vient de la reprise de l'ancien CRM et ce qu'un commercial a
 * réellement vérifié — et c'est justement la distinction dont on a besoin le
 * jour où une adresse rebondit ou qu'un contact se plaint de la provenance de
 * ses coordonnées. `field_provenance` arbitre les CHAMPS ; la source d'un
 * contact dit d'où vient la LIGNE, et rien d'autre ne le porte.
 *
 * La migration passe AVANT le code qui écrit la valeur. C'est la leçon
 * d'`account_vocabulary.kind`, puis de Hunter/Lusha : toute valeur qui voyage du
 * code vers la base voit sa contrainte élargie d'abord, sinon le premier INSERT
 * échoue en production au moment précis où l'utilisateur attend son import.
 *
 * La liste est réécrite en entier plutôt qu'ajoutée : un CHECK ne se complète
 * pas, il se remplace, et lister l'ensemble rend l'autorisé lisible d'un coup
 * d'œil.
 */
export class ImportedContactSource1790040000001 implements MigrationInterface {
  public name = 'ImportedContactSource1790040000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check`)
    await queryRunner.query(`
      ALTER TABLE contacts
      ADD CONSTRAINT contacts_source_check
      CHECK (source IN ('linkedin_apify', 'apollo', 'ai_generated', 'brave_search', 'ia_reconstruction', 'pappers', 'manual', 'dropcontact', 'demo', 'hunter', 'lusha', 'import'))
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
