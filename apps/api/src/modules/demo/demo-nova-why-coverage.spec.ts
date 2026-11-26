import { bellumReadSchema } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3524 — « Pourquoi y aller » était absent en démonstration : la synthèse lit
 * `evaluation.bellum_read.why`. Un écran livré mais vide en démo se découvre en réunion.
 *
 * Décision Louis 04/10/2026 — le client fictif qui le portait a quitté la salle :
 * la garde le RECALCULE sur les vrais dossiers (lecture tirée de leur brief).
 */
describe('démo — un vrai dossier porte « Pourquoi y aller » (#3524)', () => {
  const reads = DEMO_DOSSIERS.map(dossier => {
    const evaluation = dossier.account.raw_analysis['evaluation'] as { bellum_read?: unknown } | undefined
    const parsed = bellumReadSchema.safeParse(evaluation?.bellum_read)
    return parsed.success ? { company: dossier.account.company_name, read: parsed.data } : null
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null && (entry.read.why?.length ?? 0) > 0)

  it('au moins un dossier porte une phrase de verdict et 1 à 3 preuves non vides', () => {
    expect(reads.length).toBeGreaterThanOrEqual(1)
    for (const { read } of reads) {
      expect(read.verdict_line).toBeTruthy()
      expect(read.why?.length).toBeLessThanOrEqual(3)
      for (const fact of read.why ?? []) expect(fact.trim()).not.toBe('')
    }
  })
})
