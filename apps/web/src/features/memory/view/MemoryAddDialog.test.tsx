import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const mutate = vi.fn()
const trackMemoryAdded = vi.fn()
vi.mock('../hooks/usePinFact', () => ({ usePinFact: () => ({ mutate, isPending: false }) }))
vi.mock('@/lib/product-tracker', () => ({ trackMemoryAdded: (...a: unknown[]) => trackMemoryAdded(...a) }))

const { MemoryAddDialog } = await import('./MemoryAddDialog')

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  mutate.mockReset()
  trackMemoryAdded.mockReset()
})

/**
 * Théo D settings-laura.N3 — « Ajouter un élément » à sa mémoire, à la main : une préférence PERSONNELLE durable, ou
 * un contexte temporaire quand une date « à revérifier » est donnée. Le geste réutilise l'épinglage existant.
 */
describe('MemoryAddDialog', () => {
  it('NON : tant que rien n’est écrit, « Enregistrer » est inactif', () => {
    render(<MemoryAddDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it('enregistre une préférence personnelle, à la main, sans échéance', async () => {
    render(<MemoryAddDialog open onOpenChange={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Ce que je veux retenir'), '  Priorité aux industriels  ')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const [input] = mutate.mock.calls[0] as [Record<string, unknown>]
    expect(input).toMatchObject({
      fact: 'Priorité aux industriels',
      kind: 'preference',
      origin: 'manual',
      scope: 'user',
    })
    expect(input).not.toHaveProperty('expiresAt')
  })

  it('avec une date « à revérifier », c’est un contexte temporaire qui expire ce jour-là', async () => {
    render(<MemoryAddDialog open onOpenChange={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Ce que je veux retenir'), 'Migration reportée à 2027')
    await userEvent.type(screen.getByLabelText('À revérifier le (facultatif)'), '2027-01-15')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const [input] = mutate.mock.calls[0] as [Record<string, unknown>]
    expect(input).toMatchObject({ kind: 'temporary_context' })
    expect(new Date(String(input['expiresAt'])).getFullYear()).toBe(2027)
  })

  it('au succès, la mémoire ajoutée est comptée pour CET écran et le dialogue se ferme', async () => {
    const onOpenChange = vi.fn()
    mutate.mockImplementation((_input: unknown, options: { onSuccess: () => void }) => options.onSuccess())
    render(<MemoryAddDialog open onOpenChange={onOpenChange} />)
    await userEvent.type(screen.getByLabelText('Ce que je veux retenir'), 'Un fait')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(trackMemoryAdded).toHaveBeenCalledWith('/settings/memory')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('dit que l’ajout ne change ni le métier ni les faits d’un compte', () => {
    render(<MemoryAddDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByText(/Une actualité n’est pas transformée en besoin confirmé/)).toBeInTheDocument()
  })
})
