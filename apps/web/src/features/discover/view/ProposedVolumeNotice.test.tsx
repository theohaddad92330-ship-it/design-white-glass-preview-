import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProposedVolumeNotice } from './ProposedVolumeNotice'

// #2291.9 — DÉCISION Louis 19/09/2026 : le volume proposé s'affiche AVEC sa
// règle, jamais un nombre nu — et la règle diffère selon que la taille
// d'équipe commerciale a été reconnue (`band`) ou non (`band: null`).
describe('ProposedVolumeNotice', () => {
  it('palier connu : nomme le volume ET la taille d’équipe qui l’a produit', () => {
    render(<ProposedVolumeNotice volume={{ count: 25, band: 'fourToEight' }} />)
    expect(screen.getByText(/25 comptes proposés/)).toBeInTheDocument()
    expect(screen.getByText(/4 à 8 personnes/)).toBeInTheDocument()
  })

  it('palier au minimum (1 à 3 personnes)', () => {
    render(<ProposedVolumeNotice volume={{ count: 10, band: 'oneToThree' }} />)
    expect(screen.getByText(/10 comptes proposés/)).toBeInTheDocument()
    expect(screen.getByText(/1 à 3 personnes/)).toBeInTheDocument()
  })

  it('palier au maximum (9 personnes ou plus)', () => {
    render(<ProposedVolumeNotice volume={{ count: 50, band: 'nineOrMore' }} />)
    expect(screen.getByText(/50 comptes proposés/)).toBeInTheDocument()
  })

  // #4016 L7 — décision Louis 11/10/2026 : Découvrir SANS PALIER. Le volume
  // est un PREMIER LOT, et l'écran le dit — sinon « 25 comptes proposés »
  // se lirait encore comme un plafond.
  it('dit que le volume est un PREMIER LOT, que les pages (12) et « Charger d’autres comptes » continuent, et que ça ne coûte rien', () => {
    render(<ProposedVolumeNotice volume={{ count: 25, band: 'fourToEight' }} />)
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toMatch(/premier lot/i)
    expect(text).toMatch(/par 12.*Charger d’autres comptes/)
    // #4301.2 — « sans plafond » dit en français courant (plus de « palier »), sans chiffre promis.
    expect(text).toMatch(/sans plafond/i)
    expect(text).toMatch(/sans plafond/i)
    expect(text).not.toMatch(/cr[ée]dit/i)
    expect(text).not.toMatch(/palier/i)
  })

  it('même phrase quand la taille n’est pas déclarée', () => {
    render(<ProposedVolumeNotice volume={{ count: 24, band: null }} />)
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toMatch(/premier lot/i)
    expect(text).toMatch(/par 12.*Charger d’autres comptes/)
  })

  it('taille non déclarée : dit le défaut, jamais un palier inventé', () => {
    render(<ProposedVolumeNotice volume={{ count: 24, band: null }} />)
    expect(screen.getByRole('status').textContent).toMatch(/non déclarée/i)
    expect(screen.getByRole('status').textContent).toMatch(/24/)
  })

  // #3901 R25 — « personnes C'est un premier lot » : deux phrases collées sans ponctuation.
  it('sépare le palier et « C’est un premier lot » par un point', () => {
    render(<ProposedVolumeNotice volume={{ count: 10, band: 'fourToEight' }} />)
    expect(screen.getByRole('status').textContent).toMatch(/4 à 8 personnes\. C.est un premier lot/)
  })
})
