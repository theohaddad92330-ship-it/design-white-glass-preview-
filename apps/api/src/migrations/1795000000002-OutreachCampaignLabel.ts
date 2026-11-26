import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2203.32 → .38 / #2153.29 — L'ÉTIQUETTE DE CAMPAGNE (arbitrage de Louis,
 * 16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ TRANCHÉ, ET CE QUI NE L'A PAS ÉTÉ
 * ─────────────────────────────────────────────────────────────────────────
 * #2203 décrivait une séquence-CAMPAGNE : un tableau d'audience multi-contacts
 * avec une ligne par personne. Le moteur, lui, crée UNE séquence PAR contact
 * (`contact_id`), et c'est ce qui lui permet de s'arrêter quand CETTE personne
 * répond — ce n'est pas une limite à corriger, c'est le bon modèle.
 *
 * L'arbitrage est donc un ÉTIQUETAGE, pas un objet : les séquences lancées
 * ensemble partagent une étiquette, et le tableau filtre dessus. **Aucune table
 * « campagne », aucun nouvel objet** — on ne le créera que si la cadence
 * commune est demandée après usage. Une table aurait apporté ses lectures, ses
 * écritures, et la question « qui gagne » quand une séquence est modifiée
 * seule.
 *
 * ADDITIVE SEULEMENT (GA-11 / GA-12), et la colonne est élargie AVANT le code
 * qui l'écrit : `text NULL`. `NULL` est la vérité d'une séquence lancée seule —
 * elle n'appartient à aucune campagne, et ce n'est pas la même chose qu'une
 * campagne sans nom.
 *
 * L'INDEX porte sur (workspace_id, campaign_label) : la lecture qui compte est
 * « toutes les séquences de CETTE étiquette, dans CET espace ».
 */
export class OutreachCampaignLabel1795000000002 implements MigrationInterface {
  name = 'OutreachCampaignLabel1795000000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_sequences ADD COLUMN IF NOT EXISTS campaign_label text;
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outreach_sequences_workspace_campaign_idx
        ON outreach_sequences (workspace_id, campaign_label)
        WHERE campaign_label IS NOT NULL;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS outreach_sequences_workspace_campaign_idx;
    `)
    await queryRunner.query(`
      ALTER TABLE outreach_sequences DROP COLUMN IF EXISTS campaign_label;
    `)
  }
}
