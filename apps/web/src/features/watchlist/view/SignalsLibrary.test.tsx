import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import watchlistFr from '@/i18n/locales/fr/watchlist.json'

/**
 * Refonte Théo (23/10) — a/signaux.html : en-tête « Veille commerciale / Signaux », onglets Tous · Enregistrés ·
 * Écartés · Corbeille, barre d'outils, grille de cartes. Ce fichier sait dire NON sur la structure, sur le nom
 * d'une source (jamais sur la carte) et sur la fenêtre « En faire une action » (déjà rédigée).
 */
const mutate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))
vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('../actions/useSignalAction', () => ({ useCreateSignalAction: () => ({ mutate, isPending: false }) }))
vi.mock('./AddSignalDialog', () => ({ AddSignalDialog: () => null }))

const today = new Date().toISOString().slice(0, 10)
const signal = (over: Partial<AccountSignalItem>): AccountSignalItem => ({
  id: 's',
  account_id: '11111111-1111-4111-8111-111111111111',
  account_created_at: today,
  account_score: 8,
  company_name: 'Nordia',
  date: today,
  label: 'Programme data',
  sector: 'Services',
  source: 'Les Échos',
  type: 'Recrutement',
  ...over,
})
const signals = vi.hoisted(() => ({ data: [] as AccountSignalItem[] }))
vi.mock('@/features/accounts/hooks/useAccountSignals', () => ({
  useAccountSignals: () => ({ data: signals.data, isLoading: false, isError: false }),
}))

const { SignalsLibrary } = await import('./SignalsLibrary')
const lib = watchlistFr.library

function mount() {
  return render(<SignalsLibrary view="list" onViewChange={() => {}} byAccount={null} />)
}

describe('Signaux — la bibliothèque (refonte Théo)', () => {
  it('en-tête, onglets dans l’ordre de la maquette, et une carte par signal', () => {
    signals.data = [
      signal({ id: 'a', label: 'Deux postes SAP à pourvoir' }),
      signal({ id: 'b', label: 'Trois architectes cloud recherchés' }),
    ]
    mount()
    expect(screen.getByRole('heading', { level: 1, name: lib.title })).toBeInTheDocument()
    expect(screen.getByText(lib.eyebrow)).toBeInTheDocument()
    const tabs = within(screen.getByRole('tablist', { name: lib.tabsAria }))
      .getAllByRole('tab')
      .map(tab => tab.textContent?.replace(/\d+$/, '').trim())
    expect(tabs).toEqual([lib.tabs.all, lib.tabs.saved, lib.tabs.dismissed, lib.tabs.trash])
    expect(screen.getAllByTestId('signal-card')).toHaveLength(2)
  })

  it('SAIT DIRE NON — la carte ne nomme jamais la source (« Les Échos »)', () => {
    signals.data = [signal({ id: 'a', source: 'Les Échos' })]
    mount()
    expect(screen.getByTestId('signal-card')).not.toHaveTextContent('Les Échos')
  })

  it('#4403.1 — un poste que nulle ESN ne place est marqué « hors métier » et passe après le poste IT, sans être retiré', () => {
    signals.data = [
      signal({ id: 'a', company_name: 'Darty', label: 'CDD Hôte de vente H/F' }),
      signal({ id: 'b', company_name: 'Sopra', label: 'Développeur Java H/F' }),
    ]
    mount()
    const cards = screen.getAllByTestId('signal-card')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]!).queryByTestId('signal-card-out-of-trade')).toBeNull()
    expect(within(cards[1]!).getByTestId('signal-card-out-of-trade')).toBeInTheDocument()
  })

  it('« En faire une action » ouvre la fenêtre DÉJÀ rédigée, et « Ajouter au plan » crée l’action', () => {
    signals.data = [signal({ id: 'a', label: 'Deux postes SAP à pourvoir' })]
    mount()
    fireEvent.click(screen.getByRole('button', { name: lib.makeAction }))
    const dialog = screen.getByRole('dialog', { name: lib.actionDialog.title })
    expect(within(dialog).getByRole('textbox', { name: lib.actionDialog.label })).toHaveValue(
      'Deux postes SAP à pourvoir',
    )
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: lib.actionDialog.submit }))
    expect(mutate).toHaveBeenCalledWith(
      { accountId: '11111111-1111-4111-8111-111111111111', label: 'Deux postes SAP à pourvoir' },
      expect.anything(),
    )
  })

  it('aucune offre de stage dans « Tous » : elle vit dans « Écartés »', () => {
    signals.data = [signal({ id: 'a', type: 'Recrutement', label: 'Offre de stage en data' })]
    mount()
    expect(screen.queryAllByTestId('signal-card')).toHaveLength(0)
  })
})
