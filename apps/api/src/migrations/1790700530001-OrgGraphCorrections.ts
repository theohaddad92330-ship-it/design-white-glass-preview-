import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le LEDGER des corrections d'organigramme (OrgGraph FINAL §7 ; v3 §7.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE, ALORS QUE LE GRAPHE EST DÉJÀ UN BLOB
 * ─────────────────────────────────────────────────────────────────────────────
 * `raw_analysis.org.orgGraph` est RÉÉCRIT À NEUF par chaque run. C'est la raison
 * d'être de `org_rejected_items` et de `org_declared_people`, hissées hors du
 * blob en leur temps : ce qui doit survivre au run suivant ne peut pas vivre
 * dedans. Une correction de champ — un titre, une entité, un niveau, un rôle,
 * un N+1 — a exactement le même besoin, et n'avait aucun endroit où vivre.
 *
 * Pourquoi une TABLE et pas une troisième colonne jsonb sur `accounts` :
 *
 *  · une correction porte un AUTEUR, une DATE, une RAISON et une PREUVE — c'est
 *    un événement, pas un état. Un tableau jsonb aurait obligé à relire,
 *    modifier et réécrire tout l'historique à chaque geste, ce qui est
 *    précisément le *lost update* qu'on cherche à empêcher ;
 *  · le 409 doit dire CE QUI s'est intercalé entre deux versions. Ça se lit avec
 *    un `WHERE graph_version_after > $mienne`, et ça ne se lit pas dans un blob ;
 *  · une annulation pose une pierre tombale (`reverted_at`) sans rien effacer.
 *    On archive, on ne supprime pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES COLONNES, ET CE QUE CHACUNE TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatorze colonnes de la v3 §7.2, plus une quinzième, `evidence`, dont la
 * spécification nomme l'exigence sans lui donner de colonne : « Preuves —
 * sources datées, chacune avec son claim » (§10.4). Une correction sans sa
 * preuve serait un « parce que je le dis » versionné, et la ligne ne pourrait
 * pas être rejouée après un run sans reperdre ce qui la justifiait.
 *
 *  · `workspace_id` — le vivier d'une ESN n'est pas un fait de marché. Deux
 *    espaces sont deux concurrents : la correction que l'un pose sur
 *    l'organigramme d'un compte ne se lit pas depuis l'autre. C'est aussi cette
 *    colonne qui rend la table purgeable par la réinitialisation de démo.
 *  · `graph_version_before` / `graph_version_after` — le versionnement, dans les
 *    deux sens. C'est `after` qui permet au 409 de dire ce qui a bougé.
 *  · `object_type` + `object_id` — « correction toujours par id + entité +
 *    poste, jamais par nom » (S5, homonymes). Pour un lien, `object_id` est la
 *    clé `fromId|type|toId` — déterministe et stable d'un run à l'autre.
 *  · `field` + `old_value` + `new_value` — UNE ligne par champ corrigé. C'est ce
 *    qui rend l'annulation possible champ par champ, et c'est ce qui fait qu'une
 *    fiche portant cinq corrections a cinq preuves et non une preuve globale.
 *  · `old_value` / `new_value` en `jsonb` parce qu'un champ peut porter une
 *    liste (`decisionRoles`), un booléen (`verified`) ou `null` — et `null` veut
 *    dire « cette information n'est pas connue », jamais « 0 » ni « ».
 *  · `reverted_at` nullable — la pierre tombale. La ligne annulée reste lisible
 *    avec sa raison : sans elle on ne peut pas expliquer pourquoi le graphe a
 *    dit autre chose pendant trois semaines.
 *
 * ⚠️ Les deux contraintes `CHECK` sont déclarées AVANT tout code qui écrit
 * (GA-11 / GA-12) et couvrent EXACTEMENT `ORG_CORRECTION_OBJECT_TYPES` et
 * `ORG_CORRECTION_FIELDS` de `@bellum/contracts`. Une valeur ajoutée au
 * TypeScript sans élargir la contrainte produirait un rejet SQL avalé dans un
 * `catch`, donc une correction qui disparaît sans que personne ne le sache.
 *
 * ⚠️ AUCUNE clé étrangère vers `accounts`. La mémoire du graphe suit
 * l'ENTREPRISE dans l'espace, pas l'id de compte — chaque run crée une nouvelle
 * ligne `accounts`, exactement le raisonnement de `OrgGraphVersionService.
 * memoryFor` et de `AccountFeedbackService.directivesFor`. Une FK avec
 * `ON DELETE CASCADE` effacerait l'historique de correction au premier
 * relancement, ce qui est le contraire de ce que cette table existe pour faire.
 * La purge de démo passe donc par la jointure, pas par la cascade.
 */
export class OrgGraphCorrections1790700530001 implements MigrationInterface {
  public name = 'OrgGraphCorrections1790700530001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS org_graph_corrections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        graph_version_before integer NOT NULL,
        graph_version_after integer NOT NULL,
        object_type text NOT NULL,
        object_id text NOT NULL,
        field text NOT NULL,
        old_value jsonb,
        new_value jsonb,
        reason text NOT NULL,
        evidence jsonb NOT NULL,
        user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        reverted_at timestamptz,
        CONSTRAINT org_graph_corrections_version_advances_check
          CHECK (graph_version_after > graph_version_before)
      )
    `)

    // Nommées explicitement : déclarées en ligne dans le `CREATE TABLE`,
    // PostgreSQL leur donnerait un nom généré, et GA-11/GA-12 ne sauraient plus
    // reconnaître la contrainte d'une migration à l'autre. Déposées avant d'être
    // posées, sans quoi une seconde exécution échoue sur « already exists » et
    // laisse la migration à moitié appliquée.
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_object_type_check`,
    )
    await queryRunner.query(`
      ALTER TABLE org_graph_corrections
        ADD CONSTRAINT org_graph_corrections_object_type_check
        CHECK (object_type IN ('person', 'entity', 'edge'))
    `)
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_field_check`,
    )
    await queryRunner.query(`
      ALTER TABLE org_graph_corrections
        ADD CONSTRAINT org_graph_corrections_field_check
        CHECK (field IN (
          'title',
          'entityId',
          'hierarchyLevel',
          'decisionRoles',
          'reportsTo',
          'name',
          'parentId',
          'type',
          'verified',
          'presence'
        ))
    `)

    // La lecture qui compte : « les corrections de ce dossier, la plus récente
    // d'abord » — l'historique du tiroir, et le diff du 409 (`WHERE
    // graph_version_after > $mienne`), qui se sert de la même colonne.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS org_graph_corrections_account_idx
         ON org_graph_corrections (workspace_id, account_id, graph_version_after DESC)`,
    )
    // La REPRISE après un run : « toutes les corrections encore actives de ce
    // dossier, dans l'ordre où elles ont été posées ». Une correction annulée
    // n'est pas rejouée — mais elle reste en base, d'où l'index partiel plutôt
    // qu'une suppression.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS org_graph_corrections_active_idx
         ON org_graph_corrections (workspace_id, account_id, created_at)
         WHERE reverted_at IS NULL`,
    )

    // RLS : la table porte des corrections humaines nominatives ; elle suit la
    // même politique que le reste des données d'espace.
    //
    // La politique est posée dans un bloc qui AVALE `undefined_table` /
    // `undefined_function` : une base locale n'a ni le schéma `auth` de Supabase
    // ni `workspace_members`, et la migration doit passer là aussi. L'API, elle,
    // travaille avec la clé de service et filtre sur `workspace_id` dans chaque
    // requête — la RLS est une seconde serrure, jamais la seule.
    await queryRunner.query(`ALTER TABLE org_graph_corrections ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'org_graph_corrections' AND policyname = 'org_graph_corrections_own_workspace'
        ) THEN
          CREATE POLICY org_graph_corrections_own_workspace ON org_graph_corrections
            USING (
              workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      EXCEPTION
        WHEN undefined_function OR undefined_table OR undefined_object THEN NULL;
      END
      $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS org_graph_corrections`)
  }
}
