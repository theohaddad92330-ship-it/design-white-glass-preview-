import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2060 — « Y a-t-il quelque chose d'important sur ton activité que mes
 * questions n'ont pas couvert ? », la question ouverte qui FERME le parcours
 * Temps-1.
 *
 * EN AJOUT SEULEMENT, nullable et sans défaut (GA-11 / GA-12 : la colonne
 * existe avant le code qui l'écrit). `NULL` veut dire « jamais répondue »,
 * jamais une valeur devinée à la place de l'utilisateur.
 *
 * #2060.10 — reste une chaîne VERBATIM : aucune extraction automatique en
 * plusieurs faits n'est câblée dessus (garde
 * `apps/api/src/architecture/uncovered-activity-note-stays-opaque.spec.ts`).
 */
export class EsnProfileUncoveredActivityNote1795712398814 implements MigrationInterface {
  public name = 'EsnProfileUncoveredActivityNote1795712398814'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS uncovered_activity_note text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
