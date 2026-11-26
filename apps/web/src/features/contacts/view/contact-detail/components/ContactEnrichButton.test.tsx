import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact } from '@bellum/contracts'
import { CREDIT_WEIGHTS } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactEnrichButton } from './ContactEnrichButton'

/**
 * #2988 (recette écran 28/09/2026) — RENVERSEMENT ASSUMÉ ET DATÉ de la partie
 * « le clic débite directement » de #3021 (25/09/2026, « sur le bouton
 * enrichir mettre 1 crédit et enlever la modale intermédiaire »). La recette
 * a montré qu'un crédit partait sans jamais proposer le choix Email +
 * téléphone / Email seul / Téléphone seul que #2988.1 a posé côté pipeline
 * serveur (`only`, 25/09) — même sélecteur que `ContactContent.tsx` (GA-26,
 * même composant `EnrichConfirmDialog`).
 *
 * Ce qui NE change PAS de #3021 : le prix reste annoncé SUR le bouton
 * (`CREDIT_WEIGHTS`, jamais codé en dur), et un contact à identité
 * INCOMPLÈTE édite toujours son nom EN LIGNE, à côté du bouton — sans rôle ni
 * nom saisi, le bouton reste désactivé (aucune ancre de recherche).
 */
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({ useEnrichContact: vi.fn() }))
vi.mock('@/features/contacts/hooks/useResumeEnrichment', () => ({ useResumeEnrichment: vi.fn() }))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate: vi.fn() }))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const mutate = vi.fn()

const completeContact = {
  id: 'c-1',
  account_id: 'acc-1',
  full_name: 'Alice Martin',
  title: 'DSI',
  entity: 'ACME',
  decision_role: 'technical',
  email: null,
  phone: null,
  linkedin_url: null,
} as unknown as Contact

/** Un seul jeton de nom (persona-rôle) : `isContactIdentityComplete` refuse. */
const incompleteContact = { ...completeContact, id: 'c-2', full_name: 'Isabelle' } as unknown as Contact

describe('ContactEnrichButton — #2988 : la portée se choisit avant le débit', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockClear()
    vi.mocked(useEnrichContact).mockReturnValue({
      mutate,
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useEnrichContact>)
    vi.mocked(useCreditGate).mockReturnValue({
      known: true,
      canAnalyze: true,
      canEnrich: true,
      locked: false,
    })
  })

  it('#4463 — le bouton ne porte aucun coût : le libellé seul', async () => {
    renderWithRouter(<ContactEnrichButton contact={completeContact} />)
    const bouton = await screen.findByRole('button', { name: /^Enrichir$/ })
    expect(bouton).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('#4365.1 — le bouton actif DIT ce que fait « Enrichir » (infobulle)', async () => {
    renderWithRouter(<ContactEnrichButton contact={completeContact} />)
    const bouton = await screen.findByRole('button', { name: /^Enrichir$/ })
    expect(bouton.getAttribute('title')).toMatch(/e-mail.*téléphone|téléphone.*e-mail/i)
  })

  it('identité complète : le clic PROPOSE la portée avant de débiter, aucun débit avant confirmation', async () => {
    renderWithRouter(<ContactEnrichButton contact={completeContact} />)
    await user().click(await screen.findByRole('button', { name: /enrichir/i }))

    expect(mutate).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Email seulement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Téléphone seulement' })).toBeInTheDocument()

    await user().click(screen.getByRole('button', { name: /^Enrichir$/ }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ contact: completeContact }))
    expect(mutate.mock.calls[0]?.[0]).not.toHaveProperty('only')
  })

  it('« Email seulement » choisi dans la confirmation atteint la mutation via `only`', async () => {
    renderWithRouter(<ContactEnrichButton contact={completeContact} />)
    await user().click(await screen.findByRole('button', { name: /enrichir/i }))
    await user().click(await screen.findByRole('button', { name: 'Email seulement' }))
    await user().click(screen.getByRole('button', { name: /^Enrichir$/ }))

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ contact: completeContact, only: 'email' }))
  })

  it('un enrichissement annulé ne débite rien, et un second clic repart de « les deux »', async () => {
    renderWithRouter(<ContactEnrichButton contact={completeContact} />)
    await user().click(await screen.findByRole('button', { name: /enrichir/i }))
    await user().click(await screen.findByRole('button', { name: 'Téléphone seulement' }))
    await user().click(screen.getByRole('button', { name: 'Annuler' }))
    expect(mutate).not.toHaveBeenCalled()

    await user().click(await screen.findByRole('button', { name: /enrichir/i }))
    await user().click(screen.getByRole('button', { name: /^Enrichir$/ }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0]).not.toHaveProperty('only')
  })

  it('identité incomplète avec rôle : le clic ouvre la confirmation (une ancre de recherche existe déjà)', async () => {
    // `incompleteContact` garde `title: 'DSI'` → une ancre de recherche existe
    // déjà, le bouton n'est donc PAS désactivé.
    renderWithRouter(<ContactEnrichButton contact={incompleteContact} />)
    const button = await screen.findByRole('button', { name: /enrichir/i })
    expect(button).toBeEnabled()
    await user().click(button)
    expect(mutate).not.toHaveBeenCalled()
    await user().click(await screen.findByRole('button', { name: /^Enrichir$/ }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ contact: incompleteContact }))
  })

  // #4504.2 (contrat Louis 24/10) — RENVERSEMENT de l'« en ligne » de #3021 : le champ du nom vit DANS la modale
  // qu'ouvre « Enrichir » ; c'est la CONFIRMATION qui attend le nom, plus le bouton.
  it('identité incomplète SANS rôle : la modale explique et porte le nom ; « Enrichir » y attend un nom saisi', async () => {
    // `entity` reste renseigné (ACME) pour ne pas déclencher le repli compte —
    // seul `title` (le rôle affiché) est vidé : c'est lui, et lui seul, que
    // la recherche par rôle lit (voir `canSearchByRole`).
    const noAnchorContact = { ...incompleteContact, id: 'c-3', title: null, linkedin_url: null }
    renderWithRouter(<ContactEnrichButton contact={noAnchorContact} />)
    const button = await screen.findByRole('button', { name: /enrichir/i })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(button).toBeEnabled()
    await user().click(button)

    const confirm = await screen.findByRole('button', { name: /^Enrichir$/ })
    expect(confirm).toBeDisabled()
    await user().type(screen.getByRole('textbox', { name: /nom complet/i }), 'Marie-Claire Durand')
    expect(confirm).toBeEnabled()
    await user().click(confirm)
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ contact: noAnchorContact, fullNameOverride: 'Marie-Claire Durand' }),
    )
  })

  it('un label personnalisé (onglet vide) ne porte aucun coût (#4463)', async () => {
    renderWithRouter(<ContactEnrichButton contact={completeContact} label="Enrichir le contact" />)
    const button = await screen.findByRole('button', { name: /enrichir le contact/i })
    expect(button).not.toHaveTextContent(/cr[ée]dit/i)
  })
})
