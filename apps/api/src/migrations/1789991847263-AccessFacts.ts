import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `access_fact` — ce qu'on sait de la façon d'entrer chez un compte.
 *
 * Le tome 1 nomme lui-même la table (§14 point 5 : « elle alimente
 * `access_fact` »), et c'est le bon objet : le critère d'acceptation du ticket
 * BEL-ACC-003 est « chaque information d'accès porte sa SOURCE et sa DATE ».
 * Des colonnes sur `accounts` ne portent ni l'une ni l'autre sans qu'on leur en
 * ajoute deux chacune ; un FAIT les porte par construction — avec sa
 * provenance, donc avec la règle qui protège une correction humaine.
 *
 * `observed_at` est la date à laquelle le fait était VRAI, pas celle où on l'a
 * écrit. C'est elle qui décide de la péremption (§10.3) : un référencement
 * constaté en mars 2025 est périmé aujourd'hui, même si la ligne a été insérée
 * ce matin.
 *
 * Aucune contrainte d'unicité : plusieurs faits peuvent coexister sur la même
 * nature, et c'est voulu. Écraser l'ancien perdrait l'historique qui répond à
 * « depuis quand ce compte est-il fermé ? » ; c'est `bestAccessFact` qui
 * arbitre à la LECTURE, une fonction pure et testée.
 */
export class AccessFacts1789991847263 implements MigrationInterface {
  name = 'AccessFacts1789991847263'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_facts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        entity_id UUID REFERENCES account_entities(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        detail TEXT,
        source TEXT NOT NULL,
        provenance TEXT NOT NULL DEFAULT 'pipeline',
        observed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT access_facts_kind_check CHECK (kind IN ('lock','mode','cost','path')),
        CONSTRAINT access_facts_provenance_check CHECK (provenance IN ('human','connector','pipeline','model'))
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS access_facts_account_idx ON access_facts (account_id, kind)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS access_facts_workspace_idx ON access_facts (workspace_id)`)

    // Le pipeline ne doit pas empiler le MÊME constat à chaque analyse : un
    // compte réanalysé douze fois porterait douze fois « marché attribué à
    // Sopra », et l'onglet deviendrait illisible. Une correction HUMAINE, elle,
    // n'est jamais dédupliquée contre une autre : deux humains qui se
    // contredisent sont une information, pas un doublon.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS access_facts_pipeline_unique
        ON access_facts (account_id, kind, value)
        WHERE provenance = 'pipeline'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS access_facts`)
  }
}
