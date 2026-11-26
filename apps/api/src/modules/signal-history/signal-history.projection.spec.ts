import {
  projectSignalHistory,
  salesImplicationForLabel,
  signalHistoryKey,
  sourceLinkForLabel,
} from './signal-history.projection'

describe('signalHistoryKey', () => {
  it('normalizes case and whitespace so a reformatted label stays the SAME signal', () => {
    expect(signalHistoryKey('  Levée de   fonds  ')).toBe('levée de fonds')
    expect(signalHistoryKey('LEVÉE DE FONDS')).toBe(signalHistoryKey('levée de fonds'))
  })
})

describe('projectSignalHistory', () => {
  it('reads the label from the first populated field, in the same order as the veille diff', () => {
    const records = projectSignalHistory([
      { signal: 'Levée de fonds série B' },
      { title: 'Nomination DSI' },
      { label: 'Appel d’offres SI' },
      { description: 'Rachat de Foo' },
      { summary: 'Ouverture d’un site' },
    ])
    expect(records.map(record => record.label)).toEqual([
      'Levée de fonds série B',
      'Nomination DSI',
      'Appel d’offres SI',
      'Rachat de Foo',
      'Ouverture d’un site',
    ])
  })

  it('keeps the payload as-is and never invents a missing field', () => {
    const [record] = projectSignalHistory([
      { signal: 'Levée de fonds', type: 'funding', source: 'Les Échos', date: '2026-07-02', freshness: 'current' },
    ])
    expect(record).toEqual({
      key: 'levée de fonds',
      label: 'Levée de fonds',
      type: 'funding',
      source: 'Les Échos',
      date: '2026-07-02',
      freshness: 'current',
      importance: 'high',
    })

    const [bare] = projectSignalHistory([{ signal: 'Levée de fonds' }])
    expect(bare).toMatchObject({ type: null, source: null, date: null, freshness: null, importance: null })
  })

  // ── Importance dérivée (restitution V2 §20) ────────────────────────────────
  describe('importance', () => {
    const NOW = Date.UTC(2026, 6, 23)

    it('derives high / medium / low from the rules already in force', () => {
      const [sourced] = projectSignalHistory([{ signal: 'A', date: 'Juillet 2026', source: 'Les Échos' }], NOW)
      const [unsourced] = projectSignalHistory([{ signal: 'B', date: 'Juillet 2026' }], NOW)
      const [archived] = projectSignalHistory([{ signal: 'C', date: '10 mars 2021', source: 'Les Échos' }], NOW)

      expect(sourced?.importance).toBe('high')
      expect(unsourced?.importance).toBe('medium')
      expect(archived?.importance).toBe('low')
    })

    it('leaves it NULL when nothing situates the signal in time (jamais devinée)', () => {
      const [undated] = projectSignalHistory([{ signal: 'D', freshness: 'undated', source: 'Les Échos' }], NOW)
      const [dateless] = projectSignalHistory([{ signal: 'E', source: 'Les Échos' }], NOW)

      expect(undated?.importance).toBeNull()
      expect(dateless?.importance).toBeNull()
    })
  })

  it('drops unlabelled / non-object entries — what cannot be shown cannot be historised', () => {
    expect(projectSignalHistory([{ type: 'funding' }, 'texte brut', null, 42, [], { signal: '   ' }])).toEqual([])
  })

  it('dedupes by identity so one blob can never write the same signal twice', () => {
    const records = projectSignalHistory([
      { signal: 'Levée de fonds', source: 'Les Échos' },
      { signal: '  levée   de FONDS ', source: 'BFM' },
    ])
    expect(records).toHaveLength(1)
    // Le premier gagne : `recent_signals` est trié du plus pertinent au moins.
    expect(records[0]?.source).toBe('Les Échos')
  })

  it('ignores a date or source change for identity — that is a CHANGE, not a new signal', () => {
    const first = projectSignalHistory([{ signal: 'Levée de fonds', date: '2026-07-01', source: 'Les Échos' }])
    const second = projectSignalHistory([{ signal: 'Levée de fonds', date: '2026-07-02', source: 'BFM' }])
    expect(first[0]?.key).toBe(second[0]?.key)
  })

  it('returns nothing for a non-array blob (no analysis result = no conclusion)', () => {
    expect(projectSignalHistory(undefined)).toEqual([])
    expect(projectSignalHistory(null)).toEqual([])
    expect(projectSignalHistory({ signal: 'x' })).toEqual([])
  })
})

// #2107.33 — « raison pour laquelle cela concerne cette ESN ». `sales_implication`
// est la lecture commerciale que l'IA écrit déjà sur `accounts.recent_signals` ;
// aucun signal_history n'en porte de copie (la table n'historise que l'identité et
// la fraîcheur, #1424 vit sur le blob). Retrouver l'implication d'une détection
// suppose donc de rapparier par la MÊME identité que `projectSignalHistory`
// (`signalHistoryKey`), jamais une seconde clé.
describe('salesImplicationForLabel', () => {
  it('matches the recent_signals entry with the same identity as the historised label', () => {
    const recentSignals = [
      { signal: 'Levée de fonds série B', sales_implication: 'Budget IT en hausse.' },
      { signal: 'Nomination DSI', sales_implication: 'Fenêtre de re-référencement ouverte.' },
    ]
    expect(salesImplicationForLabel(recentSignals, 'Levée de fonds série B')).toBe('Budget IT en hausse.')
    expect(salesImplicationForLabel(recentSignals, '  LEVÉE   de fonds série B ')).toBe('Budget IT en hausse.')
    expect(salesImplicationForLabel(recentSignals, 'Nomination DSI')).toBe('Fenêtre de re-référencement ouverte.')
  })

  it('reads either spelling the two writers use — the AI camelCase, the demo seed snake_case', () => {
    const recentSignals = [{ signal: 'Levée de fonds', salesImplication: 'Budget IT en hausse.' }]
    expect(salesImplicationForLabel(recentSignals, 'Levée de fonds')).toBe('Budget IT en hausse.')
  })

  it('never invents a reason — absent, blank, or unmatched all read null', () => {
    expect(salesImplicationForLabel([{ signal: 'Levée de fonds' }], 'Levée de fonds')).toBeNull()
    expect(
      salesImplicationForLabel([{ signal: 'Levée de fonds', sales_implication: '   ' }], 'Levée de fonds'),
    ).toBeNull()
    expect(salesImplicationForLabel([{ signal: 'Autre chose', sales_implication: 'x' }], 'Levée de fonds')).toBeNull()
    expect(salesImplicationForLabel(undefined, 'Levée de fonds')).toBeNull()
    expect(salesImplicationForLabel(null, 'Levée de fonds')).toBeNull()
  })
})

// Théo A today-jour — « sources cliquables » : le lien de la carte est celui du signal lui-même, rapparié par la
// MÊME identité que l'implication commerciale.
describe('sourceLinkForLabel', () => {
  it('returns the publisher link of the matched signal, with its kind', () => {
    const recentSignals = [
      { signal: 'Levée de fonds série B', url: 'https://www.lesechos.fr/tech/levee-serie-b', source_kind: 'press' },
      { signal: 'Nomination DSI', url: 'https://www.bodacc.fr/annonce/123', source_kind: 'bodacc' },
    ]
    expect(sourceLinkForLabel(recentSignals, '  LEVÉE de fonds série B ')).toEqual({
      url: 'https://www.lesechos.fr/tech/levee-serie-b',
      kind: 'press',
    })
    expect(sourceLinkForLabel(recentSignals, 'Nomination DSI')?.kind).toBe('bodacc')
  })

  it('never invents a link — no URL, a non-http URL, or an unmatched label all read null', () => {
    expect(sourceLinkForLabel([{ signal: 'Levée de fonds' }], 'Levée de fonds')).toBeNull()
    expect(sourceLinkForLabel([{ signal: 'Levée de fonds', url: 'javascript:alert(1)' }], 'Levée de fonds')).toBeNull()
    expect(sourceLinkForLabel([{ signal: 'Autre', url: 'https://example.com/x' }], 'Levée de fonds')).toBeNull()
    expect(sourceLinkForLabel(undefined, 'Levée de fonds')).toBeNull()
  })
})
