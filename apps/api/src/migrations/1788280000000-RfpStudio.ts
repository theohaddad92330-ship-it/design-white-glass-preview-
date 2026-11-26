import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * RFP/RFQ Studio — la table qui manquait (addendum final p66-68).
 *
 * Un appel d'offres se traitait jusqu'ici hors du produit : le cahier des charges
 * dans une boîte mail, les exigences recopiées dans un tableur, la décision d'y
 * aller prise de mémoire, et la réponse assemblée à partir de morceaux d'anciennes
 * réponses dont personne ne savait plus si elles avaient été validées.
 *
 * Une seule table suffit, parce qu'un dossier d'appel d'offres est un AGRÉGAT :
 * ses exigences n'ont pas de vie propre (jamais lues hors du dossier, jamais
 * jointes, jamais filtrées en SQL) et la matrice de conformité les relit toutes
 * à chaque affichage. Les mettre en table fille coûterait une jointure par
 * lecture pour aucun bénéfice.
 *
 * `source_text` conserve le document extrait : c'est ce qui permet de
 * re-analyser un dossier quand le prompt s'améliore, sans redemander le fichier,
 * et de vérifier après coup qu'une exigence extraite figure bien dans l'original.
 */
export class RfpStudio1788280000000 implements MigrationInterface {
  public name = 'RfpStudio1788280000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rfps (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid NOT NULL,
        account_id uuid,
        title text NOT NULL,
        issuer text,
        source_format text NOT NULL,
        status text NOT NULL,
        due_at timestamptz,
        lots jsonb NOT NULL DEFAULT '[]'::jsonb,
        source_text text,
        decision jsonb,
        requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // La requête chaude est « les dossiers de mon espace, les plus urgents
    // d'abord » : une échéance proche passe avant un import récent.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS rfps_workspace_due_idx
      ON rfps (workspace_id, status, due_at NULLS LAST)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
