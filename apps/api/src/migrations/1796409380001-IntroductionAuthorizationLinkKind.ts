import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3403.7 — LE TYPE DE LIEN D'UNE INTRODUCTION, ENFIN PERSISTÉ.
 *
 * `ContactWarmIntroCard` classe déjà le lien (`LinkKind`, dix puis treize
 * types — #2373.2/#3403) dans un `useState` de la session : le docblock de la
 * carte le disait en toutes lettres, « le serveur ne les persiste pas encore ».
 * Résultat mesuré : aucun écran de compte ne peut dire « ce contact ouvre une
 * voie parce que c'est un ancien collègue » — l'information existe un instant,
 * dans le navigateur d'un seul commercial, puis disparaît au rafraîchissement.
 *
 * `link_kind` est NULLABLE : une ligne déjà en base, ou une saisie qui n'a pas
 * choisi de type, n'en porte aucun — jamais un type deviné après coup.
 * `verified` est `boolean NOT NULL DEFAULT false` : une ligne existante n'a
 * jamais été vérifiée par cette saisie-ci (elle ne portait pas le concept), et
 * `false` est le défaut SÛR — une case cochée par défaut affirmerait une
 * vérification que personne n'a faite.
 */
export class IntroductionAuthorizationLinkKind1796409380001 implements MigrationInterface {
  public name = 'IntroductionAuthorizationLinkKind1796409380001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE introduction_authorizations
        ADD COLUMN IF NOT EXISTS link_kind text,
        ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
