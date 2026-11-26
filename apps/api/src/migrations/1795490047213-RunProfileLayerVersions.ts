import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2005.11 — chaque recommandation conserve les versions des TROIS couches du
 * profil (entreprise · BU · personne) qui l'ont conditionnée. Voir
 * `.claude/notes/registre-2026-09-15-onboarding-audit-welcome.md`, ligne
 * `| #2005.11 |`, et `packages/contracts/src/schemas/layered-profile.ts`.
 *
 * Les versions voyagent DANS `analysis_runs.profile_provenance` — la provenance
 * du profil figée sur le run existe déjà (1788600000001) et c'est là qu'on
 * répond à « avec quel profil ce dossier a-t-il été fait ? ». Une colonne de
 * plus ferait deux registres de la même provenance (GA-26).
 *
 * Posée AVANT le code qui écrit la clé : quand une provenance porte
 * `layerVersions`, c'est un objet aux trois clés, chacune chaîne ou `null`.
 * L'historique — aucune clé — reste valide, donc la validation ne rétrécit rien
 * de ce qui existe. `NOT VALID` puis `VALIDATE` : l'ajout ne prend pas le verrou
 * exclusif le temps d'un parcours de table.
 *
 * Additive et rejouable : aucune colonne touchée, aucune valeur écrite.
 */
export class RunProfileLayerVersions1795490047213 implements MigrationInterface {
  name = 'RunProfileLayerVersions1795490047213'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE analysis_runs DROP CONSTRAINT IF EXISTS analysis_runs_profile_layer_versions_check`,
    )
    await queryRunner.query(`
      ALTER TABLE analysis_runs ADD CONSTRAINT analysis_runs_profile_layer_versions_check CHECK (
        profile_provenance IS NULL
        OR NOT (profile_provenance ? 'layerVersions')
        OR (
          jsonb_typeof(profile_provenance -> 'layerVersions') = 'object'
          AND (profile_provenance -> 'layerVersions') ?& ARRAY['company', 'businessUnit', 'person']
          AND jsonb_typeof(profile_provenance -> 'layerVersions' -> 'company') IN ('string', 'null')
          AND jsonb_typeof(profile_provenance -> 'layerVersions' -> 'businessUnit') IN ('string', 'null')
          AND jsonb_typeof(profile_provenance -> 'layerVersions' -> 'person') IN ('string', 'null')
        )
      ) NOT VALID
    `)
    await queryRunner.query(`ALTER TABLE analysis_runs VALIDATE CONSTRAINT analysis_runs_profile_layer_versions_check`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE analysis_runs DROP CONSTRAINT IF EXISTS analysis_runs_profile_layer_versions_check`,
    )
  }
}
