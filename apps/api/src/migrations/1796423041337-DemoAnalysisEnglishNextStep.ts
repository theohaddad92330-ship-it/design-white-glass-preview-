import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3550.2 (recette prod 02/10, Y11) — la démo Société Générale montrait, dans une carte d'analyse
 * française, « Target DSI with a régie proposition; qualify the domain-specific panel/gatekeeper
 * before outreach ». La source (`data/*-compte-complet.csv`) a été corrigée, mais une salle de
 * démonstration DÉJÀ semée garde le texte d'origine dans `accounts.raw_analysis` : le rejeu ne part
 * pas seul au déploiement. Cette migration rattrape ces lignes — salles de démonstration
 * UNIQUEMENT (`workspaces.is_demo`), et seulement ce gabarit exact ; aucune autre donnée n'est
 * touchée, aucun compte client réel non plus.
 */
const ENGLISH_NEXT_STEP =
  'Target ([^;"]+) with an? ([^;"]+) proposition; qualify the domain-specific panel/gatekeeper before outreach\\.'
const FRENCH_NEXT_STEP =
  'Viser \\1 avec une proposition « \\2 » ; qualifier d’abord le panel du domaine et son gardien avant toute approche.'

export class DemoAnalysisEnglishNextStep1796423041337 implements MigrationInterface {
  name = 'DemoAnalysisEnglishNextStep1796423041337'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE accounts a
         SET raw_analysis = regexp_replace(a.raw_analysis::text, $1, $2, 'g')::jsonb
        FROM workspaces w
       WHERE w.id = a.workspace_id
         AND w.is_demo = true
         AND a.raw_analysis::text ~ $1
    `,
      [ENGLISH_NEXT_STEP, FRENCH_NEXT_STEP],
    )
  }

  public async down(): Promise<void> {
    // Traduction à sens unique : l'anglais d'origine n'est pas restauré.
  }
}
