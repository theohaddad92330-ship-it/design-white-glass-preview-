import type React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MEMORY_DECLARED_CORRECTIONS, type MemoryLedger, type MemoryLedgerEntry } from '@bellum/contracts'
import { stageQuestions, TEMPS1_STAGES } from '@/features/onboarding/lib/questions'

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
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={params ? to.replace('$stage', params.stage ?? '') : to} {...rest}>
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

vi.mock('@/features/onboarding/components/ProfileQuestionnaireDialog', () => ({
  ProfileQuestionnaireDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Questionnaire de profil" /> : null,
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

function identityGroup(): HTMLElement {
  const element = screen.getByText('Ce que Laura sait de toi').closest('section')
  if (!element) throw new Error('aucun groupe identité')
  return element
}

/**
 * Défaut trouvé le 13/09 : « Modifier dans Mon compte » servait tout le groupe
 * identité, alors que Mon compte n'édite que prénom, nom et e-mail. Le rôle et la
 * proactivité se règlent dans le questionnaire de profil ; la difficulté
 * principale dans une étape du profil. Chaque geste n'apparaît que si une ligne
 * qu'il corrige est là.
 */
describe('MemoryLedgerView — le groupe identité renvoie là où chaque ligne se corrige', () => {
  beforeEach(() => {
    ledger = { entries: [], unreadableLayers: [] }
  })

  it('prénom → Mon compte ; rôle et proactivité → le questionnaire ; difficulté principale → son étape du profil', () => {
    ledger = {
      entries: [
        declared('firstName', 'Louis'),
        declared('sellerRole', 'Directeur commercial'),
        declared('proactivity', 'Proactive'),
        declared('mainChallenge', 'Trouver le bon interlocuteur'),
      ],
      unreadableLayers: [],
    }
    render(<MemoryLedgerView />)
    const group = within(identityGroup())

    expect(group.getByRole('link', { name: /Modifier dans Mon compte/ })).toHaveAttribute(
      'href',
      '/settings/profile/identity',
    )

    const questionnaire = group.getByRole('button', { name: 'Corriger dans ton questionnaire de profil' })
    expect(questionnaire.className).toContain('min-h-11')
    fireEvent.click(questionnaire)
    expect(screen.getByRole('dialog', { name: 'Questionnaire de profil' })).toBeInTheDocument()

    expect(group.getByRole('link', { name: /Modifier dans ton profil : Tes cibles/ })).toHaveAttribute(
      'href',
      '/settings/profile/target_market',
    )
  })

  it('NON — sans prénom affiché, pas de lien vers Mon compte : il ne corrigerait rien de ce qui est montré', () => {
    ledger = { entries: [declared('sellerRole', 'Directeur commercial')], unreadableLayers: [] }
    render(<MemoryLedgerView />)
    const group = within(identityGroup())
    expect(group.queryByRole('link', { name: /Modifier dans Mon compte/ })).toBeNull()
    expect(group.getByRole('button', { name: 'Corriger dans ton questionnaire de profil' })).toBeInTheDocument()
  })

  it('le témoin : avec le seul prénom, seul le lien vers Mon compte — ni questionnaire, ni étape', () => {
    ledger = { entries: [declared('firstName', 'Louis')], unreadableLayers: [] }
    render(<MemoryLedgerView />)
    const group = within(identityGroup())
    expect(group.getByRole('link', { name: /Modifier dans Mon compte/ })).toBeInTheDocument()
    expect(group.queryByRole('button', { name: 'Corriger dans ton questionnaire de profil' })).toBeNull()
    expect(group.queryByRole('link', { name: /Modifier dans ton profil :/ })).toBeNull()
  })

  it('une destination « étape du profil » désigne une étape qui POSE vraiment cette question', () => {
    const stageKeys = Object.values(MEMORY_DECLARED_CORRECTIONS).flatMap(correction =>
      correction.editedIn === 'onboardingStage' ? [correction.answerKey] : [],
    )
    expect(stageKeys.length).toBeGreaterThan(0)
    for (const answerKey of stageKeys) {
      const stage = TEMPS1_STAGES.find(candidate =>
        stageQuestions(candidate).some(question => question.key === answerKey),
      )
      expect({ answerKey, stage: stage?.code ?? null }).toEqual({ answerKey, stage: expect.any(String) })
    }
  })
})
