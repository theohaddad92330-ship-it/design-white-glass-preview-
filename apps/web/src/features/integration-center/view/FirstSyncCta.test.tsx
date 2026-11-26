import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FirstSyncCta } from './FirstSyncCta'

/**
 * #2207.19 — le CTA « Synchroniser et comprendre mes données », après le
 * toast de connexion OAuth.
 */
describe('#2207.19 — FirstSyncCta', () => {
  it('porte le libellé du geste, et le nomme dans un bouton', () => {
    render(<FirstSyncCta name="HubSpot" onLaunch={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('button', { name: /Synchroniser et comprendre mes données/ })).toBeInTheDocument()
  })

  it('le clic sur le geste principal appelle `onLaunch`', () => {
    const onLaunch = vi.fn()
    render(<FirstSyncCta name="HubSpot" onLaunch={onLaunch} onDismiss={() => {}} />)
    screen.getByRole('button', { name: /Synchroniser et comprendre mes données/ }).click()
    expect(onLaunch).toHaveBeenCalled()
  })

  it('« Plus tard » ferme le bandeau sans bloquer — appelle `onDismiss`', () => {
    const onDismiss = vi.fn()
    render(<FirstSyncCta name="HubSpot" onLaunch={() => {}} onDismiss={onDismiss} />)
    screen.getByRole('button', { name: 'Plus tard' }).click()
    expect(onDismiss).toHaveBeenCalled()
  })

  it('#3014 (26/09) — en mode `resync`, le libellé change et « Plus tard » disparaît', () => {
    const onLaunch = vi.fn()
    render(<FirstSyncCta name="HubSpot" onLaunch={onLaunch} resync />)
    const button = screen.getByRole('button', { name: 'Resynchroniser' })
    expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument()
    button.click()
    expect(onLaunch).toHaveBeenCalled()
  })
})
