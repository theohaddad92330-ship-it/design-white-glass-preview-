import { describe, expect, it } from 'vitest'
import {
  applyFrequencyDiscount,
  applyPreferenceDiscount,
  applyWorkspacePreferenceDiscount,
  decideProactivity,
  messagePriority,
  type ProactiveCandidate,
} from './proactivity.js'

const proactive = (key: string, priority: number): ProactiveCandidate => ({ key, origin: 'proactive', priority })

describe('messagePriority', () => {
  it('multiplie les trois facteurs plutôt que de les additionner', () => {
    expect(messagePriority({ businessImpact: 10, urgency: 10, actionability: 10 })).toBe(100)
    expect(messagePriority({ businessImpact: 5, urgency: 5, actionability: 5 })).toBe(13)
  })

  it('met à ZÉRO un message sur lequel on ne peut rien faire', () => {
    // « Rien à en faire » suffit à ne pas déranger, même si le sujet est grave
    // et pressant. Une somme aurait laissé passer les deux.
    expect(messagePriority({ businessImpact: 10, urgency: 10, actionability: 0 })).toBe(0)
    expect(messagePriority({ businessImpact: 0, urgency: 10, actionability: 10 })).toBe(0)
  })

  it('borne les valeurs hors échelle au lieu de les propager', () => {
    expect(messagePriority({ businessImpact: 99, urgency: 99, actionability: 99 })).toBe(100)
    expect(messagePriority({ businessImpact: -5, urgency: 10, actionability: 10 })).toBe(0)
    expect(messagePriority({ businessImpact: Number.NaN, urgency: 10, actionability: 10 })).toBe(0)
  })
})

describe('applyPreferenceDiscount (#2403.24)', () => {
  it('aucun refus historique ⇒ priorité STRICTEMENT inchangée (jour 1 du catalogue)', () => {
    expect(applyPreferenceDiscount(80, 0)).toBe(80)
  })

  it('un refus réel réduit le classement, sans le faire disparaître', () => {
    const discounted = applyPreferenceDiscount(80, 1)
    expect(discounted).toBeLessThan(80)
    expect(discounted).toBeGreaterThan(0)
  })

  it('plusieurs refus creusent l’écart, mais un plancher empêche le silence total', () => {
    const oneRefusal = applyPreferenceDiscount(80, 1)
    const fiveRefusals = applyPreferenceDiscount(80, 5)
    expect(fiveRefusals).toBeLessThan(oneRefusal)
    expect(fiveRefusals).toBeGreaterThan(0)
  })

  it('un compte de refus illisible (NaN, négatif) ne touche pas la priorité', () => {
    expect(applyPreferenceDiscount(80, Number.NaN)).toBe(80)
    expect(applyPreferenceDiscount(80, -3)).toBe(80)
  })
})

describe('applyFrequencyDiscount (#2403.22)', () => {
  it('aucune offre récente ⇒ priorité STRICTEMENT inchangée', () => {
    expect(applyFrequencyDiscount(80, 0)).toBe(80)
  })

  it('une offre récente réduit un peu le classement, sans le faire disparaître', () => {
    const discounted = applyFrequencyDiscount(80, 1)
    expect(discounted).toBeLessThan(80)
    expect(discounted).toBeGreaterThan(0)
  })

  it('plusieurs offres creusent l’écart, mais un plancher empêche le silence total', () => {
    const oneOffer = applyFrequencyDiscount(80, 1)
    const tenOffers = applyFrequencyDiscount(80, 10)
    expect(tenOffers).toBeLessThan(oneOffer)
    expect(tenOffers).toBeGreaterThan(0)
  })

  it('un compte d’offres illisible (NaN, négatif) ne touche pas la priorité', () => {
    expect(applyFrequencyDiscount(80, Number.NaN)).toBe(80)
    expect(applyFrequencyDiscount(80, -3)).toBe(80)
  })

  it('à pente égale, FRÉQUENCE est plus douce que PRÉFÉRENCE — être vu souvent est un signal plus faible que refuser', () => {
    expect(applyFrequencyDiscount(80, 3)).toBeGreaterThan(applyPreferenceDiscount(80, 3))
  })
})

describe('applyWorkspacePreferenceDiscount (#2319.118)', () => {
  it('aucun refus historique à l’échelle de l’espace ⇒ priorité STRICTEMENT inchangée', () => {
    expect(applyWorkspacePreferenceDiscount(80, 0)).toBe(80)
  })

  it('un refus agrégé de l’espace réduit le classement, sans le faire disparaître', () => {
    const discounted = applyWorkspacePreferenceDiscount(80, 1)
    expect(discounted).toBeLessThan(80)
    expect(discounted).toBeGreaterThan(0)
  })

  it('plusieurs refus creusent l’écart, mais un plancher empêche le silence total', () => {
    const oneRefusal = applyWorkspacePreferenceDiscount(80, 1)
    const tenRefusals = applyWorkspacePreferenceDiscount(80, 10)
    expect(tenRefusals).toBeLessThan(oneRefusal)
    expect(tenRefusals).toBeGreaterThan(0)
  })

  it('un compte de refus illisible (NaN, négatif) ne touche pas la priorité', () => {
    expect(applyWorkspacePreferenceDiscount(80, Number.NaN)).toBe(80)
    expect(applyWorkspacePreferenceDiscount(80, -3)).toBe(80)
  })

  it('à compte égal, la pondération ESPACE reste plus douce que PRÉFÉRENCE personnelle — le refus d’un seul en dit plus que le refus agrégé de plusieurs', () => {
    expect(applyWorkspacePreferenceDiscount(80, 3)).toBeGreaterThan(applyPreferenceDiscount(80, 3))
  })

  it('le plancher espace reste plus haut que le plancher personnel, même à grand compte de refus', () => {
    expect(applyWorkspacePreferenceDiscount(80, 50)).toBeGreaterThan(applyPreferenceDiscount(80, 50))
  })
})

describe('decideProactivity', () => {
  it('notifie les plus prioritaires et SUPPRIME le reste — jamais de file', () => {
    // Une file reporte le bruit au lendemain et produit un rattrapage massif :
    // le même problème, décalé et aggravé.
    const verdict = decideProactivity(
      [proactive('a', 20), proactive('b', 90), proactive('c', 50), proactive('d', 70)],
      { cap: 3, alreadySentToday: 0 },
    )
    expect(verdict.notify.map(c => c.key)).toEqual(['b', 'd', 'c'])
    expect(verdict.suppressed.map(c => c.key)).toEqual(['a'])
  })

  it('laisse TOUJOURS passer un échec, sans consommer de place', () => {
    // Faire entrer un échec dans le plafond ferait taire « ton envoi a raté »
    // parce que trois conseils sont passés avant lui.
    const verdict = decideProactivity(
      [{ key: 'boom', origin: 'failure', priority: 10 }, proactive('a', 90), proactive('b', 80), proactive('c', 70)],
      { cap: 3, alreadySentToday: 0 },
    )
    expect(verdict.notify.map(c => c.key)).toEqual(['boom', 'a', 'b', 'c'])
    expect(verdict.suppressed).toEqual([])
  })

  it('laisse passer ce que l’utilisateur a lui-même déclenché', () => {
    // Ça ne l'interrompt pas : ça lui répond.
    const verdict = decideProactivity([{ key: 'mine', origin: 'user_triggered', priority: 5 }, proactive('a', 90)], {
      cap: 1,
      alreadySentToday: 1,
    })
    expect(verdict.notify.map(c => c.key)).toEqual(['mine'])
    expect(verdict.suppressed.map(c => c.key)).toEqual(['a'])
  })

  it('ne notifie JAMAIS une priorité nulle, même s’il reste de la place', () => {
    // Le plafond est un maximum, pas un quota à remplir.
    const verdict = decideProactivity([proactive('rien', 0)], { cap: 3, alreadySentToday: 0 })
    expect(verdict.notify).toEqual([])
    expect(verdict.suppressed.map(c => c.key)).toEqual(['rien'])
  })

  it('tient compte de ce qui a DÉJÀ interrompu aujourd’hui', () => {
    // Le plafond est journalier, pas par appel : sinon chaque balayage
    // repartirait de zéro et le plafond ne vaudrait rien.
    const verdict = decideProactivity([proactive('a', 90), proactive('b', 80)], { cap: 3, alreadySentToday: 2 })
    expect(verdict.notify.map(c => c.key)).toEqual(['a'])
    expect(verdict.suppressed.map(c => c.key)).toEqual(['b'])
  })

  it('ne notifie plus rien une fois le plafond atteint', () => {
    const verdict = decideProactivity([proactive('a', 100)], { cap: 3, alreadySentToday: 3 })
    expect(verdict.notify).toEqual([])
    expect(verdict.remaining).toBe(0)
  })

  it('borne un plafond aberrant au lieu de le suivre', () => {
    expect(decideProactivity([proactive('a', 50)], { cap: 99, alreadySentToday: 0 }).remaining).toBe(5)
    expect(decideProactivity([proactive('a', 50)], { cap: 0, alreadySentToday: 0 }).remaining).toBe(1)
  })

  it('rend un verdict vide sans erreur quand il n’y a rien à dire', () => {
    // « Rien à dire ⇒ rien envoyé » : jamais de « rien à signaler aujourd'hui ».
    const verdict = decideProactivity([], { cap: 3, alreadySentToday: 0 })
    expect(verdict.notify).toEqual([])
    expect(verdict.suppressed).toEqual([])
  })
})
