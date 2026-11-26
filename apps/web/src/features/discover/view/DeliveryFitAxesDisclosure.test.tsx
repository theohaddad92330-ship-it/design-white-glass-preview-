import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DeliveryFitAxesDisclosure } from './DeliveryFitAxesDisclosure'

const AXES = [
  'site_presence',
  'presence_frequency',
  'authorized_countries',
  'languages',
  'timezones',
  'security',
  'sensitive_data',
  'mandated_equipment',
  'clearances',
  'contractual_status',
  'team_model',
  'travel',
  'source_freshness',
]

// #3237 — détail des 13 axes de delivery fit (repris de `CandidateSignals.test.tsx`, supprimé par #4068 :
// la carte Découvrir n'a plus de liste détaillée des signaux ; le besoin, lui, garde ce détail).
describe('DeliveryFitAxesDisclosure (#3237)', () => {
  it('sans axe évalué, aucun bouton de détail (rien à auditer)', () => {
    render(<DeliveryFitAxesDisclosure axes={Object.fromEntries(AXES.map(axis => [axis, 'unknown']))} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('au moins un axe évalué : le bouton de détail ouvre les treize axes, tous NOMMÉS', async () => {
    render(
      <DeliveryFitAxesDisclosure
        axes={{ ...Object.fromEntries(AXES.map(axis => [axis, 'unknown'])), site_presence: 'incompatible' }}
      />,
    )
    // Un score n'est jamais nu sous son détail : les axes non évaluables restent NOMMÉS.
    expect(screen.queryByText(/statut contractuel/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/présence sur site/i)).toBeInTheDocument()
    expect(screen.getByText(/statut contractuel/i)).toBeInTheDocument()
  })
})
