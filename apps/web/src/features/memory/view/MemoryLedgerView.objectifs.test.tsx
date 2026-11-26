import type React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryLedger, MemoryLedgerEntry } from '@bellum/contracts'

let ledger: MemoryLedger | null = { entries: [], unreadableLayers: [] }

// #1928.9 — les réglages de réponse ouvrent la section « Préférences
// personnelles » et portent leur propre réseau (`useReplyPreferences` → React
// Query → session). Ils ont leur suite (`ReplyPreferencesSettings.test.tsx`) ;
// ici un témoin nul, pour que CE fichier garde ce qu'il vise.
// #1918.2 / #1918.5 — les portées PROPOSABLES sont lues par l'API (les
// périmètres que la personne porte) : ces suites montent le composant sans
// fournisseur, et le défaut rendu ici est celui du contrat sans contexte —
// les deux portées durables, exactement ce que l'écran offrait avant ce lot.
// #4060 — l'approche des messages porte son propre réseau (session) : témoin nul, comme ReplyPreferencesSettings.
vi.mock('@/features/memory/view/MessageApproachSettings', () => ({ MessageApproachSettings: () => null }))
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', () => ({
  useMemoryScopeOptions: () => [{ scope: 'user' }, { scope: 'workspace' }],
}))
vi.mock('@/features/memory/view/ReplyPreferencesSettings', () => ({ ReplyPreferencesSettings: () => null }))
// #2867 (LOT c10 clôture 26/09) — le temps protégé porte, lui aussi, son propre réseau (`useProtectedTime` → session) : même témoin nul, pour la même raison que `ReplyPreferencesSettings` juste au-dessus.
vi.mock('@/features/memory/view/ProtectedTimeSettings', () => ({ ProtectedTimeSettings: () => null }))
vi.mock('@/features/memory/view/AgendaPreferencesSettings', () => ({ AgendaPreferencesSettings: () => null }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/memory/hooks/useMemoryLedger', () => ({
  useMemoryLedger: () => ({ data: ledger, isLoading: false, isError: false }),
  useForgetMemoryEntry: () => ({ mutate: vi.fn(), isPending: false }),
  useForgetAllMemory: () => ({ mutate: vi.fn(), isPending: false }),
  useSetFactScope: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateFact: () => ({ mutate: vi.fn(), isPending: false }),
  useFactHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))

// Le questionnaire de profil lit l'état d'onboarding et le CRM : on le double,
// et on compte ses montages — il ne doit exister qu'une fois ouvert.
const dialogMounts = vi.fn()
vi.mock('@/features/onboarding/components/ProfileQuestionnaireDialog', () => ({
  ProfileQuestionnaireDialog: ({ open }: { open: boolean }) => {
    dialogMounts()
    return open ? <div role="dialog" aria-label="Questionnaire de profil" /> : null
  },
}))

const { MemoryLedgerView } = await import('./MemoryLedgerView')

function declared(key: string, text: string): MemoryLedgerEntry {
  return {
    id: key,
    layer: 'identity',
    text,
    recordedAt: '2026-09-01T09:00:00.000Z',
    accountId: null,
    detail: key,
    expiresAt: null,
  }
}

function section(title: string): HTMLElement {
  const element = screen.getByText(title).closest('section')
  if (!element) throw new Error(`aucune section « ${title} »`)
  return element
}

/**
 * Q2 (13/09) — l'objectif et la cible mensuelle DÉCLARÉS quittent « Ce que Laura
 * sait de toi » pour « Objectifs personnels », avec le geste qui les CORRIGE là
 * où ils se règlent : le questionnaire de profil. Un réglage vit à un seul
 * endroit — la ligne ne s'affiche qu'une fois, et ne s'oublie pas.
 */
describe('MemoryLedgerView — les objectifs déclarés vivent dans « Objectifs personnels »', () => {
  beforeEach(() => {
    dialogMounts.mockReset()
    ledger = {
      entries: [
        declared('firstName', 'Louis'),
        declared('sellerRole', 'Directeur commercial'),
        declared('sellerGoal', 'Signer trois nouveaux comptes'),
        declared('monthlyTarget', '40 k€ de marge'),
      ],
      unreadableLayers: [],
    }
  })

  it('montre l’objectif et la cible dans « Objectifs personnels », et une seule fois', () => {
    render(<MemoryLedgerView />)
    const objectives = within(section('Objectifs personnels'))
    expect(objectives.getByText('Signer trois nouveaux comptes')).toBeInTheDocument()
    expect(objectives.getByText('40 k€ de marge')).toBeInTheDocument()
    expect(objectives.getByText('Ton objectif')).toBeInTheDocument()
    expect(screen.getAllByText('Signer trois nouveaux comptes')).toHaveLength(1)
    expect(objectives.queryByText('Aucun objectif personnel retenu.')).toBeNull()
  })

  it('le reste de l’identité reste dans « Ce que Laura sait de toi » (le témoin)', () => {
    render(<MemoryLedgerView />)
    const identity = within(section('Ce que Laura sait de toi'))
    expect(identity.getByText('Directeur commercial')).toBeInTheDocument()
    expect(identity.getByText('Louis')).toBeInTheDocument()
    expect(identity.queryByText('Signer trois nouveaux comptes')).toBeNull()
  })

  it('ne propose pas de les oublier : elles se corrigent dans le questionnaire, ouvert à la demande', () => {
    render(<MemoryLedgerView />)
    expect(screen.queryByRole('button', { name: /Oublier cette ligne : Signer trois nouveaux comptes/ })).toBeNull()
    expect(dialogMounts).not.toHaveBeenCalled()

    const correct = within(section('Objectifs personnels')).getByRole('button', {
      name: 'Corriger dans ton questionnaire de profil',
    })
    expect(correct.className).toContain('min-h-11')
    fireEvent.click(correct)
    expect(screen.getByRole('dialog', { name: 'Questionnaire de profil' })).toBeInTheDocument()
  })

  it('sans objectif déclaré, aucun geste de correction ne s’affiche dans la section', () => {
    ledger = { entries: [declared('sellerRole', 'Directeur commercial')], unreadableLayers: [] }
    render(<MemoryLedgerView />)
    expect(
      within(section('Objectifs personnels')).queryByRole('button', {
        name: 'Corriger dans ton questionnaire de profil',
      }),
    ).toBeNull()
  })

  it('une identité illisible ne se lit pas « aucun objectif » dans la section', () => {
    ledger = { entries: [], unreadableLayers: ['identity'] }
    render(<MemoryLedgerView />)
    const objectives = within(section('Objectifs personnels'))
    expect(objectives.queryByText('Aucun objectif personnel retenu.')).toBeNull()
    expect(objectives.getByText(/n'a pas pu être lue/)).toBeInTheDocument()
  })
})
