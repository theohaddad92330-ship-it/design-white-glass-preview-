import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1756 — `market_company_alias` : le réceptacle du rapprochement qu'on ne peut
 * pas DEVINER à la lecture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE TABLE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le corpus (`market_company_signal`) est indexé sur SON libellé, le registre
 * sur la raison sociale. « SG SOCIETE GENERALE » ne rencontre donc jamais
 * « SOCIETE GENERALE » et ses 267 parcours observés — mesuré en production le
 * 08/09/2026. La jointure rend zéro **sans jamais échouer**, et zéro se lit
 * « Bellum n'a pas d'observations sur ce compte », ce qui est faux.
 *
 * ⚠️ Ce n'est PAS un élargissement de `NOISE_TOKENS` : #1756 refuse
 * explicitement l'heuristique (« il jettera un jour le préfixe qui EST le
 * nom »), et la classe de noms touchée n'est pas bornée — abréviations (`SG`,
 * `CIC`, `BNP`), mots insérés (« SOCIETE NATIONALE SNCF » contre « SNCF »).
 * Un alias est une DÉCISION enregistrée ; un token retiré est une devinette
 * appliquée à soixante mille lignes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE CHOIX DE SCHÉMA, ET CE QU'ILS PORTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Pas de `workspace_id`.** Un rapprochement entre une raison sociale et une
 *    entreprise du corpus est un fait de MARCHÉ, le même pour tous les espaces
 *    — la raison exacte des quatre tables `market_*` (GA-16, `table-scopes.ts`).
 *    Elle ne porte aucune donnée d'espace, et n'en portera pas.
 *
 * 2. **`(alias_key, company_key)` est UNIQUE, `alias_key` seul ne l'est PAS.**
 *    Un alias qui viserait deux entreprises est une AMBIGUÏTÉ ; la base doit
 *    pouvoir la stocker, sinon l'ingestion est forcée d'en choisir une au
 *    hasard — le défaut que #1617 a payé un cran plus bas. C'est la lecture qui
 *    refuse de départager (`resolveMarketCompany`), pas le schéma qui interdit
 *    d'écrire la vérité.
 *
 * 3. **Aucune clé étrangère vers `market_company_signal`.** Le corpus est
 *    RÉIMPORTÉ : une contrainte référentielle ferait échouer un import qui
 *    retire une clé, et une cascade détruirait l'alias — or on archive, on ne
 *    supprime pas. Un alias qui vise une entreprise absente du corpus ne
 *    désigne rien à la lecture, ce qui est la bonne réponse.
 *
 * 4. **Aucune contrainte `CHECK` sur `source`.** QUI remplit cette table est une
 *    décision produit EN ATTENTE (le pack de données livre les alias, ou ils
 *    viennent du registre). Figer le vocabulaire maintenant refuserait la
 *    valeur de la décision qui n'est pas prise — et une contrainte ne se
 *    rétrécit pas, elle s'élargit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'écrit **aucune ligne**. Pas un alias deviné, pas un « SG → société
 * générale » posé à la main : ce serait exactement la donnée fictive que le
 * dépôt refuse. Table vide ⇒ le rapprochement rend ce qu'il rendait avant elle.
 */
export class MarketCompanyAlias1791853204617 implements MigrationInterface {
  public name = 'MarketCompanyAlias1791853204617'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_company_alias (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        alias_key text NOT NULL,
        alias_label text NOT NULL,
        company_key text NOT NULL,
        source text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_market_company_alias_pair ON market_company_alias (alias_key, company_key)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_market_company_alias_key ON market_company_alias (alias_key)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS market_company_alias`)
  }
}
