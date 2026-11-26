/**
 * #2630.1 — LA PASSE RAPIDE, et ce qu'elle refuse de dire.
 *
 * Décision de Louis du 20/09/2026 (QCM) : on la construit. Vingt comptes, un
 * verdict court et sa raison courte par compte, avec LES AXES qu'elle a pu
 * évaluer ET le nom de ceux qu'elle n'a pas pu.
 *
 * Ce fichier tient les quatre refus qui ne se négocient pas, et chacun est
 * cassé sur un COUPABLE FACTICE pour prouver que le contrat sait dire NON :
 *  1. aucun pourcentage, aucune probabilité — refusée six fois ;
 *  2. un axe non évaluable SORT du dénominateur (GA-18 / GA-19), il ne vaut
 *     jamais zéro ;
 *  3. un verdict ne se rend pas sur du vide : sans axe décisif évalué, la
 *     réponse est l'ABSENCE de verdict, jamais « prudence » par défaut ;
 *  4. un axe non évaluable reste NOMMÉ — « deux axes non évaluables »
 *     n'apprend rien.
 */
import { describe, expect, it } from 'vitest'
import {
  DISCOVER_QUICK_PASS_AXES,
  DISCOVER_QUICK_PASS_AXIS_WEIGHTS,
  DISCOVER_QUICK_PASS_MAX_ACCOUNTS,
  DISCOVER_QUICK_PASS_MIN_EVALUATED_AXES,
  DISCOVER_QUICK_PASS_VERDICTS,
  buildDiscoverQuickPassEntry,
  discoverQuickPassEntrySchema,
  discoverQuickPassResultSchema,
  type DiscoverQuickPassAxisResult,
  type DiscoverQuickPassInput,
} from './discover-quick-pass.js'

/** L'entrée la plus complète possible : les quatre axes renseignés, tout au vert. */
const ALL_GREEN: DiscoverQuickPassInput = {
  siren: '552032534',
  name: 'Roggeman Structures',
  interest: { score: 62, scoreMax: 70 },
  access: { level: 'direct' },
  signal: { searched: true, count: 2 },
  namedContact: { count: 3 },
}

function axisOf(axes: readonly DiscoverQuickPassAxisResult[], axis: string): DiscoverQuickPassAxisResult {
  const found = axes.find(candidate => candidate.axis === axis)
  if (!found) throw new Error(`axe absent du résultat : ${axis}`)
  return found
}

describe('#2630.1 — les trois verdicts, et rien d’autre', () => {
  it('le verdict est GO / PRUDENCE / NON — jamais un quatrième mot', () => {
    expect([...DISCOVER_QUICK_PASS_VERDICTS]).toEqual(['go', 'prudence', 'non'])
  })

  it('tout au vert donne GO, et le verdict NOMME les axes qu’il a pesés', () => {
    const entry = buildDiscoverQuickPassEntry(ALL_GREEN)
    expect(entry.verdict).toBe('go')
    expect(entry.evaluatedAxes).toEqual([...DISCOVER_QUICK_PASS_AXES])
    expect(entry.unevaluableAxes).toEqual([])
    expect(discoverQuickPassEntrySchema.parse(entry)).toBeTruthy()
  })

  it('une réserve mesurée donne PRUDENCE — un état d’accès n’est pas un refus', () => {
    const entry = buildDiscoverQuickPassEntry({ ...ALL_GREEN, access: { level: 'rang3_plus' } })
    expect(entry.verdict).toBe('prudence')
    expect(entry.attentionAxes).toContain('access')
  })

  it('un ZÉRO MESURÉ sur l’axe décisif donne NON — et il est nommé bloquant', () => {
    const entry = buildDiscoverQuickPassEntry({ ...ALL_GREEN, interest: { score: 0, scoreMax: 70 } })
    expect(entry.verdict).toBe('non')
    expect(entry.blockingAxes).toEqual(['interest'])
  })
})

describe('#2630.1 — un axe non évaluable sort du dénominateur (GA-18 / GA-19)', () => {
  it('l’axe non évaluable n’est PAS compté comme évalué, et ne vaut pas zéro', () => {
    const entry = buildDiscoverQuickPassEntry({ ...ALL_GREEN, signal: { searched: false, count: 0 } })
    expect(entry.evaluatedCount).toBe(3)
    expect(entry.axisCount).toBe(4)
    expect(entry.unevaluableAxes).toEqual(['signal'])
    // …et surtout : il n'est ni dans les réserves, ni dans les bloquants.
    expect(entry.attentionAxes).not.toContain('signal')
    expect(entry.blockingAxes).not.toContain('signal')
  })

  it('un axe non évaluable reste NOMMÉ, avec la raison de son silence', () => {
    const entry = buildDiscoverQuickPassEntry({ ...ALL_GREEN, namedContact: { count: null } })
    const axis = axisOf(entry.axes, 'named_contact')
    expect(axis.state).toBeNull()
    expect(axis.unevaluable).toBe('notCollected')
    // Un axe non évaluable ne porte AUCUNE mesure : pas de 0 déguisé.
    expect(axis.measured).toBeNull()
  })

  it('« interrogé, rien trouvé » est une MESURE, « pas interrogé » n’en est pas une', () => {
    const searched = buildDiscoverQuickPassEntry({ ...ALL_GREEN, signal: { searched: true, count: 0 } })
    expect(axisOf(searched.axes, 'signal').state).toBe('attention')

    const notSearched = buildDiscoverQuickPassEntry({ ...ALL_GREEN, signal: { searched: false, count: 0 } })
    expect(axisOf(notSearched.axes, 'signal').state).toBeNull()
  })
})

describe('#2630.1 — un verdict ne se rend pas sur du vide', () => {
  it('l’axe DÉCISIF non évaluable interdit tout verdict — pas de « prudence » par défaut', () => {
    const entry = buildDiscoverQuickPassEntry({ ...ALL_GREEN, interest: { score: null, scoreMax: null } })
    expect(entry.verdict).toBeNull()
    expect(entry.unevaluableDecisiveAxes).toEqual(['interest'])
    expect(DISCOVER_QUICK_PASS_AXIS_WEIGHTS.interest).toBe('decisive')
  })

  it('sous le plancher d’axes évalués, il n’y a pas de verdict non plus', () => {
    const entry = buildDiscoverQuickPassEntry({
      siren: '552032534',
      name: 'Roggeman Structures',
      interest: { score: 62, scoreMax: 70 },
      access: { level: 'inconnu' },
      signal: { searched: false, count: 0 },
      namedContact: { count: null },
    })
    expect(entry.evaluatedCount).toBeLessThan(DISCOVER_QUICK_PASS_MIN_EVALUATED_AXES)
    expect(entry.verdict).toBeNull()
    expect(entry.unevaluableAxes).toEqual(['access', 'signal', 'named_contact'])
  })

  it('un bloquant CONNU l’emporte sur une ignorance — on ne se tait pas devant un non', () => {
    const entry = buildDiscoverQuickPassEntry({
      siren: '552032534',
      name: 'Roggeman Structures',
      interest: { score: 0, scoreMax: 70 },
      access: { level: 'inconnu' },
      signal: { searched: false, count: 0 },
      namedContact: { count: null },
    })
    expect(entry.verdict).toBe('non')
  })
})

describe('#2630.1 — le contrat sait dire NON (coupables factices)', () => {
  it('refuse un POURCENTAGE dans la raison d’un axe', () => {
    const entry = buildDiscoverQuickPassEntry(ALL_GREEN)
    const guilty = { ...entry, reason: 'goodFit' as string }
    // Le coupable : une raison qui chiffre une chance.
    expect(() => discoverQuickPassEntrySchema.parse({ ...guilty, reason: '78 % de chances de signer' })).toThrow()
    expect(() => discoverQuickPassEntrySchema.parse({ ...guilty, reason: 'probabilite_de_closing' })).toThrow()
  })

  it('refuse un axe qui serait à la fois évalué ET non évaluable', () => {
    const entry = buildDiscoverQuickPassEntry(ALL_GREEN)
    expect(() => discoverQuickPassEntrySchema.parse({ ...entry, unevaluableAxes: ['interest'] })).toThrow()
  })

  it('refuse un verdict posé alors que l’axe décisif n’a pas été évalué', () => {
    const honest = buildDiscoverQuickPassEntry({ ...ALL_GREEN, interest: { score: null, scoreMax: null } })
    expect(discoverQuickPassEntrySchema.parse(honest)).toBeTruthy()
    expect(() => discoverQuickPassEntrySchema.parse({ ...honest, verdict: 'go' })).toThrow()
  })

  it('refuse une passe de plus de vingt comptes — le lot est BORNÉ', () => {
    expect(DISCOVER_QUICK_PASS_MAX_ACCOUNTS).toBe(20)
    const entries = Array.from({ length: DISCOVER_QUICK_PASS_MAX_ACCOUNTS + 1 }, (_, index) =>
      buildDiscoverQuickPassEntry({ ...ALL_GREEN, siren: String(100000000 + index) }),
    )
    expect(() => discoverQuickPassResultSchema.parse({ entries, reviewedAt: '2026-09-21T10:00:00.000Z' })).toThrow()
    expect(
      discoverQuickPassResultSchema.parse({
        entries: entries.slice(0, DISCOVER_QUICK_PASS_MAX_ACCOUNTS),
        reviewedAt: '2026-09-21T10:00:00.000Z',
      }).entries,
    ).toHaveLength(DISCOVER_QUICK_PASS_MAX_ACCOUNTS)
  })

  it('laisse tranquille un INNOCENT : une raison qualitative passe', () => {
    const entry = buildDiscoverQuickPassEntry(ALL_GREEN)
    expect(discoverQuickPassEntrySchema.parse(entry).reason).toBe(entry.reason)
  })
})
