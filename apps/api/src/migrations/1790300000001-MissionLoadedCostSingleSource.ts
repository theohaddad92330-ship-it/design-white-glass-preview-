import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le coût chargé d'une mission a UNE source (D43 · 28/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE A DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `missions.daily_cost` était LUE par cinq dérivations de marge — la liste des
 * missions, le board, les alertes de seuil, la marge par canal, l'axe « marge »
 * du score — et ÉCRITE par rien. Ni le web, ni le service IA, ni le semis de
 * démonstration, ni `create_mission` (le seul appelant interne, qui dit en
 * toutes lettres « ni TJM, ni dates »). Son unique chemin d'écriture était un
 * champ `dailyCost` de la requête de création qu'aucun client n'envoyait.
 *
 * Pendant ce temps, le formulaire de la fiche écrivait
 * `mission_commercial_terms.loaded_daily_cost_cents`. Cause racine « colonne
 * lue, jamais écrite », déjà payée trois fois ici : le repli honnête — « marge
 * non mesurée » — ressemble exactement à une base vide.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA COLONNE N'EST PAS SUPPRIMÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce qu'on ne peut pas prouver d'ici qu'elle est vide dans chaque
 * environnement. Un `DROP COLUMN` est irréversible et emporterait, s'il en
 * existe, des valeurs qu'un humain a saisies par appel d'API. « On archive, on
 * ne supprime pas » vaut pour les faits métier ; une colonne morte n'en est pas
 * un — mais une colonne morte dont on n'a pas VÉRIFIÉ qu'elle est vide, si.
 *
 * La migration fait donc les deux gestes qui ne détruisent rien :
 *
 *  1. **elle REPORTE** toute valeur restante vers la source unique, en
 *     centimes, et seulement là où aucun coût n'est déjà saisi — une correction
 *     humaine gagne toujours, et c'est elle qui est dans les conditions ;
 *  2. **elle ÉTIQUETTE** la colonne dans le schéma lui-même, pour que le
 *     prochain à écrire une requête le lise là où il regarde.
 *
 * Le report est un no-op sur une base où la colonne est vide — ce qu'elle est
 * partout où on a pu la mesurer. Il n'invente aucune donnée : il déplace une
 * valeur saisie d'une colonne que plus rien ne lit vers celle que tout lit.
 * Les EUROS deviennent des CENTIMES ; les additionner sans convertir donnerait
 * une marge de 99,9 % sur toutes les missions concernées.
 */
export class MissionLoadedCostSingleSource1790300000001 implements MigrationInterface {
  name = 'MissionLoadedCostSingleSource1790300000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1a. Les missions qui ont un coût historique et DÉJÀ une ligne de
    //     conditions sans coût : on complète, on n'écrase jamais.
    await queryRunner.query(`
      UPDATE mission_commercial_terms t
         SET loaded_daily_cost_cents = ROUND(m.daily_cost * 100)::bigint,
             updated_at = now()
        FROM missions m
       WHERE t.mission_id = m.id
         AND m.daily_cost IS NOT NULL
         AND m.daily_cost >= 0
         AND t.loaded_daily_cost_cents IS NULL
    `)

    // 1b. Celles qui n'ont aucune ligne de conditions : on en crée une, avec le
    //     canal `unknown`. Le deviner « direct » rangerait les inconnues avec
    //     le cas le plus fréquent et fausserait la comparaison par canal.
    await queryRunner.query(`
      INSERT INTO mission_commercial_terms (mission_id, workspace_id, loaded_daily_cost_cents, channel)
      SELECT m.id, m.workspace_id, ROUND(m.daily_cost * 100)::bigint, 'unknown'
        FROM missions m
       WHERE m.daily_cost IS NOT NULL
         AND m.daily_cost >= 0
         AND NOT EXISTS (SELECT 1 FROM mission_commercial_terms t WHERE t.mission_id = m.id)
    `)

    // 2. L'étiquette, dans le schéma. Un commentaire de code ne se lit pas
    //    quand on ouvre la table pour écrire une requête.
    await queryRunner.query(`
      COMMENT ON COLUMN missions.daily_cost IS
        'OBSOLETE (D43, 28/08/2026) - n''est PAS la source du cout charge et n''est ecrite par rien. La source est mission_commercial_terms.loaded_daily_cost_cents (en CENTIMES), saisie par le formulaire de la fiche mission. Toute marge se calcule dessus. Colonne conservee pour ne rien detruire ; ne pas la lire.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Le report n'est PAS défait : on ne sait plus distinguer un coût reporté
    // d'un coût saisi depuis, et supprimer le second détruirait le travail
    // d'un utilisateur. Retirer l'étiquette suffit à revenir en arrière — la
    // colonne, elle, n'a jamais été touchée.
    await queryRunner.query(`COMMENT ON COLUMN missions.daily_cost IS NULL`)
  }
}
