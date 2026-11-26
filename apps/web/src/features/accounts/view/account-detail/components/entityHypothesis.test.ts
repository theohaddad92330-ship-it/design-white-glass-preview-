import { describe, expect, it } from 'vitest'
import { readEntityHypothesis } from './entityHypothesis'

/**
 * #2265.13 — « sinon choisir le plus probable ET ANNONCER L'HYPOTHÈSE ».
 *
 * `homonym_disambiguation.py` (Théo p.10) choisit déjà silencieusement un
 * candidat DOMINANT quand plusieurs entités homonymes sont plausibles
 * (`status: "selected"`) — la sélection existait, l'annonce non. Cette fonction
 * lit `raw_analysis.homonyms` (écrit par `phase1_research.py`) et ne rend une
 * hypothèse que pour CE statut précis : `unique`/`locked` n'ont rien deviné,
 * `ambiguous`/`none` n'ont rien sélectionné.
 */
describe('readEntityHypothesis', () => {
  it('rend le message quand le statut est "selected" (candidat dominant, non unique)', () => {
    const result = readEntityHypothesis({
      homonyms: {
        status: 'selected',
        selectedSiren: '552120222',
        confidence: 0.82,
        message:
          'SIREN 552120222 (SOCIETE GENERALE) retenu parmi 3 homonymes (confiance 82%, écart de score décisif vs 2ᵉ à 41%).',
      },
    })
    expect(result).toEqual({
      message:
        'SIREN 552120222 (SOCIETE GENERALE) retenu parmi 3 homonymes (confiance 82%, écart de score décisif vs 2ᵉ à 41%).',
    })
  })

  it('ne rend rien pour "unique" — un seul candidat plausible, rien deviné', () => {
    expect(
      readEntityHypothesis({
        homonyms: { status: 'unique', selectedSiren: '552120222', confidence: 0.9, message: 'Un seul candidat.' },
      }),
    ).toBeNull()
  })

  it('ne rend rien pour "locked" — SIREN fourni par l’utilisateur, pas une hypothèse', () => {
    expect(
      readEntityHypothesis({
        homonyms: { status: 'locked', selectedSiren: '552120222', confidence: 1, message: 'SIREN fourni.' },
      }),
    ).toBeNull()
  })

  it('ne rend rien pour "ambiguous" — rien n’a été sélectionné', () => {
    expect(
      readEntityHypothesis({
        homonyms: { status: 'ambiguous', selectedSiren: null, confidence: 0.6, message: '3 homonymes proches.' },
      }),
    ).toBeNull()
  })

  it('ne rend rien pour "none" — aucun candidat', () => {
    expect(
      readEntityHypothesis({ homonyms: { status: 'none', selectedSiren: null, confidence: 0, message: 'Aucun.' } }),
    ).toBeNull()
  })

  it('ne rend rien sans bloc homonyms (dossier antérieur à ce chantier)', () => {
    expect(readEntityHypothesis({})).toBeNull()
    expect(readEntityHypothesis(null)).toBeNull()
    expect(readEntityHypothesis(undefined)).toBeNull()
  })

  it('ne rend rien si "selected" mais le message est vide (blob malformé)', () => {
    expect(
      readEntityHypothesis({ homonyms: { status: 'selected', selectedSiren: '1', confidence: 0.8, message: '' } }),
    ).toBeNull()
  })
})
