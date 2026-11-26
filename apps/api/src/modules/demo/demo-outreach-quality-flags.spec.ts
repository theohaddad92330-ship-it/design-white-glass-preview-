import { OUTREACH_QUALITY_FLAG_KINDS } from '@bellum/contracts'
import { DEMO_OUTREACH_MESSAGES } from './demo-dataset'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #2877 (#2385.4, recette 02/10) — « Signalé : Faux fait » doit se VOIR en
 * démo : le geste d'écriture est refusé en lecture seule, donc la déclaration
 * est semée sur une carte « à relire ». Une carte de démo seulement, jamais
 * une carte déjà partie.
 */
describe('messages de démo — signal qualité déclaré (#2877 #2385.4)', () => {
  const flagged = DEMO_OUTREACH_MESSAGES.filter(entry => (entry.quality_flags?.length ?? 0) > 0)

  it('au moins une carte à relire porte une déclaration du relecteur', () => {
    expect(flagged.length).toBeGreaterThan(0)
    for (const entry of flagged) expect(entry.status).toBe('needs_review')
  })

  it('les natures semées appartiennent au vocabulaire fermé', () => {
    for (const entry of flagged)
      for (const kind of entry.quality_flags ?? []) expect(OUTREACH_QUALITY_FLAG_KINDS).toContain(kind)
  })

  it('la table est classée « seedée », plus « vide à dessein »', () => {
    expect(DEMO_SEEDED_TABLES).toContain('outreach_message_quality_flags')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('outreach_message_quality_flags')
  })
})
