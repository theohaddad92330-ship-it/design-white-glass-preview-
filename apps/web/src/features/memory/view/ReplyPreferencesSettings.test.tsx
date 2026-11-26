import type React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReplyPreferences } from '@bellum/contracts'

const mutate = vi.fn()
let data: ReplyPreferences | undefined = {}
let isLoading = false
let isError = false

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/memory/hooks/useReplyPreferences', () => ({
  useReplyPreferences: () => ({ data, isLoading, isError }),
  useSetReplyPreference: () => ({ mutate, isPending: false }),
}))

const { ReplyPreferencesSettings } = await import('./ReplyPreferencesSettings')

/**
 * #1928.9 — la façon dont Laura répond se règle, se change et s'efface, là où
 * vit déjà sa mémoire. Et la nuance du dépôt : un réglage qu'on n'a pas pu LIRE
 * n'est pas un réglage « par défaut ».
 */
describe('ReplyPreferencesSettings — comment Laura te répond', () => {
  beforeEach(() => {
    mutate.mockReset()
    data = {}
    isLoading = false
    isError = false
  })

  it('nomme les quatre réglages, chacun avec des boutons nommés', () => {
    render(<ReplyPreferencesSettings />)
    for (const group of ['Longueur des réponses', 'Ton', 'Format préféré', 'Explication des sources']) {
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Courtes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pédagogique' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Listes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Minimale' })).toBeInTheDocument()
  })

  it('ne propose pas « Tableaux » : le chat ne sait pas encore les afficher', () => {
    render(<ReplyPreferencesSettings />)
    expect(screen.queryByRole('button', { name: /Tableaux/ })).not.toBeInTheDocument()
  })

  it('sans réglage, « Par défaut » est la valeur active de chaque groupe', () => {
    render(<ReplyPreferencesSettings />)
    const defaults = screen.getAllByRole('button', { name: 'Par défaut' })
    expect(defaults).toHaveLength(4)
    for (const button of defaults) expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('pose un réglage au clic', () => {
    render(<ReplyPreferencesSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Courtes' }))
    expect(mutate).toHaveBeenCalledWith({ key: 'replyLength', value: 'short' })
  })

  it('montre le réglage posé, et l’efface en revenant à « Par défaut »', () => {
    data = { replyLength: 'short' }
    render(<ReplyPreferencesSettings />)
    expect(screen.getByRole('button', { name: 'Courtes' })).toHaveAttribute('aria-pressed', 'true')

    const lengthGroup = screen.getByRole('group', { name: 'Longueur des réponses' })
    const reset = Array.from(lengthGroup.querySelectorAll('button')).find(b => b.textContent === 'Par défaut')
    expect(reset).toBeDefined()
    fireEvent.click(reset!)
    expect(mutate).toHaveBeenCalledWith({ key: 'replyLength', value: null })
  })

  it('un second clic sur la valeur active ne réécrit rien', () => {
    data = { replyTone: 'direct' }
    render(<ReplyPreferencesSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Direct' }))
    expect(mutate).not.toHaveBeenCalled()
  })

  it('une lecture ÉCHOUÉE ne se déguise pas en « Par défaut »', () => {
    data = undefined
    isError = true
    render(<ReplyPreferencesSettings />)
    expect(screen.getByText(/n'ont pas pu être lus/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Par défaut' })).not.toBeInTheDocument()
  })

  it('renvoie la LANGUE à son seul réglage, celui de l’interface', () => {
    render(<ReplyPreferencesSettings />)
    expect(screen.getByText(/dans la langue de l'interface/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Changer la langue' })).toHaveAttribute('href', '/settings')
    // Aucun sélecteur de langue ici : un réglage vit à un seul endroit (GA-26).
    expect(screen.queryByRole('group', { name: /Langue/ })).not.toBeInTheDocument()
  })
})
