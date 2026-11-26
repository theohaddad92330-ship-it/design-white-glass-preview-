import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2570 — trace du dernier enrichissement d'un consultant du vivier, même
 * patron que `1786500000000-ContactEnrichmentTrace` pour `contacts`.
 *
 * « Voir les consultants comme des contacts concernant l'enrichissement »
 * (retour bêta François Thomas, #2570) : un consultant bénéficie du même
 * enrichissement qu'un contact — même cascade fournisseur, mêmes règles de
 * coût — mais rien ne disait QUAND ni D'OÙ venait la dernière tentative. Sans
 * ces deux colonnes, la fiche ne peut pas afficher « poste actuel — source,
 * le DD/MM/YYYY » : la RECETTE de #2570 l'exige explicitement (« un fait
 * périmé redevient inconnu avec sa date, il ne disparaît pas »).
 *
 * - `last_enrichment_at`     : date de la dernière tentative (match ou non)
 * - `last_enrichment_source` : 'pipeline' (cascade fournisseur réelle) ou
 *   'demo' (espace de démonstration, donnée fictive) — jamais le nom d'un
 *   fournisseur (doctrine : « nos fournisseurs ne se nomment jamais »).
 *
 * Additif + idempotent (`ADD COLUMN IF NOT EXISTS`), colonnes nullables,
 * aucune donnée existante touchée, RLS inchangée (héritée de la table).
 */
export class ConsultantEnrichmentTrace1795660000001 implements MigrationInterface {
  public name = 'ConsultantEnrichmentTrace1795660000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS last_enrichment_at timestamptz`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS last_enrichment_source text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS last_enrichment_source`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS last_enrichment_at`)
  }
}
