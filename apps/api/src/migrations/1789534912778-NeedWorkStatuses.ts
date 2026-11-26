import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les onze états de besoin, EN BASE (PDF 2 §7.4, décision D13 de Louis).
 *
 * Le terrain manipule onze états — à qualifier, qualifié, matching à lancer,
 * matching en cours, shortlist prête, profil proposé, en validation client,
 * gagné, perdu, en veille, à réactiver — là où le contrat n'en connaissait que
 * quatre. Le document proposait de dériver une « phase de travail » ; l'arbitrage
 * a retenu l'inverse : l'état est STOCKÉ, donc filtrable, indexable, et surtout
 * POSABLE par un humain — un recruteur met un besoin en veille, il ne le déduit
 * pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Additif, jamais un renommage
 * ─────────────────────────────────────────────────────────────────────────
 * Le premier interdit du §2.3 du PDF 1 est de renommer une valeur d'enum, et la
 * garde `enum-additivity` le refuse. Les quatre valeurs historiques restent donc
 * ACCEPTÉES par la contrainte pendant que les données sont reprises
 * (`open → to_qualify`, `staffed → won`). Une écriture en vol pendant le
 * déploiement ne peut ainsi pas être rejetée — c'est exactement l'accident que
 * la contrainte `account_vocabulary.kind` avait déjà coûté.
 *
 * `cancelled` survit comme état de plein droit : un besoin annulé par l'ESN
 * n'est pas un besoin PERDU chez le client, et les confondre fausserait le taux
 * de perte, qui est l'un des rares chiffres que l'ESN regarde vraiment.
 *
 * L'ordre compte : la contrainte est élargie AVANT la reprise. L'inverse
 * écrirait des valeurs que la table refuse encore.
 */
export class NeedWorkStatuses1789534912778 implements MigrationInterface {
  name = 'NeedWorkStatuses1789534912778'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_status_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_status_check CHECK (
        status IN (
          'open','staffed','lost','cancelled',
          'to_qualify','qualified','to_match','matching','shortlist_ready',
          'submitted','client_review','won','on_hold','to_reactivate'
        )
      )
    `)
    await queryRunner.query(`ALTER TABLE project_needs ALTER COLUMN status SET DEFAULT 'to_qualify'`)

    await queryRunner.query(`UPDATE project_needs SET status = 'to_qualify' WHERE status = 'open'`)
    await queryRunner.query(`UPDATE project_needs SET status = 'won' WHERE status = 'staffed'`)

    // Le motif de clôture : obligatoire sur une perte, comme sur un projet.
    // Colonne NULLABLE — les besoins déjà perdus n'ont pas de motif, et en
    // inventer un serait pire que de le laisser vide.
    await queryRunner.query(`ALTER TABLE project_needs ADD COLUMN IF NOT EXISTS status_reason text`)
    await queryRunner.query(`ALTER TABLE project_needs ADD COLUMN IF NOT EXISTS status_changed_at timestamptz`)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS project_needs_status_idx ON project_needs (workspace_id, status)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE project_needs SET status = 'open' WHERE status NOT IN ('lost','cancelled','won')`)
    await queryRunner.query(`UPDATE project_needs SET status = 'staffed' WHERE status = 'won'`)
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_status_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_status_check CHECK (
        status IN ('open','staffed','lost','cancelled')
      )
    `)
    await queryRunner.query(`ALTER TABLE project_needs ALTER COLUMN status SET DEFAULT 'open'`)
    await queryRunner.query(`ALTER TABLE project_needs DROP COLUMN IF EXISTS status_reason`)
    await queryRunner.query(`ALTER TABLE project_needs DROP COLUMN IF EXISTS status_changed_at`)
  }
}
