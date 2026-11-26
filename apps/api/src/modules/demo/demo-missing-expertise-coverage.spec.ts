import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectMissingExpertise, MISSING_EXPERTISE_THRESHOLDS } from '@bellum/contracts'
import { DEMO_MISSING_EXPERTISE_COVERAGE } from './demo-coverage'
import { DEMO_MISSING_EXPERTISE } from './demo-dataset'

/**
 * #4349 V.2 (décision Louis 19/10) — « compétences qui te coûtent des besoins » vit dans Pilotage › Staffing :
 * la démo doit l'afficher (craft rule n°9). Aucune table nouvelle (`project_needs`, `staffable = 'no'`) : cette
 * garde lit le VRAI jeu de données et l'APPELANT du semis.
 */
describe('#4349 V.2 — les compétences sans profil en démonstration', () => {
  const now = new Date('2026-10-20T08:00:00.000Z')
  const refused = DEMO_MISSING_EXPERTISE.needs.map((need, index) => ({
    needId: `n${index}`,
    title: need.title,
    canonicalSkills: [DEMO_MISSING_EXPERTISE.skill],
    refusedAt: new Date(now.getTime() - need.refused_days_ago * 86_400_000).toISOString(),
    targetDayRateCents: need.target_tjm_cents,
    startOn: null,
    durationMonths: need.duration_months,
  }))

  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_MISSING_EXPERTISE_COVERAGE.state).toBe('seede')
    expect(DEMO_MISSING_EXPERTISE_COVERAGE.reason).toContain('#4349')
  })

  it('atteint le seuil du détecteur, dans sa fenêtre — le bloc s’affiche', () => {
    expect(DEMO_MISSING_EXPERTISE.needs.length).toBeGreaterThanOrEqual(MISSING_EXPERTISE_THRESHOLDS.refusalsOnSameSkill)
    expect(detectMissingExpertise(refused, now).map(found => found.skill)).toEqual([DEMO_MISSING_EXPERTISE.skill])
  })

  it('SAIT DIRE NON : un refus de moins que le seuil ne fait aucune ligne', () => {
    const below = refused.slice(0, MISSING_EXPERTISE_THRESHOLDS.refusalsOnSameSkill - 1)
    expect(detectMissingExpertise(below, now)).toEqual([])
  })

  it('a un APPELANT : le semis insère les besoins refusés', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain('DEMO_MISSING_EXPERTISE')
    expect(source).toMatch(/seedMissingExpertise\(/)
  })

  it('écrit la compétence en objet `{ term }` — des chaînes nues, le détecteur (`rawTerms`) les ignore', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain('JSON.stringify([{ term: DEMO_MISSING_EXPERTISE.skill }])')
  })
})
