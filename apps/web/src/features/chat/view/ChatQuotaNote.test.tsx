import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const fetchChatQuotaMock = vi.hoisted(() => vi.fn())
vi.mock('../api/chat-quota', () => ({ fetchChatQuota: () => fetchChatQuotaMock() }))

import { ChatQuotaNote } from './ChatQuotaNote'

/**
 * #1957.5 — « Il te reste peu de demandes Laura » : dit AVANT le mur, discret,
 * et JAMAIS quand on ne sait pas. Le seuil n'est pas ici : le serveur rend `low`
 * (une seule dérivation, `isChatQuotaLow`).
 */
describe('#1957.5 — la note d’approche du plafond', () => {
  beforeEach(() => {
    fetchChatQuotaMock.mockReset()
  })

  it('prévient quand il reste peu de demandes, et rassure sur les actions préparées', async () => {
    fetchChatQuotaMock.mockResolvedValue({ state: 'measured', limit: 50, remaining: 4, low: true, reopensAt: null })

    render(<ChatQuotaNote refreshKey={false} />)

    const note = await screen.findByRole('status')
    expect(note).toHaveTextContent('Il te reste 4 demandes à Laura')
    expect(note).toHaveTextContent('actions déjà préparées restent accessibles')
  })

  it('se tait tant qu’il en reste assez', async () => {
    fetchChatQuotaMock.mockResolvedValue({ state: 'measured', limit: 50, remaining: 30, low: false, reopensAt: null })

    const { container } = render(<ChatQuotaNote refreshKey={false} />)

    await waitFor(() => expect(fetchChatQuotaMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('au plafond : dit quand il se rouvre, sans attendre un refus', async () => {
    const reopensAt = new Date(Date.now() + 2 * 3600_000)
    fetchChatQuotaMock.mockResolvedValue({
      state: 'measured',
      limit: 50,
      remaining: 0,
      low: true,
      reopensAt: reopensAt.toISOString(),
    })

    render(<ChatQuotaNote refreshKey={false} />)

    const note = await screen.findByRole('status')
    expect(note).toHaveTextContent('Plus aucune demande à Laura')
    expect(note).toHaveTextContent(/Il se rouvre (demain )?vers \d{2}:\d{2}\./)
  })

  it.each([
    ['non mesuré', { state: 'unmeasured' }],
    ['sans borne (démonstration, plafond désactivé)', { state: 'unbounded' }],
    ['réponse illisible ou en échec', null],
  ])('%s : rien — jamais « 0 restant »', async (_label, status) => {
    fetchChatQuotaMock.mockResolvedValue(status)

    const { container } = render(<ChatQuotaNote refreshKey={false} />)

    await waitFor(() => expect(fetchChatQuotaMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(container.textContent ?? '').not.toMatch(/\b0\b/)
  })

  // décision Louis 13/09 batch 13 — plafond selon le plan
  describe('le plafond du plan est affiché', () => {
    const initialLanguage = i18n.language

    afterEach(async () => {
      await i18n.changeLanguage(initialLanguage)
    })

    it('en français : ce qui reste, et ce que le plan prévoit', async () => {
      await i18n.changeLanguage('fr')
      fetchChatQuotaMock.mockResolvedValue({
        state: 'measured',
        limit: 50,
        remaining: 4,
        low: true,
        reopensAt: null,
        limitSource: 'plan',
      })

      render(<ChatQuotaNote refreshKey={false} />)

      const note = await screen.findByRole('status')
      expect(note).toHaveTextContent('Il te reste 4 demandes à Laura')
      expect(note).toHaveTextContent('ton plan en prévoit 50')
      expect(note).toHaveTextContent('actions déjà préparées restent accessibles')
    })

    it('en anglais aussi', async () => {
      await i18n.changeLanguage('en')
      fetchChatQuotaMock.mockResolvedValue({
        state: 'measured',
        limit: 50,
        remaining: 4,
        low: true,
        reopensAt: null,
        limitSource: 'plan',
      })

      render(<ChatQuotaNote refreshKey={false} />)

      const note = await screen.findByRole('status')
      expect(note).toHaveTextContent('You have 4 requests to Laura left')
      expect(note).toHaveTextContent('your plan includes 50')
    })

    it('au plafond du plan : le plafond, puis quand il se rouvre', async () => {
      await i18n.changeLanguage('fr')
      fetchChatQuotaMock.mockResolvedValue({
        state: 'measured',
        limit: 50,
        remaining: 0,
        low: true,
        reopensAt: null,
        limitSource: 'plan',
      })

      render(<ChatQuotaNote refreshKey={false} />)

      const note = await screen.findByRole('status')
      expect(note).toHaveTextContent('Plus aucune demande à Laura')
      expect(note).toHaveTextContent('ton plan en prévoit 50')
      expect(note).toHaveTextContent('au fil des heures')
    })

    it.each([
      ['plafond de sécurité de l’opérateur', 'operator'],
      ['API d’avant, sans la source', undefined],
    ])('%s : ne prétend rien sur le plan', async (_label, limitSource) => {
      await i18n.changeLanguage('fr')
      fetchChatQuotaMock.mockResolvedValue({
        state: 'measured',
        limit: 50,
        remaining: 4,
        low: true,
        reopensAt: null,
        limitSource,
      })

      render(<ChatQuotaNote refreshKey={false} />)

      const note = await screen.findByRole('status')
      expect(note).toHaveTextContent('Il te reste 4 demandes à Laura')
      expect(note.textContent ?? '').not.toMatch(/\bplan\b/)
    })
  })

  it('relit le compte à la FIN de chaque envoi, jamais pendant', async () => {
    fetchChatQuotaMock.mockResolvedValue({ state: 'measured', limit: 50, remaining: 30, low: false, reopensAt: null })

    const { rerender } = render(<ChatQuotaNote refreshKey={false} />)
    await waitFor(() => expect(fetchChatQuotaMock).toHaveBeenCalledTimes(1))

    rerender(<ChatQuotaNote refreshKey={true} />)
    expect(fetchChatQuotaMock).toHaveBeenCalledTimes(1)

    rerender(<ChatQuotaNote refreshKey={false} />)
    await waitFor(() => expect(fetchChatQuotaMock).toHaveBeenCalledTimes(2))
  })
})
