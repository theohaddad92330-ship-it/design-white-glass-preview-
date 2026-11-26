import {
  availabilityIsStale,
  clientHistoryScore,
  pushableScore,
  type PushablePenalties,
  type PushableTerms,
} from './pushable'

const NO_PENALTY: PushablePenalties = {
  consentExpired: false,
  previouslyRejected: false,
  alreadyOnMissionAtClient: false,
  availabilityStale: false,
}

const FULL: PushableTerms = {
  correspondence: 100,
  availability: 100,
  rateFit: 100,
  clientHistory: 100,
  evidenceQuality: 100,
}

describe('pushableScore — les 20 cas de la spécification', () => {
  it('1. tous les termes au maximum, aucune pénalité → 100', () => {
    expect(pushableScore(FULL, NO_PENALTY)).toBe(100)
  })

  it('2. tous les termes à zéro → 0', () => {
    expect(
      pushableScore(
        { correspondence: 0, availability: 0, rateFit: 0, clientHistory: 0, evidenceQuality: 0 },
        NO_PENALTY,
      ),
    ).toBe(0)
  })

  it('3. profil parfait mais indisponible → poussable bas malgré une correspondance haute', () => {
    const score = pushableScore({ ...FULL, availability: 0 }, NO_PENALTY)
    expect(score).toBe(80)
  })

  it('4. profil moyen mais libre demain et bien tarifé → poussable au-dessus de la correspondance', () => {
    const score = pushableScore(
      { correspondence: 68, availability: 100, rateFit: 100, clientHistory: 100, evidenceQuality: 70 },
      NO_PENALTY,
    )
    expect(score).toBeGreaterThan(68)
  })

  it('5. un consentement expiré ANNULE le profil, quel que soit le reste', () => {
    expect(pushableScore(FULL, { ...NO_PENALTY, consentExpired: true })).toBe(0)
  })

  it('6. déjà refusé chez ce client → −40', () => {
    expect(pushableScore(FULL, { ...NO_PENALTY, previouslyRejected: true })).toBe(60)
  })

  it('7. déjà en mission chez ce client → −15', () => {
    expect(pushableScore(FULL, { ...NO_PENALTY, alreadyOnMissionAtClient: true })).toBe(85)
  })

  it('8. disponibilité non revalidée depuis plus de 60 jours → −10', () => {
    expect(pushableScore(FULL, { ...NO_PENALTY, availabilityStale: true })).toBe(90)
  })

  it('9. les pénalités se cumulent', () => {
    expect(pushableScore(FULL, { ...NO_PENALTY, previouslyRejected: true, alreadyOnMissionAtClient: true })).toBe(45)
  })

  it('10. le score ne descend jamais sous zéro', () => {
    const score = pushableScore(
      { correspondence: 20, availability: 20, rateFit: 20, clientHistory: 0, evidenceQuality: 20 },
      { consentExpired: false, previouslyRejected: true, alreadyOnMissionAtClient: true, availabilityStale: true },
    )
    expect(score).toBe(0)
  })

  it('11. une disponibilité inconnue sort du calcul au lieu de valoir zéro', () => {
    const unknown = pushableScore({ ...FULL, availability: null }, NO_PENALTY)
    const zero = pushableScore({ ...FULL, availability: 0 }, NO_PENALTY)
    expect(unknown).toBe(100)
    expect(zero).toBeLessThan(unknown)
  })

  it('12. un TJM inconnu sort du calcul', () => {
    expect(pushableScore({ ...FULL, rateFit: null }, NO_PENALTY)).toBe(100)
  })

  it('13. aucun passage antérieur chez ce client ne pénalise pas', () => {
    expect(pushableScore({ ...FULL, clientHistory: null }, NO_PENALTY)).toBe(100)
  })

  it('14. une qualité de preuve inconnue sort du calcul', () => {
    expect(pushableScore({ ...FULL, evidenceQuality: null }, NO_PENALTY)).toBe(100)
  })

  it('15. tous les termes optionnels inconnus → le poussable vaut la correspondance', () => {
    expect(
      pushableScore(
        { correspondence: 73, availability: null, rateFit: null, clientHistory: null, evidenceQuality: null },
        NO_PENALTY,
      ),
    ).toBe(73)
  })

  it('16. la correspondance pèse la moitié du score', () => {
    const high = pushableScore({ ...FULL, correspondence: 100 }, NO_PENALTY)
    const low = pushableScore({ ...FULL, correspondence: 0 }, NO_PENALTY)
    expect(high - low).toBe(50)
  })

  it('17. la disponibilité pèse un cinquième', () => {
    const free = pushableScore({ ...FULL, availability: 100 }, NO_PENALTY)
    const busy = pushableScore({ ...FULL, availability: 0 }, NO_PENALTY)
    expect(free - busy).toBe(20)
  })

  it('18. une valeur hors bornes est ramenée dans l’échelle plutôt que de déborder', () => {
    expect(pushableScore({ ...FULL, correspondence: 500 }, NO_PENALTY)).toBe(100)
    expect(pushableScore({ ...FULL, correspondence: -80 }, NO_PENALTY)).toBe(50)
  })

  it('19. une valeur non finie ne produit pas NaN', () => {
    expect(pushableScore({ ...FULL, correspondence: Number.NaN }, NO_PENALTY)).toBe(50)
  })

  it('20. deux appels sur la même entrée rendent le même score', () => {
    const terms = { correspondence: 61, availability: 70, rateFit: 45, clientHistory: 50, evidenceQuality: 88 }
    expect(pushableScore(terms, NO_PENALTY)).toBe(pushableScore(terms, NO_PENALTY))
  })
})

describe('clientHistoryScore', () => {
  it('rend null quand la personne n’est jamais passée chez ce client', () => {
    // Le compter zéro pénaliserait tout le vivier pour n'avoir jamais été proposé.
    expect(clientHistoryScore(null, false)).toBeNull()
  })

  it('distingue un silence d’un refus', () => {
    expect(clientHistoryScore('no_feedback', false)).toBe(50)
    expect(clientHistoryScore('rejected', false)).toBe(0)
  })

  it('rouvre un refus sur le prix ou le calendrier', () => {
    expect(clientHistoryScore('rejected', true)).toBeGreaterThan(clientHistoryScore('rejected', false) ?? 0)
  })
})

describe('availabilityIsStale', () => {
  const now = new Date('2026-08-20T10:00:00Z')

  it('ne reproche rien quand la question n’a jamais été posée', () => {
    expect(availabilityIsStale(null, now)).toBe(false)
  })

  it('déclenche au-delà de 60 jours', () => {
    expect(availabilityIsStale('2026-06-01T10:00:00Z', now)).toBe(true)
    expect(availabilityIsStale('2026-08-01T10:00:00Z', now)).toBe(false)
  })

  it('ignore une date illisible plutôt que d’en conclure quelque chose', () => {
    expect(availabilityIsStale('pas une date', now)).toBe(false)
  })
})
