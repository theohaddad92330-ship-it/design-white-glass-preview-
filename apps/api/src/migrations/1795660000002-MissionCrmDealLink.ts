import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE LIEN MISSION → DEAL CRM (`missions.crm_deal_id`) — lot Y, #2561/#2562
 * (retours CLIENT de François Thomas, call bêta du 17/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Un premier écrivain a buté ici : aucun lien n'existait entre une mission et
 * le deal CRM qui lui correspond. `crm_deal_facts` (migration `1788900000001`)
 * porte déjà le cache des deals — nom, stade, montant, propriétaire — mais rien
 * ne le rattache à une mission de `missions`. Sans ce lien, « les ventes de ton
 * CRM apparaissent rattachées à la mission correspondante » (#2561) n'a nulle
 * part où lire le rattachement, et « proposer la reprise de tes missions depuis
 * ton CRM » (#2562) n'a nulle part où l'écrire une fois la proposition validée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MÊME FORME QUE `missions.need_id` (migration `1791001000001`), MÊME RAISON
 * ─────────────────────────────────────────────────────────────────────────────
 * `need_id` référence `project_needs` pour dire QUEL rôle d'une affaire une
 * mission pourvoit. `crm_deal_id` référence `crm_deal_facts` pour dire QUEL
 * deal du CRM branché correspond à cette mission. Les deux sont des
 * RÉFÉRENCES, jamais des énumérations : aucune contrainte `CHECK` ici, et donc
 * rien à inscrire au `MAPPING` de `check-constraints-cover-enums.spec.ts`.
 *
 * NULLABLE, et ça le reste : la quasi-totalité des missions existantes n'ont
 * aucun deal correspondant (aucun CRM n'a jamais été connecté, ou le CRM
 * connecté n'est pas un des quatre fournisseurs à contrat vérifié — HubSpot,
 * Salesforce, Pipedrive, Attio). Une valeur absente veut dire « pas de
 * correspondance connue », jamais « ce deal a été perdu » — c'est la même
 * distinction que celle que `crm_deal_facts.is_won` porte déjà pour un deal.
 *
 * `ON DELETE SET NULL` : la purge d'un deal disparu du portail (voir
 * `CrmDepthService.syncPipeline`) ne doit pas emporter la mission — sa
 * facturation, son relevé d'activité et sa marge survivent, seul le
 * rattachement redevient inconnu.
 *
 * Écrite par `crm_deal_id` : UNE mission peut porter au plus un deal (colonne
 * simple, pas de table de jonction) — c'est la correspondance que #2561/#2562
 * demandent, jamais l'inverse (un deal peut, en théorie, ne correspondre à
 * aucune mission tant que personne n'a validé sa reprise).
 */
export class MissionCrmDealLink1795660000002 implements MigrationInterface {
  public name = 'MissionCrmDealLink1795660000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS crm_deal_id uuid REFERENCES crm_deal_facts(id) ON DELETE SET NULL
    `)
    // Sert la lecture du panneau de mission (« quel deal cette mission
    // porte-t-elle ? », une fois par fiche ouverte) sans balayer `missions`.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_missions_crm_deal_id ON missions (crm_deal_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_missions_crm_deal_id`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS crm_deal_id`)
  }
}
