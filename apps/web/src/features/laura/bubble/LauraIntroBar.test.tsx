import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LauraIntroBar } from './LauraIntroBar'
import type { LauraIntro } from './laura-intro-store'

/**
 * #1812 — LA BULLE AGRANDIE : présentation pure, aucune dépendance réseau.
 *
 * ⚠️ jsdom ne met rien en page : ces tests vérifient la STRUCTURE (la phrase
 * est affichée, le bouton est un VRAI bouton tabulable) et le COMPORTEMENT au
 * clic/clavier — jamais une classe CSS ou une mesure de disposition.
 */

function intro(overrides: Partial<LauraIntro> = {}): LauraIntro {
  // `scopeDepth: 0` = déposée par la PAGE (#1847). La barre elle-même ne s'en
  // sert pas — c'est `LauraDock` qui décide de la montrer ou non — mais le
  // champ est requis par le contrat du magasin.
  return {
    id: 'intro-1',
    question: 'Prépare une reprise avec ACME.',
    label: 'Demander à Laura',
    scopeDepth: 0,
    ...overrides,
  }
}

describe('LauraIntroBar', () => {
  it('affiche la phrase pré-remplie, telle quelle', () => {
    render(<LauraIntroBar intro={intro()} onSend={vi.fn()} />)
    expect(screen.getByText('Prépare une reprise avec ACME.')).toBeInTheDocument()
  })

  it('porte un VRAI bouton « Envoyer », tabulable', () => {
    render(<LauraIntroBar intro={intro()} onSend={vi.fn()} />)
    const button = screen.getByRole('button', { name: /envoyer/i })
    expect(button).toHaveAttribute('type', 'button')
  })

  it('le clic sur « Envoyer » appelle `onSend` — et RIEN d’autre : le composant ne connaît aucune API', () => {
    const onSend = vi.fn()
    render(<LauraIntroBar intro={intro()} onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('atteignable au clavier : Entrée sur le bouton focus appelle `onSend`, comme un clic', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<LauraIntroBar intro={intro()} onSend={onSend} />)
    await user.tab()
    expect(screen.getByRole('button', { name: /envoyer/i })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('le nom accessible du bouton reste son texte VISIBLE, pas `intro.label`', () => {
    // WCAG 2.5.3 : un nom accessible qui ne contient pas le texte affiché
    // piège la commande vocale. `intro.label` est une phrase longue, propre à
    // chaque écran — jamais ce que porte CE bouton.
    render(
      <LauraIntroBar intro={intro({ label: 'Demander à Laura de prioriser mes renouvellements' })} onSend={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /prioriser mes renouvellements/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^envoyer$/i })).toBeInTheDocument()
  })

  it('s’annonce comme un statut — une amorce qui apparaît est une suggestion, pas une alerte', () => {
    render(<LauraIntroBar intro={intro()} onSend={vi.fn()} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
