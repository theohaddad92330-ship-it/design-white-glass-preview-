import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2861 (#2437.2, 26/09/2026) — le niveau DESTINATAIRE des quatre niveaux de
 * langue demandés (membre/workspace/destinataire/source). Seul « membre »
 * était stocké ET utilisé ; `workspace.defaultLocale` existe mais n'est
 * branché à aucune génération, et destinataire/source ne stockaient rien.
 * Ce lot ferme le stockage du niveau DESTINATAIRE — le seul des quatre qui
 * manquait une colonne, corrigible en tranche minimale (migration + contrat
 * + saisie), sans toucher aux prompts IA sensibles cités par l'épopée
 * (message.py / bellum_outreach.py / phase4_plan.py, #2437.11, hors lot).
 *
 * MÊME CATALOGUE QUE `marketLocaleSchema` (`workspace.ts`) — 'fr' | 'en' |
 * 'de' — un deuxième catalogue divergerait dès le premier ajustement
 * (GA-26). `NULL` = non renseigné, jamais deviné depuis une adresse ou un
 * secteur (doctrine « jamais de donnée fictive »).
 *
 * La contrainte SQL est ÉLARGIE ici, AVANT le code qui écrit (GA-11/GA-12).
 */
export class ContactLocale1796321999830 implements MigrationInterface {
  name = 'ContactLocale1796321999830'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS locale text;
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_locale_check;
      ALTER TABLE contacts ADD CONSTRAINT contacts_locale_check CHECK (locale IS NULL OR locale IN ('fr', 'en', 'de'));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_locale_check;
      ALTER TABLE contacts DROP COLUMN IF EXISTS locale;
    `)
  }
}
