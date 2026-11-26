import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2170.52 — LES VUES ENREGISTRÉES DU PIPE rejoignent `saved_views`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS UNE TABLE NEUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un périmètre du pipe enregistré EST une vue enregistrée : un nom, des
 * critères, un propriétaire, un partage — exactement ce que `saved_views`
 * porte déjà pour les comptes, les contacts, les besoins ouverts, le vivier,
 * les missions et Découvrir. Même patron que la migration
 * `1793700500000-DiscoverSavedSearches` : ajouter `projects_pipe` plutôt
 * qu'une table à part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS LE SCOPE `projects` EXISTANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `projects` est déjà pris par les vues enregistrées des BESOINS OUVERTS
 * (`SavedNeedViews.tsx`, `NeedFilters`). Les filtres rapides du pipe (owner,
 * sans prochaine action, vieillissantes, sans profil positionné, à signer,
 * entretien cette semaine) ne sont pas la même forme de critère — les
 * mélanger dans une seule liste ferait apparaître une vue de besoins parmi
 * des vues de pipe sans que rien à l'écran ne les distingue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT »
 * ─────────────────────────────────────────────────────────────────────────────
 * La contrainte de scope s'ÉLARGIT (elle ne perd aucune valeur, GA-11), AVANT
 * le code qui écrit (GA-12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RÉÉMISE le 25/09/2026 (issue #3001) — PAS UNE NOUVELLE MIGRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * L'originale, `SavedViewsProjectsPipe1790289084455`, a DÉJÀ TOURNÉ EN
 * PRODUCTION sous ce nom — ce dépôt archive, il ne réécrit pas ce qui a
 * tourné (GA-372). Son défaut : un horodatage plus ANCIEN que
 * `DiscoverSavedSearches1793700500000`, alors que son SQL suppose Discover
 * déjà appliquée (elle liste `discover` ET `projects_pipe`). Triées par
 * horodatage, TypeORM exécutait donc CETTE migration AVANT Discover, qui
 * REDÉCLARAIT ensuite la contrainte sans `projects_pipe` juste après — un
 * rétrécissement (GA-11), et la contrainte finale n'acceptait plus toute la
 * taxonomie TypeScript (GA-12).
 *
 * Cette classe est la MÊME migration, réémise avec un horodatage strictement
 * supérieur au maximum de la série (GA-372) pour s'exécuter APRÈS Discover.
 * Elle reste IDEMPOTENTE à dessein : `DROP CONSTRAINT IF EXISTS` puis
 * `ADD CONSTRAINT` avec la liste COMPLÈTE (`discover` ET `projects_pipe`
 * compris) — une base où l'ancienne version a déjà tourné (elle y a laissé
 * son nom dans la table des migrations TypeORM) rejoue celle-ci sans dégât :
 * même contrainte, même résultat, juste posée une seconde fois.
 */
export class SavedViewsProjectsPipeReissued1796001506182 implements MigrationInterface {
  name = 'SavedViewsProjectsPipeReissued1796001506182'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_scope_check`)
    await queryRunner.query(`
      ALTER TABLE saved_views ADD CONSTRAINT saved_views_scope_check
        CHECK (scope IN ('accounts', 'contacts', 'projects', 'talents', 'missions', 'discover', 'projects_pipe'))
    `)
  }

  /**
   * Retire ce que cette migration a ajouté, et rien de plus — ce qui suppose
   * qu'aucune ligne `projects_pipe` ne subsiste, donc le retrait des lignes
   * d'abord (même précaution que `DiscoverSavedSearches.down`).
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM saved_views WHERE scope = 'projects_pipe'`)
    await queryRunner.query(`ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_scope_check`)
    await queryRunner.query(`
      ALTER TABLE saved_views ADD CONSTRAINT saved_views_scope_check
        CHECK (scope IN ('accounts', 'contacts', 'projects', 'talents', 'missions', 'discover'))
    `)
  }
}
