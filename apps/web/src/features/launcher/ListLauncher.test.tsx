import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { CompanySuggestion } from '@bellum/contracts'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ListLauncher } from './ListLauncher'

/**
 * Le geste de lancement d'une analyse EN PLACE.
 *
 * ⚠️ #4497 (PR 12C, maquette V22) — « Analyser une entreprise » a quitté la barre d'outils de `/accounts` :
 * le geste de la page est « Analyser un compte », en haut (en-tête de la coque, vers `/search`). Ces tests
 * montent donc la primitive seule ; qu'elle n'ait plus d'appelant est noté au rapport du lot.
 */

const TF1: CompanySuggestion = {
  name: 'TF1',
  siren: '326300159',
  city: 'Boulogne-Billancourt',
  sector: 'Média',
}

const h = vi.hoisted(() => ({
  startAnalysis: vi.fn(),
  suggestions: [] as unknown[],
  credits: null as unknown,
}))

vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    status: 'idle',
    phase: '',
    percent: null,
    accountId: null,
    error: null,
    startAnalysis: h.startAnalysis,
    reset: vi.fn(),
  }),
}))

vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => ({
    suggestions: h.suggestions,
    broadenedFrom: undefined,
    sourceUnavailable: false,
    loading: false,
    search: vi.fn(),
    clearSuggestions: vi.fn(),
  }),
}))

// Les DEUX vues du solde (`features/billing` et `useCreditGate`) dérivent de ce
// seul hook : le mocker ici couvre la note de coût ET le verrou du bouton.
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: h.credits, isLoading: false, isError: false }),
}))

function renderToolbar() {
  return renderWithRouter(<ListLauncher typeKey="account" />)
}

async function openDialog() {
  renderToolbar()
  const button = await screen.findByRole('button', { name: 'Analyser une entreprise' })
  fireEvent.click(button)
  return button
}

beforeAll(() => {
  window.scrollTo = vi.fn()
})

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  h.startAnalysis.mockClear()
  h.suggestions = []
  h.credits = { plan: 'growth', accounts_used: 0, accounts_limit: 250, credits_remaining: 42, credits_limit: 250 }
})

describe('ListLauncher — le geste est atteignable depuis /accounts', () => {
  it('pose un bouton de lancement dans la barre d’outils des comptes', async () => {
    renderToolbar()

    // Le nom vient du CATALOGUE (`run.accountAnalysis`), pas d'une chaîne
    // écrite dans la barre : renommer le run renomme le bouton.
    expect(await screen.findByRole('button', { name: 'Analyser une entreprise' })).toBeInTheDocument()
  })

  it('ouvre le lancement SANS quitter la page', async () => {
    await openDialog()

    // Le champ d'entreprise est là, dans un dialogue — donc toujours sur
    // /accounts. C'est ce que « plus direct » voulait dire.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Entreprise à analyser')).toBeInTheDocument()
  })
})

describe('ListLauncher — aucun crédit à l’écran avant le clic (#4463)', () => {
  it('ne chiffre NI le coût (10, prix d’Approfondie), NI le solde restant (42)', async () => {
    await openDialog()

    // Le dialogue est bien ouvert, mais sans « N crédits seront consommés » ni solde (renverse Louis 10/10).
    const dialog = await screen.findByRole('dialog')
    expect(dialog).not.toHaveTextContent(/crédit|restants|consommés/i)
    expect(screen.queryByText("Rien n'est débité avant ta confirmation.")).not.toBeInTheDocument()
  })

  it('solde illisible : le doute n’interdit pas et rien ne se dit du solde', async () => {
    h.credits = null
    await openDialog()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).not.toHaveTextContent(/crédit|restants/i)
    // Et le doute n'interdit pas : aucune raison de blocage n'est affichée.
    expect(screen.queryByText(/beaucoup utilisé/)).not.toBeInTheDocument()
  })

  it('dit POURQUOI le lancement est fermé quand le solde est à zéro — frein doux, SANS chiffre (#4463)', async () => {
    h.credits = { plan: 'growth', accounts_used: 250, accounts_limit: 250, credits_remaining: 0, credits_limit: 250 }
    h.suggestions = [TF1]
    await openDialog()

    const brake = await screen.findByText(/Tu as beaucoup utilisé .* ce mois-ci/)
    expect(brake).toBeInTheDocument()
    expect(brake.textContent).not.toMatch(/crédit|\d/i)
    fireEvent.change(await screen.findByLabelText('Entreprise à analyser'), { target: { value: 'TF1' } })
    fireEvent.click(await screen.findByText('TF1'))
    // Même une entreprise identifiée ne débloque pas un solde vide : le refus
    // se dit ICI, pas en 409 après le clic.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled())
  })
})

describe('ListLauncher — l’homonymie ne se saute pas', () => {
  it('laisse le lancement INACTIF tant qu’aucune société n’est identifiée', async () => {
    h.suggestions = [TF1]
    await openDialog()

    const field = await screen.findByLabelText('Entreprise à analyser')
    fireEvent.change(field, { target: { value: 'TF1' } })

    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled()
    expect(screen.getByText(/Bellum n'analyse que des sociétés qu'il a identifiées/)).toBeInTheDocument()
    expect(h.startAnalysis).not.toHaveBeenCalled()
  })

  it('ancre le run sur le SIREN de la société CHOISIE', async () => {
    h.suggestions = [TF1]
    await openDialog()

    const field = await screen.findByLabelText('Entreprise à analyser')
    fireEvent.change(field, { target: { value: 'TF1' } })
    fireEvent.click(await screen.findByText('TF1'))

    const confirm = await screen.findByRole('button', { name: 'Analyser' })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)

    // Le SIREN part avec le run : c'est lui qui empêche le serveur de
    // re-résoudre le nom et de tomber sur un homonyme.
    expect(h.startAnalysis).toHaveBeenCalledWith('TF1', undefined, '326300159', 'groupe', undefined, 'FR')
  })

  it('relâche le verrou dès que le nom est ré-édité', async () => {
    h.suggestions = [TF1]
    await openDialog()

    const field = await screen.findByLabelText('Entreprise à analyser')
    fireEvent.change(field, { target: { value: 'TF1' } })
    fireEvent.click(await screen.findByText('TF1'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analyser' })).toBeEnabled())

    // Retaper autre chose : on ne cible plus cette société, donc on ne peut
    // plus lancer — garder le SIREN ferait partir le run sur TF1.
    fireEvent.change(field, { target: { value: 'TF1 PUBLICITE' } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled())
  })
})
