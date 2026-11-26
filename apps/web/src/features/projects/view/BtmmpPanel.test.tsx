import { screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { opportunityReadiness } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { BtmmpPanel } from './BtmmpPanel'

/**
 * #3266.16 (BEL-SC-237) — READINESS : le blocage principal et la confiance,
 * combinés depuis le même BTMMP et le même barème anti-inflation qu'ailleurs
 * (`opportunityReadiness`, `@bellum/contracts`) — jamais un second calcul ici.
 */
describe('BtmmpPanel — readiness (#3266.16)', () => {
  it('n’affiche rien de plus quand aucune `readiness` n’est fournie (deploy-skew)', async () => {
    renderWithRouter(<BtmmpPanel opportunityId="proj-1" btmmp={null} />)
    fireEvent.click(await screen.findByText('Qualification (budget, besoin, décideur, délai, moyens, projet)'))
    expect(screen.queryByText(/Blocage principal/)).not.toBeInTheDocument()
    expect(screen.queryByText('Aucun blocage identifié')).not.toBeInTheDocument()
  })

  it('nomme le blocage « opportunité » avant tout axe BTMMP manquant', async () => {
    const readiness = opportunityReadiness({
      btmmp: null,
      evidenceGaps: ['no_fit'],
      confidence: 'medium',
    })
    renderWithRouter(<BtmmpPanel opportunityId="proj-1" btmmp={null} readiness={readiness} />)
    fireEvent.click(await screen.findByText('Qualification (budget, besoin, décideur, délai, moyens, projet)'))
    expect(screen.getByText(/Blocage principal.*Aucune correspondance avec l.offre/)).toBeInTheDocument()
    expect(screen.getByText('Confiance moyenne')).toBeInTheDocument()
  })

  it('dit honnêtement qu’aucun blocage ne reste une fois tout rempli', async () => {
    const full = {
      budget: 'TJM 600',
      timing: 'Q4',
      mission: 'reprise SOC',
      management: 'RSSI',
      process: 'panel via achats',
      nextStep: 'RDV jeudi',
    }
    const readiness = opportunityReadiness({ btmmp: full, evidenceGaps: [], confidence: 'high' })
    renderWithRouter(<BtmmpPanel opportunityId="proj-1" btmmp={full} readiness={readiness} />)
    fireEvent.click(await screen.findByText('Qualification (budget, besoin, décideur, délai, moyens, projet)'))
    expect(screen.getByText('Aucun blocage identifié')).toBeInTheDocument()
  })
})
