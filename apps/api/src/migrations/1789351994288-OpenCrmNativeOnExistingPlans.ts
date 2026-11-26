import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ouvre `crm_native` et `ats_native` sur les grilles DÉJÀ écrites en base.
 *
 * Défaut constaté en production le 17/08, dix minutes après le déploiement du
 * socle CRM : `PATCH /accounts/:id` et `GET /notes` répondaient **403** pour
 * tout le monde. La cause n'est pas le code — c'est que `plan_definitions.features`
 * porte une grille FIGÉE, écrite avant que ces deux clés existent. Ajouter une
 * feature au contrat et au catalogue par défaut ne touche donc AUCUN espace déjà
 * provisionné : la porte se ferme en silence sur tous les clients existants,
 * et sur le compte de démonstration.
 *
 * C'est la même leçon que la contrainte CHECK d'`account_vocabulary.kind` :
 * toute valeur qui voyage du code vers la base doit voir la base élargie AVANT
 * — ou, ici, EN MÊME TEMPS — que le code qui s'appuie dessus.
 *
 * Trois propriétés :
 *
 *  - **Additive.** On ajoute les deux clés, on n'en retire aucune et on ne
 *    réordonne rien. Une grille qu'un opérateur a restreinte garde ses autres
 *    décisions intactes.
 *  - **Idempotente.** `WHERE NOT ... @> ...` : rejouer la migration ne fait
 *    rien, et l'opérateur qui retire volontairement la clé plus tard n'aura pas
 *    à se battre contre elle.
 *  - **Sur TOUS les paliers.** Ces deux clés sont ouvertes par défaut (arbitrage
 *    Louis du 16/08) : le CRM et l'ATS natifs sont les objets de base du travail,
 *    et un palier payant qui n'y donnerait pas accès ne vaudrait rien. La grille
 *    peut se resserrer ensuite depuis le back-office.
 */
export class OpenCrmNativeOnExistingPlans1789351994288 implements MigrationInterface {
  public name = 'OpenCrmNativeOnExistingPlans1789351994288'

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const feature of ['crm_native', 'ats_native']) {
      await queryRunner.query(
        `UPDATE plan_definitions
            SET features = COALESCE(features, '[]'::jsonb) || to_jsonb($1::text), updated_at = NOW()
          WHERE NOT COALESCE(features, '[]'::jsonb) @> to_jsonb($1::text)`,
        [feature],
      )
    }
  }

  public async down(): Promise<void> {
    // Retirer la clé rendrait un 403 à tous les espaces : la porte se refermerait
    // exactement comme elle s'est fermée. On ne redescend pas.
    throw new Error('down migrations are not supported')
  }
}
