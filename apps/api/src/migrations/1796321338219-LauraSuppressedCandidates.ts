import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2403.32 — CE QUI PERDAIT À `candidates[0]` NE PARTAIT NULLE PART.
 *
 * `LauraService.eligible()` calcule TOUS les candidats éligibles pour un
 * écran, les trie par priorité, et n'en retient qu'un (`candidates[0]`,
 * `laura.service.ts`). Les autres — parfaitement éligibles, juste moins
 * prioritaires ce jour-là — n'étaient écrits NULLE PART : ni la trace posée,
 * ni aucune autre table ne portait leurs clés. Le §5.3 dit pourtant : « les
 * autres restent dans Actions ou le centre de notifications ».
 *
 * `suppressed_candidates` porte les clés des candidats ÉVINCÉS AU MOMENT de
 * cette trace — pas un état vivant, une photo de l'arbitrage qui a produit
 * `intervention_key`. Une future vue « Actions » ou « centre de
 * notifications » peut les lire sans que ce fichier ait à en décider l'usage
 * (D48 : ce service ne décide toujours rien, il rend ce qu'il a arbitré).
 *
 * `text[]` NULLABLE avec défaut `'{}'`, comme `contact.entity.ts` et
 * `account.entity.ts` : les lignes déjà écrites n'ont simplement rien à
 * rapporter (arbitrage d'avant ce lot, jamais recalculé).
 */
export class LauraSuppressedCandidates1796321338219 implements MigrationInterface {
  public name = 'LauraSuppressedCandidates1796321338219'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE laura_interventions
        ADD COLUMN IF NOT EXISTS suppressed_candidates text[] NOT NULL DEFAULT '{}'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
