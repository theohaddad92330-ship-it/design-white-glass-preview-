import { render, screen } from '@testing-library/react'
import { Check } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGrid } from './CapabilityGrid'

const ROWS = [{ key: 'dealsRead', icon: Check, labelKey: 'Lire les affaires' }] as const

function renderGrid(appSideHint?: string) {
  render(
    <CapabilityGrid
      rows={ROWS}
      capabilities={{ dealsRead: false }}
      labelOf={key => key}
      hint="Une autorisation manque — reconnecte pour activer les fonctions éteintes."
      ctaLabel="Reconnecter"
      onReconnect={vi.fn()}
      reconnecting={false}
      showReconnect
      appSideHint={appSideHint}
    />,
  )
}

describe('SCOPES-I.2 — de qui est le geste ?', () => {
  it('accord ANCIEN : « reconnecte » et son bouton restent le geste qui répare', () => {
    renderGrid(undefined)
    expect(screen.getByText(/reconnecte pour activer/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reconnecter' })).toBeTruthy()
  })

  it('consentement NEUF : on dit que c’est l’app, sans bouton qui ferait boucler', () => {
    renderGrid(
      'Cette fonction n’est pas encore ouverte par notre application HubSpot — ce n’est pas à toi de la réparer, l’équipe est prévenue.',
    )
    expect(screen.getByText(/pas encore ouverte par notre application HubSpot/)).toBeTruthy()
    expect(screen.queryByText(/reconnecte pour activer/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reconnecter' })).toBeNull()
  })
})
