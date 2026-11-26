import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La clause de non-sollicitation d'une relation partenaire — la donnée qui
 * ARME un refus déjà écrit.
 *
 * `partnerRelationScore` refuse « viser le rang 1 » sur deux gardes DURES :
 * une clause de non-sollicitation, et un partenaire qui est aussi notre client.
 * Les deux étaient écrites, testées au contrat, et **jamais armées** — l'unique
 * appelant ne passait ni l'une ni l'autre. `rank1Blocked` valait donc `null`
 * sur toutes les relations de tous les espaces, et l'écran ne montrait aucun
 * garde-fou là où il croyait en montrer deux.
 *
 * « Aussi notre client » se lisait déjà dans `roles` : il ne manquait que
 * l'appel. La clause, elle, n'existait NULLE PART — aucune colonne, aucun
 * formulaire, aucune source. C'est ce que cette migration corrige.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SUR LA RELATION, ET NON SUR LE COMPTE FINAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Le contrat nomme le champ « le compte final porte-t-il une clause de
 * non-sollicitation ». Dans les faits, la clause ne vit pas chez le client :
 * elle vit dans le CADRE signé avec le partenaire, et elle couvre les clients
 * qu'il nous ouvre. C'est d'ailleurs pour cela que l'étape `cadre_signe`
 * existe. La porter sur la relation la met là où quelqu'un peut la déclarer au
 * moment où il la lit — c'est-à-dire à la signature.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI NULLABLE, ET SURTOUT PAS `NOT NULL DEFAULT false`
 * ─────────────────────────────────────────────────────────────────────────────
 * `false` voudrait dire « il n'y a pas de clause », c'est-à-dire une AUTORISATION
 * de contourner le partenaire, écrite sur toutes les lignes de tous les espaces
 * par une migration que personne n'a lue. `NULL` dit « personne ne l'a
 * déclarée », ce qui est la vérité le jour où la colonne apparaît. Les deux ne
 * mènent pas à la même décision, et l'écran les distingue.
 */
export class PartnerNonSolicitation1790700003003 implements MigrationInterface {
  name = 'PartnerNonSolicitation1790700003003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_relations
        ADD COLUMN IF NOT EXISTS non_solicitation boolean
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN partner_relations.non_solicitation IS
        'Le cadre signe avec ce partenaire porte-t-il une clause de non-sollicitation de ses clients finaux ? NULL = personne ne l''a declaree, jamais "il n''y en a pas". Arme la garde dure rank1Blocked de partnerRelationScore.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE partner_relations DROP COLUMN IF EXISTS non_solicitation`)
  }
}
