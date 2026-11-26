import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `accounts.status = 'prospect'` — la valeur que le code écrit et que la base
 * refuse depuis toujours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `analysisStatusSchema` déclare `prospect` (un compte versé au portefeuille
 * depuis Découvrir, jamais analysé — aucun dossier n'est fabriqué), et
 * `AccountsService.addToPortfolio` l'écrit. Or AUCUNE déclaration de
 * `accounts_status_check` ne l'a jamais autorisé : ni celle d'origine, ni les
 * quatre élargissements successifs.
 *
 * La contrainte rejetait donc l'insertion, l'exception était avalée par le
 * `catch` du service, et l'utilisateur lisait « Impossible d'ajouter ce compte
 * au portefeuille ». Un bouton mort, avec un message qui ne dit pas pourquoi.
 *
 * C'est la deuxième occurrence exacte du même mécanisme (la première :
 * `account_vocabulary.kind`, le 21/07). La garde **GA-12** est posée avec cette
 * migration : elle compare désormais chaque contrainte à SON énumération
 * TypeScript, et c'est elle qui a trouvé celle-ci.
 *
 * ⚠️ La liste repart de la DERNIÈRE déclaration (`1789910000003`) et non d'une
 * plus ancienne — perdre `archived`/`deleted`/`imported` en chemin ferait
 * échouer le `ADD CONSTRAINT` sur les lignes qui les portent, et comme les
 * migrations sont le `preDeployCommand` de Railway, le déploiement entier
 * serait abandonné sans que rien ne le dise (GA-11).
 */
export class AccountProspectStatus1789990000001 implements MigrationInterface {
  name = 'AccountProspectStatus1789990000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('analyzing', 'completed', 'error', 'canceled', 'archived', 'deleted', 'imported', 'prospect'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('analyzing', 'completed', 'error', 'canceled', 'archived', 'deleted', 'imported'))`,
    )
  }
}
