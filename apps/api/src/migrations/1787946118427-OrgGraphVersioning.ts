import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Versionnement du graphe d'organigramme + mémoire des éléments écartés
 * (Annexe Organigramme §5, étape 5 « persist graph_version et rejected_items »).
 *
 * Le graphe typé (`raw_analysis.org.orgGraph`) porte déjà `graphVersion` et
 * `rejectedItems`, mais RIEN ne les persistait hors du blob : chaque run
 * réécrivait le blob à neuf, si bien que (a) une correction utilisateur ne
 * produisait aucune nouvelle version — la mémoire de correction ne déposait
 * qu'une directive texte pour le prochain prompt — et (b) un contact écarté
 * (bruit, homonyme, « signalé parti ») revenait au run suivant, l'assembleur
 * repartant d'une ardoise vierge.
 *
 * Deux colonnes sur `accounts`, hors du blob, parce que ce sont exactement les
 * deux choses qui doivent SURVIVRE au blob :
 *   · `org_graph_version`  — compteur monotone, +1 à chaque correction ;
 *   · `org_rejected_items` — `[{sourceId, reason}]`, l'ardoise des rejets à ne
 *     jamais réinjecter, relue au lancement du run suivant.
 *
 * Additive et idempotente. Les valeurs par défaut (1 / `[]`) donnent aux
 * dossiers antérieurs exactement le comportement d'avant : version 1, aucune
 * mémoire de rejet, graphe inchangé.
 */
export class OrgGraphVersioning1787946118427 implements MigrationInterface {
  public name = 'OrgGraphVersioning1787946118427'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS org_graph_version integer NOT NULL DEFAULT 1`,
    )
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS org_rejected_items jsonb NOT NULL DEFAULT '[]'::jsonb`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS org_rejected_items`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS org_graph_version`)
  }
}
