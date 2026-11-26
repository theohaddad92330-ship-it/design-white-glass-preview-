import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE SLA D'ÉTAPE, RÉGLABLE PAR ESPACE — PDF 3 §3.5, `BEL-CRM-203` PR5.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE TABLE PORTE, ET CE QU'ELLE NE PORTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE ligne = un espace a réglé la durée cible d'UNE étape. Une ligne ABSENTE
 * veut dire « le défaut du produit » (`DEAL_STAGE_SLA_DEFAULTS`, 7/14/7/21),
 * jamais « zéro jour ». C'est la même convention que `pipeline_stage_labels`
 * pour les libellés, et pour la même raison : un réglage vit à un seul endroit,
 * et son absence est une information.
 *
 * ⚠️ Pourquoi une table et non une colonne de plus sur `pipeline_stage_labels`,
 * qui règle DÉJÀ une étape par espace : son `label` est `NOT NULL`. Un espace
 * ne pourrait donc régler un SLA qu'en renommant l'étape au passage — deux
 * réglages indépendants forcés de voyager ensemble, qui finiraient par se
 * contredire (supprimer un renommage effacerait un seuil).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONTRAINTE, ET POURQUOI ELLE LISTE CINQ ÉTAPES ET NON QUATRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `deal_stage_sla_stage_check` couvre les CINQ `PIPELINE_STAGES`, `won`
 * compris, exactement comme `pipeline_stage_labels_stage_check`. Le code, lui,
 * n'écrira jamais `won` (`effectiveStageSla` refuse un réglage sur une étape
 * sans durée cible) — mais une contrainte PLUS LARGE que ce qu'on écrit est
 * sans danger, tandis qu'une contrainte plus étroite que l'énumération
 * TypeScript est exactement ce que GA-12 existe pour empêcher. Élargir avant
 * d'écrire, jamais l'inverse (GA-11).
 *
 * `sla_days` est borné en base ET en TypeScript. Les deux, parce que la base
 * protège du SQL brut d'une reprise de données et que le TypeScript donne un
 * message lisible à l'utilisateur.
 */
export class DealStageSla1791560000001 implements MigrationInterface {
  name = 'DealStageSla1791560000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS deal_stage_sla (
        workspace_id uuid NOT NULL,
        stage text NOT NULL,
        sla_days integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, stage),
        CONSTRAINT deal_stage_sla_stage_check CHECK (
          stage IN ('qualified','confirmed','profiles_submitted','negotiation','won')
        ),
        CONSTRAINT deal_stage_sla_days_check CHECK (sla_days >= 1 AND sla_days <= 365)
      )
    `)
    // La lecture se fait TOUJOURS par espace : c'est la seule requête du
    // service, et sans cet index elle balaierait la table entière dès qu'un
    // millier d'espaces auront réglé quelque chose.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS deal_stage_sla_workspace_idx ON deal_stage_sla (workspace_id)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS deal_stage_sla_workspace_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS deal_stage_sla`)
  }
}
