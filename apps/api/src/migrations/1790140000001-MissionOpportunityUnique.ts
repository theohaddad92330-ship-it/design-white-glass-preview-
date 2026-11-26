import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Un projet gagné n'a qu'UNE mission (BEL-FIX-001, dossier du 26/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `missions.opportunity_id` existe depuis `1788290000000-DeliveryOs.ts` sans
 * aucune contrainte d'unicité. Tant que le chemin de conversion était mort, le
 * trou était théorique. Il ne l'est plus : `create_mission` est le seul effet de
 * déplacement exécuté par le SERVEUR, et il arrive PRÉ-COCHÉ à l'arrivée sur
 * `won`. Le garde-fou d'écran ne joue qu'en SORTIE de `won` — un `perdu →
 * gagné`, un aller-retour, ou simplement deux clics repassent par le même
 * chemin avec la case cochée.
 *
 * Et le prix de l'erreur n'est pas symétrique : **une mission ne se supprime
 * pas** — son historique de facturation s'y accroche. Un doublon serait donc
 * définitif, avec son relevé d'activité, son prêt à facturer et sa marge en
 * double dans tous les agrégats.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE FAIT LA MIGRATION AVANT DE CONTRAINDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'index ne peut pas être posé sur une table qui porte déjà des doublons. On
 * NORMALISE d'abord — même geste que `1789691847302-TimesheetDepth.ts`, qui
 * ramène les statuts inconnus à `draft` avant de poser son `CHECK`.
 *
 * La normalisation garde la mission la PLUS ANCIENNE rattachée au projet et
 * DÉTACHE les suivantes (`opportunity_id = NULL`). Aucune ligne n'est
 * supprimée : les missions survivent avec leur facturation, leur consultant et
 * leur marge. Ce qui est retiré est le seul lien vers le projet — celui qui, en
 * double, faussait le rattachement.
 *
 * ⚠️ Et la migration le DIT : un `RAISE WARNING` nomme le nombre de projets
 * concernés et les identifiants détachés. Une normalisation silencieuse ferait
 * disparaître un rattachement sans que personne ne puisse le rétablir ; ici, la
 * ligne de déploiement porte de quoi le refaire à la main.
 *
 * Le compte attendu en production est **zéro** : le chemin est récent et
 * demande un geste humain. Le bloc existe pour que la migration ne casse pas un
 * déploiement si ce n'est pas le cas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PARTIEL, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────────
 * `WHERE opportunity_id IS NOT NULL` : deux missions créées à la main sur le
 * même compte sont légitimes — c'est le cas ordinaire d'une ESN qui place deux
 * consultants. L'unicité porte sur le PROJET, jamais sur le compte.
 */
export class MissionOpportunityUnique1790140000001 implements MigrationInterface {
  public name = 'MissionOpportunityUnique1790140000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        duplicated_projects integer;
        detached_ids text;
      BEGIN
        SELECT count(*) INTO duplicated_projects
          FROM (
            SELECT opportunity_id
              FROM missions
             WHERE opportunity_id IS NOT NULL
             GROUP BY opportunity_id
            HAVING count(*) > 1
          ) d;

        IF duplicated_projects > 0 THEN
          WITH ranked AS (
            SELECT id,
                   row_number() OVER (PARTITION BY opportunity_id ORDER BY created_at, id) AS rank
              FROM missions
             WHERE opportunity_id IS NOT NULL
          ),
          detached AS (
            UPDATE missions
               SET opportunity_id = NULL
             WHERE id IN (SELECT id FROM ranked WHERE rank > 1)
            RETURNING id
          )
          SELECT string_agg(id::text, ', ') INTO detached_ids FROM detached;

          RAISE WARNING 'BEL-FIX-001 — % projet(s) portaient plusieurs missions. La plus ancienne reste rattachee ; missions detachees (aucune supprimee) : %',
            duplicated_projects, detached_ids;
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS missions_opportunity_uniq
        ON missions (opportunity_id)
        WHERE opportunity_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Le détachement n'est pas rejoué : on ne réinvente pas un rattachement que
    // la normalisation a retiré, et la ligne de déploiement en porte la trace.
    await queryRunner.query(`DROP INDEX IF EXISTS missions_opportunity_uniq`)
  }
}
