import { render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { OffersCascadeNotice } from './OffersCascadeNotice'

const tier = (t: string, status: string, gained = 0) => ({
  tier: t,
  status,
  gained,
  paid: 0,
  cached: 0,
  notAttempted: 0,
})

const TRIED = [
  tier('sources', 'tenté', 1),
  tier('terms', 'tenté', 1),
  tier('window', 'tenté', 1),
  tier('group', 'tenté'),
]

const raw = (offersCascade: Record<string, unknown>) => ({ offersCascade })

// CASCADE-ECRAN — la veille du compte DIT ce que la cascade d'offres a fait (moteur : apps/ia offers_cascade.py).
describe('OffersCascadeNotice', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('fr')
  })
  afterEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('cascade déclenchée : le texte d’élargissement nomme le palier atteint', () => {
    render(
      <OffersCascadeNotice
        rawAnalysis={raw({
          floor: 5,
          found: 6,
          belowFloor: false,
          explicit: false,
          reason: null,
          paidCalls: 3,
          tiers: [
            tier('sources', 'tenté', 2),
            tier('terms', 'tenté', 1),
            tier('window', 'plancher atteint'),
            tier('group', 'plancher atteint'),
          ],
        })}
      />,
    )
    const note = screen.getByTestId('offers-cascade-notice')
    expect(note.textContent).toContain('Peu d’offres du métier')
    expect(note.textContent).toContain('intitulés voisins')
    expect(screen.queryByTestId('offers-cascade-floor')).toBeNull()
  })

  it('cascade NON déclenchée (plancher atteint au palier 0) : aucune ligne, aucun texte', () => {
    const { container } = render(
      <OffersCascadeNotice
        rawAnalysis={raw({
          floor: 5,
          found: 6,
          belowFloor: false,
          explicit: false,
          reason: null,
          paidCalls: 1,
          tiers: ['sources', 'terms', 'window', 'group'].map(t => tier(t, 'plancher atteint')),
        })}
      />,
    )
    expect(container.textContent).toBe('')
    const none = render(<OffersCascadeNotice rawAnalysis={{}} />)
    expect(none.container.textContent).toBe('')
  })

  it('plancher non atteint après toute la cascade : le vrai nombre est affiché ET le dit', () => {
    render(
      <OffersCascadeNotice
        rawAnalysis={raw({
          floor: 5,
          found: 3,
          belowFloor: true,
          explicit: false,
          reason: 'sous le plancher après toute la cascade',
          paidCalls: 4,
          tiers: TRIED,
        })}
      />,
    )
    const floor = screen.getByTestId('offers-cascade-floor')
    expect(floor.textContent).toContain('3 offres du métier')
    expect(floor.textContent).toContain('5')
    expect(floor.textContent).toMatch(/hors métier/)
  })

  it('aucune offre du métier : le manque se dit sans chiffre, jamais « 0 »', () => {
    render(
      <OffersCascadeNotice
        rawAnalysis={raw({
          floor: 5,
          found: 0,
          belowFloor: true,
          explicit: false,
          reason: 'sous le plancher après toute la cascade',
          paidCalls: 4,
          tiers: TRIED,
        })}
      />,
    )
    const floor = screen.getByTestId('offers-cascade-floor')
    expect(floor.textContent).not.toMatch(/\b0\b/)
    expect(floor.textContent).toContain('Aucune offre du métier')
  })

  it('en anglais : le même texte, sans nom de fournisseur', async () => {
    await i18n.changeLanguage('en')
    render(
      <OffersCascadeNotice
        rawAnalysis={raw({
          floor: 5,
          found: 3,
          belowFloor: true,
          explicit: false,
          reason: 'sous le plancher après toute la cascade',
          paidCalls: 4,
          tiers: TRIED,
        })}
      />,
    )
    expect(screen.getByTestId('offers-cascade-notice').textContent).toContain('Few offers for the trade')
    expect(screen.getByTestId('offers-cascade-floor').textContent).toContain('3 offers for the trade')
  })

  it('#4646.7 — dit combien d’offres viennent de Découvrir quand la collecte n’en a retrouvé aucune', () => {
    render(
      <OffersCascadeNotice
        rawAnalysis={raw({
          floor: 5,
          found: 0,
          belowFloor: true,
          explicit: true,
          reason: 'sous le plancher après toute la cascade',
          paidCalls: 5,
          tiers: TRIED,
          carriedFromDiscover: 3,
        })}
      />,
    )
    expect(screen.getByTestId('offers-cascade-carried')).toHaveTextContent(/3 offres/)
    expect(screen.getByTestId('offers-cascade-carried')).toHaveTextContent(/Découvrir/)
  })
})
