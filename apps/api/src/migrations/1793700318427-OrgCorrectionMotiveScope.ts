import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2126.36 / .37 / .39 / .44 — le motif, la portée et la visibilité d'une
 * correction d'organigramme.
 *
 * Le ledger ne savait dire qu'une chose : « quelqu'un a CORRIGÉ ce champ ». Il
 * ne savait ni « c'est toujours vrai » (confirmer), ni « c'est périmé »
 * (obsolète), ni « pour moi seul » (portée personnelle). Trois colonnes, et une
 * contrainte de version élargie :
 *
 *  · `motive` — six gestes fermés (`ORG_CORRECTION_MOTIVES`) ;
 *  · `scope` — personnel / espace / compte (`ORG_CORRECTION_SCOPES`). « BU » en
 *    est ABSENT : aucune source ne la porte (#2118.9), à trancher ;
 *  · `visibility` — privé / espace, DÉRIVÉE de la portée, et la base le tient
 *    (`visibility_follows_scope_check`) : une ligne personnelle lisible par
 *    l'espace ne peut pas exister, même écrite par un chemin qui se tromperait.
 *
 * ⚠️ La contrainte de version. Elle exigeait `after > before` pour TOUTE ligne.
 * Une correction personnelle, ou un motif qui ne réécrit pas le graphe
 * (confirmer, pas pertinent, je ne sais pas, ajouter une source), dépose une
 * ligne SANS toucher au graphe : sa version reste la même. Elle est élargie
 * pour ces lignes-là seulement — tout ce qui réécrit le graphe l'avance toujours.
 *
 * Porte « ajout seulement » (GA-11 / GA-12) : des colonnes neuves à défaut, qui
 * relisent chaque ligne existante comme « corriger, compte, espace » — ce
 * qu'elle était. Aucune contrainte n'est resserrée sur une ligne existante.
 */
export class OrgCorrectionMotiveScope1793700318427 implements MigrationInterface {
  name = 'OrgCorrectionMotiveScope1793700318427'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections ADD COLUMN IF NOT EXISTS motive text NOT NULL DEFAULT 'corrected'`,
    )
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'account'`,
    )
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'workspace'`,
    )

    await queryRunner.query(`
      ALTER TABLE org_graph_corrections
        DROP CONSTRAINT IF EXISTS org_graph_corrections_motive_check,
        ADD CONSTRAINT org_graph_corrections_motive_check CHECK (motive IN ('corrected', 'confirmed', 'obsolete', 'not_relevant', 'unknown', 'source_added'))
    `)
    await queryRunner.query(`
      ALTER TABLE org_graph_corrections
        DROP CONSTRAINT IF EXISTS org_graph_corrections_scope_check,
        ADD CONSTRAINT org_graph_corrections_scope_check CHECK (scope IN ('personal', 'workspace', 'account'))
    `)
    await queryRunner.query(`
      ALTER TABLE org_graph_corrections
        DROP CONSTRAINT IF EXISTS org_graph_corrections_visibility_check,
        ADD CONSTRAINT org_graph_corrections_visibility_check CHECK (visibility IN ('private', 'workspace'))
    `)
    await queryRunner.query(`
      ALTER TABLE org_graph_corrections
        DROP CONSTRAINT IF EXISTS org_graph_corrections_visibility_follows_scope_check,
        ADD CONSTRAINT org_graph_corrections_visibility_follows_scope_check CHECK ((scope = 'personal') = (visibility = 'private'))
    `)
    await queryRunner.query(`
      ALTER TABLE org_graph_corrections
        DROP CONSTRAINT IF EXISTS org_graph_corrections_version_advances_check,
        ADD CONSTRAINT org_graph_corrections_version_advances_check
        CHECK (
          graph_version_after > graph_version_before
          OR (
            graph_version_after = graph_version_before
            AND (scope = 'personal' OR motive IN ('confirmed', 'not_relevant', 'unknown', 'source_added'))
          )
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les lignes qui n'avancent pas la version violeraient la contrainte
    // d'origine : on les ARCHIVE en pierre tombale plutôt que de les supprimer.
    await queryRunner.query(`
      UPDATE org_graph_corrections
         SET reverted_at = COALESCE(reverted_at, now()), graph_version_after = graph_version_before + 1
       WHERE graph_version_after = graph_version_before
    `)
    await queryRunner.query(`
      ALTER TABLE org_graph_corrections
        DROP CONSTRAINT IF EXISTS org_graph_corrections_version_advances_check,
        ADD CONSTRAINT org_graph_corrections_version_advances_check CHECK (graph_version_after > graph_version_before)
    `)
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_visibility_follows_scope_check`,
    )
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_visibility_check`,
    )
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_scope_check`,
    )
    await queryRunner.query(
      `ALTER TABLE org_graph_corrections DROP CONSTRAINT IF EXISTS org_graph_corrections_motive_check`,
    )
    await queryRunner.query(`ALTER TABLE org_graph_corrections DROP COLUMN IF EXISTS visibility`)
    await queryRunner.query(`ALTER TABLE org_graph_corrections DROP COLUMN IF EXISTS scope`)
    await queryRunner.query(`ALTER TABLE org_graph_corrections DROP COLUMN IF EXISTS motive`)
  }
}
