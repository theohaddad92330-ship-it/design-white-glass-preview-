import { detectSegmentLanguage, transcriptionCostRow, TRANSCRIPTION_USD_PER_MINUTE } from './segment-language'

/**
 * #3579 / #2434.77 — la langue PAR SEGMENT. Le service de transcription ne rend la langue
 * que pour tout l'enregistrement : on la déduit du texte de chaque segment, et on dit
 * « indéterminée » (null) plutôt que de deviner.
 */
describe('detectSegmentLanguage', () => {
  it('reconnaît un segment français', () => {
    expect(detectSegmentLanguage('Prépare une relance pour le directeur des achats')).toBe('fr')
  })

  it('reconnaît un segment anglais', () => {
    expect(detectSegmentLanguage('Please send the proposal to the client before Friday')).toBe('en')
  })

  it('un mélange : chaque segment garde sa langue', () => {
    expect(detectSegmentLanguage('on a un go pour le projet')).toBe('fr')
    expect(detectSegmentLanguage('we need the budget for this')).toBe('en')
  })

  it('un segment trop court ou sans mot-outil : indéterminé, jamais deviné', () => {
    expect(detectSegmentLanguage('Nova Logistique')).toBeNull()
    expect(detectSegmentLanguage('')).toBeNull()
    expect(detectSegmentLanguage('   ')).toBeNull()
  })

  it('égalité parfaite : indéterminé', () => {
    expect(detectSegmentLanguage('the le')).toBeNull()
  })
})

describe('transcriptionCostRow — le coût par minute entre dans le registre de coûts', () => {
  it('compte les minutes et tarife au prix par minute', () => {
    const row = transcriptionCostRow(90)
    expect(row).toMatchObject({ operation: 'transcribe', calls: 1, units: 1.5 })
    expect(row?.cost_usd).toBeCloseTo(1.5 * TRANSCRIPTION_USD_PER_MINUTE, 6)
    expect(row?.tariff_version).toBeTruthy()
  })

  it('durée non rendue : ligne NON tarifée (null), jamais 0', () => {
    expect(transcriptionCostRow(null)).toMatchObject({ units: 0, cost_usd: null })
  })
})
