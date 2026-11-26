import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La photo mensuelle porte SA POPULATION (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PHOTO NE POUVAIT PAS DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `stock_snapshots` gardait `value` seule. « 7 comptes sans prochaine action »
 * en juillet, « 9 » en août : la variation se lit +2, et elle est juste. Mais
 * elle est ILLISIBLE — si le portefeuille est passé de 20 à 60 comptes suivis
 * dans le même temps, la qualité s'est AMÉLIORÉE pendant que le compteur
 * montait. Un agrégat qui ne dit pas sur combien il est calculé laisse croire à
 * une mesure complète : c'est la doctrine de GA-71 (« calculé sur … »), tenue
 * au calcul depuis des mois et absente de la photo.
 *
 * C'est aussi ce qui rend un TAUX photographiable. La règle du dépôt est « un
 * taux sans dénominateur vaut `null`, jamais 0 % » — sans cette colonne, aucun
 * taux ne pouvait entrer dans la table sans la violer le jour de sa première
 * photo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI NULLABLE, ET POURQUOI CE N'EST PAS UN ZÉRO
 * ─────────────────────────────────────────────────────────────────────────────
 * `NULL` veut dire « aucune population de référence n'a été lue » — jamais
 * « population vide ». Les deux se ressembleraient à `0`, et la différence est
 * exactement celle qui compte : un taux sur une population vide n'est pas
 * « 0 % », c'est une absence de mesure. La lecture (`metricDelta`, contrats)
 * refuse les deux, et pour la même raison.
 *
 * Deux métriques photographiées n'ont AUCUNE population, et c'est un choix
 * écrit, pas un oubli : `benchAvailable` et `activeClients` sortent de
 * `PilotageService.gatherInputs`, qui rend des dénombrements NUS. Inventer un
 * effectif ici serait une seconde définition de la population des consultants —
 * celle que `talents_unknown_availability` porte déjà, sur un prédicat
 * DIFFÉRENT. Le registre `METRIC_SNAPSHOT_DENOMINATOR` (contrats) porte la
 * raison de chacune.
 *
 * ⚠️ Les sept dénominateurs `hygiene` ne coûtent AUCUNE requête neuve :
 * `DataHygieneService.overview` calcule déjà `total` à côté de `count`, dans le
 * même `SELECT`, et le balayage le JETAIT. Une photo qui recalculerait sa
 * population serait la seconde dérivation que GA-26 refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `bigint`, ET LE PLAFOND QUI RESTE SUR `value`
 * ─────────────────────────────────────────────────────────────────────────────
 * `denominator` est en `bigint` parce qu'une population n'a pas de raison de
 * tenir dans un `integer` le jour où elle compte des centimes.
 *
 * ⚠️ `value` reste en `integer`, et c'est une LIMITE CONNUE, pas un oubli :
 * 2 147 483 647 centimes = 21,4 M€. Aucun montant n'est photographié
 * aujourd'hui (le registre `METRICS_NOT_PHOTOGRAPHED` dit pourquoi), donc
 * aucune ligne ne s'en approche. Le jour où un montant mensuel entre dans la
 * photo, `value` passe en `bigint` AVANT le code qui l'écrit (GA-11/GA-12) —
 * un dépassement `integer` en Postgres est une ERREUR, avalée par le `catch`
 * du balayage, donc une photo qui manque sans que personne ne le sache.
 */
export class MetricSnapshotDenominator1790976000001 implements MigrationInterface {
  name = 'MetricSnapshotDenominator1790976000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable et sans défaut : une population NON LUE ne s'invente pas, et un
    // `DEFAULT 0` aurait figé le faux zéro que toute cette table existe pour
    // éviter.
    await queryRunner.query(`ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS denominator bigint`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE stock_snapshots DROP COLUMN IF EXISTS denominator`)
  }
}
