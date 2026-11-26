import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le cache de l'historique des deals, et la trace de sa synchronisation.
 *
 * Arbitrage Louis du 03/08 : « lecture profonde + cache ». Les taux de
 * conversion, les cycles moyens et les rapports trimestriels que réclament les
 * méta-analyses (§8 conseil n°8/22/28, §13.3 n°5/23/34/40) ne se lisent nulle
 * part — ils se calculent sur TOUT l'historique. Sans cache, chaque ouverture
 * d'écran relirait des milliers de deals : le quota d'API de l'utilisateur y
 * passerait, et l'écran mettrait une minute à s'afficher.
 *
 * Deux tables plutôt qu'une : les faits, et ce qu'on sait de la lecture qui les
 * a produits. La seconde existe parce que « combien de deals ont été lus » et
 * « la lecture a-t-elle été tronquée » sont des propriétés de la LECTURE, pas
 * d'un deal. Les déduire des faits — en comptant les lignes — donnerait un
 * nombre juste et une troncature invisible.
 *
 * `is_won` est volontairement NULLABLE. Un deal ouvert n'est pas perdu, et un
 * deal clos dont le fournisseur ne dit pas l'issue n'est ni l'un ni l'autre.
 * Un booléen non nul aurait forcé à choisir, et le choix par défaut — `false` —
 * aurait fait chuter le taux de conversion de tous les portails.
 */
export class CrmDealFacts1788900000001 implements MigrationInterface {
  public name = 'CrmDealFacts1788900000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_deal_facts (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id    uuid NOT NULL,
        provider        text NOT NULL,
        deal_id         text NOT NULL,
        name            text,
        stage           text,
        stage_label     text,
        pipeline        text,
        amount          numeric,
        owner_id        text,
        owner_name      text,
        deal_created_at timestamptz,
        closed_at       timestamptz,
        is_closed       boolean NOT NULL DEFAULT false,
        is_won          boolean,
        synced_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT crm_deal_facts_unique UNIQUE (workspace_id, provider, deal_id)
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS crm_deal_facts_workspace_idx ON crm_deal_facts (workspace_id)`)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS crm_deal_facts_closed_idx ON crm_deal_facts (closed_at)`)
    await queryRunner.query(`ALTER TABLE crm_deal_facts ENABLE ROW LEVEL SECURITY`)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_pipeline_syncs (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        provider     text NOT NULL,
        deals_read   int NOT NULL DEFAULT 0,
        truncated    boolean NOT NULL DEFAULT false,
        synced_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT crm_pipeline_syncs_unique UNIQUE (workspace_id, provider)
      )
    `)
    await queryRunner.query(`ALTER TABLE crm_pipeline_syncs ENABLE ROW LEVEL SECURITY`)
    // Aucune politique permissive : ces tables ne sont lues que par l'API
    // (clé de service). Un pipeline commercial complet n'a rien à faire côté
    // client, même pour son propre espace.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS crm_deal_facts`)
    await queryRunner.query(`DROP TABLE IF EXISTS crm_pipeline_syncs`)
  }
}
