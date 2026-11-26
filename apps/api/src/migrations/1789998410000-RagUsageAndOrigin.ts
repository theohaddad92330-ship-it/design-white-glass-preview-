import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le magasin RAG gagne sa traçabilité et son origine (tome 7 §38, M2/M3/M6).
 *
 * Trois manques que l'audit nomme, et une seule migration parce qu'ils portent
 * tous sur la même table et qu'aucun n'a de sens sans les autres :
 *
 * - **M2, la trace d'usage.** On ne savait pas quels documents SERVENT. Sans
 *   `used_count`, la purge de M3 ne peut pas exister — elle ne saurait pas ce
 *   qu'elle a le droit d'effacer — et personne ne peut dire si le RAG apporte
 *   quelque chose.
 * - **M6, l'origine.** La connaissance déposée par l'ESN (méthode, trames, cas
 *   clients) et la connaissance distillée d'une analyse vivaient dans deux
 *   mondes. Un seul magasin, deux origines : une question sur la méthode maison
 *   et une question sur un compte prennent le même chemin.
 *
 * Tout est ADDITIF et nullable. Les documents existants gardent `used_count = 0`
 * — ce qui est vrai : on ne sait pas s'ils ont servi, et un compteur inventé
 * ferait purger ou épargner au hasard. Le défaut d'origine est `distilled`,
 * parce que c'est ce qu'ils sont tous jusqu'à aujourd'hui.
 */
export class RagUsageAndOrigin1789998410000 implements MigrationInterface {
  name = 'RagUsageAndOrigin1789998410000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS used_count integer NOT NULL DEFAULT 0`)
    await queryRunner.query(`ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS last_used_at timestamptz`)
    // Où le document a RÉELLEMENT servi — le nom de la fonctionnalité, pas un
    // identifiant de requête : ce qu'on veut savoir est « le RAG sert-il au
    // copilote ou seulement à l'analyse ? », pas « quelle requête, à 14 h 02 ».
    await queryRunner.query(`ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS used_in text[] NOT NULL DEFAULT '{}'`)
    await queryRunner.query(
      `ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'distilled'`,
    )
    // La contrainte est posée APRÈS le défaut : l'inverse rejetterait les lignes
    // existantes, qui n'ont pas encore de valeur au moment du CHECK.
    await queryRunner.query(`
      ALTER TABLE rag_documents
        DROP CONSTRAINT IF EXISTS rag_documents_origin_check
    `)
    await queryRunner.query(`
      ALTER TABLE rag_documents
        ADD CONSTRAINT rag_documents_origin_check CHECK (origin IN ('distilled', 'uploaded'))
    `)
    // L'incrément vit dans une FONCTION SQL et pas dans le service : un
    // `UPDATE … SET used_count = used_count + 1` envoyé depuis Python devrait
    // d'abord LIRE la valeur (le client Supabase n'exprime pas l'incrément
    // atomique), et deux réponses simultanées qui citent le même document
    // écriraient alors la même valeur. Le compteur sous-compterait exactement
    // sur les documents les plus utilisés — ceux qu'il sert à protéger.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION mark_rag_documents_used(doc_ids uuid[], feature text)
      RETURNS void
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public, extensions
      AS $fn$
        UPDATE rag_documents
           SET used_count = used_count + 1,
               last_used_at = now(),
               -- Le nom de la fonctionnalité n'est ajouté qu'une fois : la
               -- colonne dit OÙ le document sert, pas combien de fois.
               used_in = CASE
                 WHEN feature = ANY(used_in) THEN used_in
                 ELSE array_append(used_in, feature)
               END
         WHERE id = ANY(doc_ids);
      $fn$
    `)

    // La purge de M3 balaye « jamais utilisé depuis 12 mois » : elle lit
    // `used_count` et `created_at`, et rien d'autre.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS rag_documents_usage_idx ON rag_documents (used_count, created_at)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS mark_rag_documents_used(uuid[], text)`)
    await queryRunner.query(`DROP INDEX IF EXISTS rag_documents_usage_idx`)
    await queryRunner.query(`ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_origin_check`)
    await queryRunner.query(`ALTER TABLE rag_documents DROP COLUMN IF EXISTS origin`)
    await queryRunner.query(`ALTER TABLE rag_documents DROP COLUMN IF EXISTS used_in`)
    await queryRunner.query(`ALTER TABLE rag_documents DROP COLUMN IF EXISTS last_used_at`)
    await queryRunner.query(`ALTER TABLE rag_documents DROP COLUMN IF EXISTS used_count`)
  }
}
