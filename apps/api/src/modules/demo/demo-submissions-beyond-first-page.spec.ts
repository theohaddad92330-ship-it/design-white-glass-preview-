import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_SUBMISSIONS_MIN_TOTAL } from './demo-dataset'

/**
 * #3544.5 — /projects/presentations (ex-/consultants?view=submissions, #4528) ne monte que 50 lignes puis
 * propose « Afficher les 50 suivants » (`PRESENTATIONS_PAGE = 50`, `PresentationsPage.tsx`). La salle n'en avait que 11 : le comportement au-delà de 50
 * ne se prouvait pas en démonstration.
 */
describe('démo — plus de 50 positionnements (#3544.5)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const web = readFileSync(
    join(__dirname, '../../../../web/src/features/submissions/view/PresentationsPage.tsx'),
    'utf8',
  )
  const method = seed.split('private async seedSubmissionsBeyondFirstPage')[1]?.split('\n  /**')[0] ?? ''

  it('le total visé dépasse la première page lue côté écran', () => {
    const page = Number(/const PRESENTATIONS_PAGE = (\d+)/.exec(web)?.[1])
    expect(page).toBeGreaterThan(0)
    expect(DEMO_SUBMISSIONS_MIN_TOTAL).toBeGreaterThan(page)
    expect(DEMO_SUBMISSIONS_MIN_TOTAL).toBeLessThanOrEqual(200) // `GET /submissions` : LIMIT 200
  })

  it('le semis l’APPELLE, vise ce total et reste idempotent', () => {
    expect(seed).toContain('await this.seedSubmissionsBeyondFirstPage(')
    expect(method).toContain('DEMO_SUBMISSIONS_MIN_TOTAL')
    expect(method).toMatch(/ON CONFLICT \(project_id, consultant_id, coalesce\(need_id/)
    expect(method).toMatch(/DO NOTHING/)
  })

  it('sait dire NON : jamais « accepté » (aucune mission ne répond), jamais un consultant ou une affaire inventés', () => {
    expect(method.length).toBeGreaterThan(200)
    expect(method).not.toContain("'accepted'")
    expect(method).not.toMatch(/INSERT INTO (consultants|opportunities)/)
    expect(method).toContain('FROM opportunities o')
    expect(method).toContain('CROSS JOIN consultants c')
  })
})
