import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactStop } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useContactStop, useRecordContactStop } from '@/features/contacts/hooks/useContactStop'
import { ContactStopCard } from './ContactStopCard'

vi.mock('@/features/contacts/hooks/useContactStop', () => ({
  useContactStop: vi.fn(),
  useRecordContactStop: vi.fn(),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const mutate = vi.fn()

function setStop(stop: ContactStop | null) {
  vi.mocked(useContactStop).mockReturnValue({
    data: stop,
    isLoading: false,
  } as unknown as ReturnType<typeof useContactStop>)
}

describe('ContactStopCard — un refus s’enregistre, et ne se retire pas d’ici', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockClear()
    vi.mocked(useRecordContactStop).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useRecordContactStop>)
  })

  it('montre le refus DATÉ, et n’offre aucun geste pour le lever (D351)', () => {
    setStop({ reason: 'do_not_call', since: '2026-08-14T09:00:00.000Z', motion: null })
    render(<ContactStopCard contactId="c-1" />)

    expect(screen.getByText('Cette personne a demandé qu’on cesse')).toBeInTheDocument()
    // La RAISON est nommée, pas réduite à un booléen.
    expect(screen.getByText(/Ne plus être contacté/)).toBeInTheDocument()
    // La DATE est là : un refus est un fait daté.
    expect(screen.getByText(/14\/08\/2026|14 août 2026/)).toBeInTheDocument()

    // ⚠️ Le cœur de ce test : aucune levée. Il n'existe pas de route pour
    // retirer un refus, et un bouton qui le promettrait mentirait.
    for (const button of screen.queryAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/lever|retirer|réintégrer|annuler le refus/i)
    }
  })

  it('#3702 — la rangée raison + bouton passe à la ligne au lieu de couper le bouton (cible ≥ 44 px)', () => {
    setStop(null)
    render(<ContactStopCard contactId="c-1" />)

    const button = screen.getByRole('button', { name: 'Enregistrer le refus' })
    // Mesuré en prod le 10/10 : « Enregistrer le refus » coupé à droite de la carte.
    expect(button.parentElement?.className).toMatch(/\bflex-wrap\b/)
    expect(button.className).toMatch(/\bmin-h-11\b/)
    expect(screen.getByRole('combobox', { name: 'Raison du refus' }).className).toMatch(/\bmin-w-0\b/)
  })

  it('reste inerte tant qu’aucune raison n’est choisie', () => {
    setStop(null)
    render(<ContactStopCard contactId="c-1" />)

    expect(screen.getByRole('button', { name: 'Enregistrer le refus' })).toBeDisabled()
  })

  it('demande une confirmation AVANT d’enregistrer, puis envoie la raison choisie', async () => {
    setStop(null)
    render(<ContactStopCard contactId="c-1" />)

    await user().click(screen.getByRole('combobox', { name: 'Raison du refus' }))
    await user().click(await screen.findByRole('option', { name: 'Ne plus être contacté' }))

    await user().click(screen.getByRole('button', { name: 'Enregistrer le refus' }))
    // Le clic n'écrit RIEN : le geste est irréversible, la conséquence est
    // annoncée avant, pas après.
    expect(mutate).not.toHaveBeenCalled()
    expect(await screen.findByText(/ne se retire pas depuis Bellum/)).toBeInTheDocument()

    await user().click(screen.getByRole('button', { name: 'Confirmer le refus' }))
    expect(mutate).toHaveBeenCalledWith({ reason: 'do_not_call' })
  })
})
