import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2861 (#2437.2, 27/09/2026) — le niveau SOURCE des quatre niveaux de langue
 * demandés (membre/workspace/destinataire/source). Le lot g22 (26/09) avait
 * fermé DESTINATAIRE (`contacts.locale`) mais laissé SOURCE de côté : aucun
 * point d'entrée n'existait pour une langue DÉCLARÉE sur un document —
 * inventer la colonne sans lui donner un appelant aurait reproduit l'écueil
 * que g22 venait de fermer côté DESTINATAIRE.
 *
 * L'appelant existe : `POST rag-documents/ingest` (écran « base de
 * connaissance ») dépose déjà un document humain (`origin: 'uploaded'`) —
 * cette colonne lui donne un champ « Langue du document » à déclarer, jamais
 * détectée (doctrine « jamais de donnée fictive »).
 *
 * MÊME CATALOGUE QUE `marketLocaleSchema`/`contacts.locale` — 'fr' | 'en' |
 * 'de' — un deuxième catalogue divergerait dès le premier ajustement (GA-26).
 * `NULL` = non renseigné, jamais deviné.
 *
 * La contrainte SQL est ÉLARGIE ici, AVANT le code qui écrit (GA-11/GA-12).
 */
export class RagDocumentLanguage1796322770000 implements MigrationInterface {
  name = 'RagDocumentLanguage1796322770000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS language text;
      ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_language_check;
      ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_language_check CHECK (language IS NULL OR language IN ('fr', 'en', 'de'));
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_language_check;
      ALTER TABLE rag_documents DROP COLUMN IF EXISTS language;
    `)
  }
}
