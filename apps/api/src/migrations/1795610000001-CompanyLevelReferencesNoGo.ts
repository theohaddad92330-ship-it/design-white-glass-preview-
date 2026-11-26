import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2005.4 (DÉCISION Louis 17/09/2026, lot CP2) — `client_references` et
 * `no_go_sectors` passent au niveau ENTREPRISE (voir
 * `packages/contracts/src/schemas/layered-profile.ts`,
 * `COMPANY_LAYER_ANSWER_KEYS`).
 *
 * Colonnes déjà existantes (Temps 2, migration `1787961204338`) — AUCUNE
 * colonne neuve ici. Ce que cette migration fait : une donnée, idempotente.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE : « une réponse personnelle existante devient la valeur de
 * l'espace SI CELLE-CI EST VIDE, jamais un écrasement — une correction
 * humaine gagne ».
 * ─────────────────────────────────────────────────────────────────────────
 * Pour chaque espace, on regarde la ligne CANONIQUE
 * (`is_workspace_canonical AND is_current`). Si sa colonne est vide, on la
 * complète avec la réponse la PLUS ANCIENNE parmi les lignes courantes du
 * même espace qui portent une valeur — déterministe (ORDER BY created_at),
 * jamais un écrasement (le WHERE ne touche que les lignes canoniques VIDES).
 *
 * Rejouable : une fois la colonne canonique remplie, le WHERE ne la
 * sélectionne plus — un second run est un no-op. Un espace sans ligne
 * canonique, ou sans aucune réponse à promouvoir, n'écrit rien.
 */
export class CompanyLevelReferencesNoGo1795610000001 implements MigrationInterface {
  name = 'CompanyLevelReferencesNoGo1795610000001'

  private static backfill(column: 'client_references' | 'no_go_sectors'): string {
    return `
      UPDATE esn_profiles AS canonical
      SET ${column} = source.${column}
      FROM (
        SELECT DISTINCT ON (workspace_id) workspace_id, ${column}
        FROM esn_profiles
        WHERE is_current = true
          AND workspace_id IS NOT NULL
          AND ${column} IS NOT NULL
          AND array_length(${column}, 1) > 0
        ORDER BY workspace_id, created_at ASC
      ) AS source
      WHERE canonical.is_workspace_canonical = true
        AND canonical.is_current = true
        AND canonical.workspace_id = source.workspace_id
        AND (canonical.${column} IS NULL OR array_length(canonical.${column}, 1) IS NULL);
    `
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(CompanyLevelReferencesNoGo1795610000001.backfill('client_references'))
    await queryRunner.query(CompanyLevelReferencesNoGo1795610000001.backfill('no_go_sectors'))
  }

  /**
   * Pas de retour en arrière possible pour une donnée PROMUE — on ne sait
   * plus, après coup, quelle ligne canonique tenait déjà sa valeur avant
   * cette migration. `down` reste un no-op explicite plutôt que d'effacer une
   * réponse qu'un humain pourrait avoir écrite depuis (une correction humaine
   * gagne).
   */
  public async down(): Promise<void> {
    // Intentionnellement vide — voir le commentaire ci-dessus.
  }
}
