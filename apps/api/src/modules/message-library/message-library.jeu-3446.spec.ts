import { evaluateReadiness, renderVerbatim, type MessageLibraryEntry } from '@bellum/contracts'
import { ALL_IMPORTED_SEQUENCES } from './message-library.seed-data'

/**
 * #3446 tests 1 et 3 — rejoués sur la bibliothèque RÉELLEMENT importée
 * (#3437-#3440), pas sur une fixture : chaque modèle, chaque affirmation.
 */
const entries: MessageLibraryEntry[] = ALL_IMPORTED_SEQUENCES.map(e => ({ id: e.slug, ...e }))

describe('#3446 — la bibliothèque importée, rejouée', () => {
  it('test 1 — un modèle prêt se rend à l’identique : seules les variables changent', () => {
    for (const e of entries.filter(x => evaluateReadiness(x).ready)) {
      const vars = Object.fromEntries(e.expectedVariables.map(v => [v, `«${v}»`]))
      const out = renderVerbatim(e, vars)
      if (!out.ok) throw new Error(`${e.id}: ${out.reason}`)
      const back = e.expectedVariables.reduce((acc, v) => acc.split(`«${v}»`).join(`{{${v}}}`), out.text)
      expect(back).toBe(e.text)
    }
  })

  it('test 3 — un modèle portant une affirmation sans preuve ne sort jamais', () => {
    const withClaims = entries.filter(x => x.claims.some(c => c.verifiedFactId == null))
    expect(withClaims.length).toBeGreaterThan(0)
    for (const e of withClaims) {
      const vars = Object.fromEntries(e.expectedVariables.map(v => [v, 'x']))
      expect(renderVerbatim(e, vars).ok).toBe(false)
    }
  })

  it('test 3 — un fait obligatoire non confirmé (recommandation #3439) bloque le rendu', () => {
    const referral = entries.filter(x => x.mandatoryFacts.length > 0)
    expect(referral.length).toBeGreaterThan(0)
    for (const e of referral) {
      const vars = Object.fromEntries(e.expectedVariables.map(v => [v, 'x']))
      expect(renderVerbatim(e, vars).ok).toBe(false)
    }
  })

  it('test 2 — une variable absente est nommée sur chaque modèle prêt', () => {
    for (const e of entries.filter(x => evaluateReadiness(x).ready && x.expectedVariables.length > 0)) {
      const [missing, ...rest] = e.expectedVariables
      const out = renderVerbatim(e, Object.fromEntries(rest.map(v => [v, 'x'])))
      expect(out.ok).toBe(false)
      if (!out.ok) expect(out.missingVariables).toEqual([missing])
    }
  })
})
