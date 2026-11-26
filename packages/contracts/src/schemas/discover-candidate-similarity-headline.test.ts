import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema } from './discover.js'

/**
 * #2166.11 (épopée #2806) — Résultat compte : référence comparable.
 *
 * Même règle de silence que `logoUrl`/`groupRole` : `similarityHeadline` ne
 * voyage QUE quand le serveur a pu apparier ce candidat NEUF à un compte du
 * portefeuille (même secteur registre, NAF exact). Jamais deviné depuis un
 * intitulé de secteur en texte libre — la même précision que
 * `listSimilarCompaniesToExplore` (accounts.service.ts), qui a explicitement
 * remplacé un texte flou par le NAF pour cette raison.
 */
describe('discoverCandidateSchema — similarityHeadline (#2166.11)', () => {
  const base = {
    name: 'Capgemini',
    siren: '552081317',
    nafCode: '62.02A',
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreFactors: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new' as const,
    accountId: null,
    sources: [],
    signals: [],
  }

  it('accepte un candidat SANS similarityHeadline — jamais deviné', () => {
    const parsed = discoverCandidateSchema.parse(base)
    expect(parsed.similarityHeadline).toBeUndefined()
  })

  it('porte similarityHeadline « sector », avec le compte de référence NOMMÉ', () => {
    const parsed = discoverCandidateSchema.parse({
      ...base,
      similarityHeadline: { kind: 'sector' as const, referenceAccount: 'Decathlon' },
    })
    expect(parsed.similarityHeadline).toEqual({ kind: 'sector', referenceAccount: 'Decathlon' })
  })

  it('refuse une référence VIDE — une raison qui ne nomme personne est celle que le retour rejette', () => {
    const result = discoverCandidateSchema.safeParse({
      ...base,
      similarityHeadline: { kind: 'sector' as const, referenceAccount: '' },
    })
    expect(result.success).toBe(false)
  })
})
