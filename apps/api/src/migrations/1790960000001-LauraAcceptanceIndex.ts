import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `laura_interventions_acceptance_idx` — l'index qui rend LISIBLE ce que
 * `LauraAcceptanceService.bySurface` lit (D643-D648).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DE NOUVELLE TABLE, PAS DE NOUVELLE COLONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * `laura_interventions` porte déjà l'espace (`workspace_id`), la clé de
 * surface (`intervention_key`), l'issue (`reaction`) et sa date
 * (`created_at`) — exactement ce que le compteur d'acceptation par surface a
 * besoin de lire. Le geste utilisateur qui les écrit existe et est déjà testé
 * (`LauraController.react` → `LauraService.react`, `laura.service.spec.ts`).
 * Poser une seconde table à côté aurait dupliqué un chemin d'écriture déjà
 * gouverné pour le même fait. Cette migration n'ajoute donc AUCUNE colonne
 * (GA-36 ne s'applique pas ici) et AUCUNE table (rien à déclarer dans
 * `table-scopes.ts`, GA-65) — seulement un index qui sert la lecture nouvelle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN INDEX PARTIEL, ET SUR `created_at` SEUL
 * ─────────────────────────────────────────────────────────────────────────────
 * `LauraAcceptanceService.bySurface` lit `WHERE created_at >= :since AND
 * reaction IS NOT NULL`, sur toute la table — AUCUN filtre par
 * `intervention_key` ni par `workspace_id` côté SQL, parce que la question
 * posée (« cette surface mérite-t-elle encore d'interrompre ? ») est une
 * décision de CATALOGUE, pas une décision par espace (voir la doc du
 * service). L'index posé ici ne fait donc QUE ce que la requête a besoin :
 * un balayage par date, restreint aux lignes qui portent une réaction —
 * celles qui existaient déjà avant cette date d'installation continuent
 * d'être scannées normalement, sans que l'index ne s'en préoccupe.
 *
 * L'index existant (`user_id, intervention_key, created_at`, posé avec la
 * table) sert un usage différent — « les traces récentes d'UN utilisateur »
 * (`LauraService.recentTraces`) — et ne peut pas servir un balayage global
 * par date : `user_id` est en tête, donc inutilisable sans lui.
 */
export class LauraAcceptanceIndex1790960000001 implements MigrationInterface {
  public name = 'LauraAcceptanceIndex1790960000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS laura_interventions_acceptance_idx
      ON laura_interventions (created_at)
      WHERE reaction IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS laura_interventions_acceptance_idx`)
  }
}
