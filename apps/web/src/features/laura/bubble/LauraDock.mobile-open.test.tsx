import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { askLaura } from '@/features/chat/api/laura-turn'
import { LauraDock } from './LauraDock'
import { requestLauraOpen, resetLauraIntro } from './laura-intro-store'

/**
 * #4345.2 / #4309.4 — SOUS 768 px, « Demander à Laura » ouvre la bulle sur la page, question PRÉ-REMPLIE.
 * Sans demande, rien ne s'ajoute à l'écran étroit (pas de rond flottant : Laura est le premier onglet).
 */
vi.mock('@/features/chat/api/laura-turn', () => ({ askLaura: vi.fn() }))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => true }))
const askLauraMock = vi.mocked(askLaura)

afterEach(() => {
  askLauraMock.mockClear()
  resetLauraIntro()
})

describe('LauraDock sur mobile — la bulle s’ouvre à la demande', () => {
  it('sans demande, aucun rond flottant ni panneau', async () => {
    renderWithRouter(<LauraDock />)
    expect(screen.queryByRole('region', { name: /laura/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ouvrir/i })).not.toBeInTheDocument()
  })

  it('une demande d’ouverture montre le panneau avec la question pré-remplie, sans l’envoyer', async () => {
    renderWithRouter(
      <>
        <button type="button" onClick={() => requestLauraOpen('Pourquoi ce compte ?')}>
          Demander à Laura
        </button>
        <LauraDock />
      </>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Demander à Laura' }))
    expect(await screen.findByDisplayValue('Pourquoi ce compte ?')).toBeInTheDocument()
    expect(askLauraMock).not.toHaveBeenCalled()
  })

  it('fermer le panneau le retire et rend le focus au déclencheur', async () => {
    renderWithRouter(
      <>
        <button type="button" onClick={() => requestLauraOpen('Q')}>
          Demander à Laura
        </button>
        <LauraDock />
      </>,
    )
    const trigger = await screen.findByRole('button', { name: 'Demander à Laura' })
    trigger.focus()
    fireEvent.click(trigger)
    await screen.findByDisplayValue('Q')
    fireEvent.click(screen.getAllByRole('button', { name: /fermer/i })[0]!)
    expect(screen.queryByDisplayValue('Q')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
