import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3205.4 (épopée #3239) — trois des quatre champs manquants de la fiche
 * prestataire (LAU-FINAL-211) : `competitive_risk` (nommé SÉPARÉMENT de
 * `relationship` — une ESN peut être `partner` sur ce compte et porter un
 * risque concurrentiel ailleurs dans le groupe, les deux ne se déduisent pas
 * l'une de l'autre), `complementarity` (comment ce prestataire complète le
 * périmètre, texte libre — jamais un score), `next_verification_at` (quand
 * revérifier cette ligne, JAMAIS calculé : posé par un geste humain).
 *
 * Le quatrième champ de l'issue (`domaine`) n'est PAS repris ici : un domaine
 * de site a déjà été tenté et retiré du produit (`esn_directory.domain`,
 * voir le docblock de `accountPartnerSchema.logo_url`) — 93 % des domaines
 * dérivés du nom étaient faux. Deviner un domaine violerait « jamais de
 * donnée fictive ».
 *
 * NULLABLE, additive : une ligne déjà en base n'a ni risque ni
 * complémentarité ni prochaine vérification connus, et « non renseigné » est
 * une réponse honnête, jamais une valeur devinée.
 */
export class AccountPartnerCompetitiveFields1796376270851 implements MigrationInterface {
  name = 'AccountPartnerCompetitiveFields1796376270851'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_partners
        ADD COLUMN IF NOT EXISTS competitive_risk text,
        ADD COLUMN IF NOT EXISTS complementarity text,
        ADD COLUMN IF NOT EXISTS next_verification_at timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_partners
        DROP COLUMN IF EXISTS competitive_risk,
        DROP COLUMN IF EXISTS complementarity,
        DROP COLUMN IF EXISTS next_verification_at
    `)
  }
}
