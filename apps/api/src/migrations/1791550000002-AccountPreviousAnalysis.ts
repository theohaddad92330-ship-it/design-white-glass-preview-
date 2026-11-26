import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Garder UNE version précédente du dossier, pour qu'il y ait quelque chose à
 * comparer (D213 du dossier du 26 août).
 *
 * « Le tiroir "ce qui a changé" commence par le stockage, pas par l'écran. Sans
 * deux versions conservées, il n'y a rien à comparer — c'est la vraie dépense,
 * et elle rejoint "on archive, on ne supprime pas". » Aujourd'hui le dossier est
 * ÉCRASÉ à chaque analyse : `analysis_runs` garde une ligne par run, mais elle
 * ne porte que les MÉTADONNÉES (statut, coût, périmètre) — jamais le contenu.
 *
 * UNE version, pas un historique complet, et c'est un arbitrage :
 *  - la question à laquelle le tiroir répond est « qu'est-ce qui a changé
 *    DEPUIS LA DERNIÈRE FOIS », pas « quelle était la valeur en mars » ;
 *  - `raw_analysis` est un blob volumineux ; en garder N doublerait la table à
 *    chaque cran, pour une question que personne n'a encore posée.
 * Le jour où l'historique complet est demandé, il se pose par-dessus, et cette
 * colonne reste ce qu'elle est : la version d'avant.
 *
 * Les deux colonnes sont NULL sur tout l'existant, et c'est correct : « aucune
 * version précédente conservée » n'est pas « rien n'a changé ». Le lecteur doit
 * distinguer les deux, et il le fait — un dossier sans version précédente ne
 * rend AUCUN tiroir plutôt qu'un tiroir vide.
 */
export class AccountPreviousAnalysis1791550000002 implements MigrationInterface {
  name = 'AccountPreviousAnalysis1791550000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS previous_raw_analysis jsonb NULL
    `)
    await queryRunner.query(`
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS previous_analysis_at timestamptz NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS previous_analysis_at`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS previous_raw_analysis`)
  }
}
