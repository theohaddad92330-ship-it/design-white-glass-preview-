import type { BriefingAction } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { CardDispositionControls } from './CardDispositionControls'

/**
 * #2099.17-.32 (épopée #2767) — REPORTER / PAS PERTINENT / DÉJÀ TRAITÉ, depuis
 * la carte. Chaque geste POSTe `/briefing/card-disposition` pour CETTE carte,
 * avec la date de SON fait : un fait nouveau sur le même objet la fera revenir.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/x" className={className}>
      {children}
    </a>
  ),
}))

const apiFetchMock = vi.mocked(apiFetch)

function card(partial: Partial<BriefingAction> = {}): BriefingAction {
  return {
    id: 'payment:inv-1',
    labelKey: 'briefing.actions.paymentOverdue',
    labelVars: {},
    href: '/finance',
    kind: 'payment_overdue',
    priority: 5,
    fact: {
      labelKey: null,
      labelVars: {},
      provenance: { source: 'bellum', capability: 'finance', observedAt: '2026-09-27T10:00:00.000Z' },
    },
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    ...partial,
  } as BriefingAction
}

function mount(action: BriefingAction) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <CardDispositionControls action={action} />
    </QueryClientProvider>,
  )
}

function lastBody(): Record<string, unknown> {
  const call = apiFetchMock.mock.calls.at(-1)?.[0] as { path: string; body: Record<string, unknown> }
  expect(call.path).toBe('/briefing/card-disposition')
  return call.body
}

describe('CardDispositionControls (#2099.17-.32)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    apiFetchMock.mockResolvedValue({ recorded: true })
  })
  afterEach(() => cleanup())

  it('propose les trois gestes secondaires, fermés par défaut', () => {
    mount(card())
    expect(screen.getByRole('button', { name: 'Reporter' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Pas pertinent' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Déjà traité' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Demain' })).toBeNull()
  })

  it('« Déjà traité » enregistre le geste avec la date du fait de la carte', async () => {
    mount(card())
    fireEvent.click(screen.getByRole('button', { name: 'Déjà traité' }))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(lastBody()).toEqual({
      actionId: 'payment:inv-1',
      disposition: 'done',
      factObservedAt: '2026-09-27T10:00:00.000Z',
    })
  })

  it('Reporter propose les quatre options ; « Demain » envoie une date future', async () => {
    mount(card())
    fireEvent.click(screen.getByRole('button', { name: 'Reporter' }))
    for (const label of ['Cet après-midi', 'Demain', 'Cette semaine', 'Date personnalisée']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Demain' }))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    const body = lastBody()
    expect(body.disposition).toBe('postponed')
    expect(Date.parse(String(body.until))).toBeGreaterThan(Date.now())
  })

  it('Date personnalisée : le bouton reste fermé tant qu’aucune date future n’est choisie', async () => {
    mount(card())
    fireEvent.click(screen.getByRole('button', { name: 'Reporter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Date personnalisée' }))
    const confirm = screen.getByRole('button', { name: 'Reporter à cette date' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Choisir la date'), { target: { value: '2099-01-15' } })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(String(lastBody().until).startsWith('2099-01-15')).toBe(true)
  })

  it('Pas pertinent propose les six motifs et envoie celui choisi', async () => {
    mount(card())
    fireEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    const group = screen.getByRole('group', { name: 'Pourquoi n’est-ce pas pertinent ?' })
    for (const label of [
      'Mauvaise priorité',
      'Déjà fait',
      'Donnée fausse',
      'Pas maintenant',
      'Hors périmètre',
      'Autre',
    ]) {
      expect(group).toHaveTextContent(label)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Hors périmètre' }))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(lastBody()).toMatchObject({ disposition: 'dismissed', reason: 'out_of_scope' })
  })

  it('#2099.51 — une donnée fausse se corrige : la fiche de l’objet est proposée dans le refus', () => {
    mount(card({ businessObject: { kind: 'account', id: 'acc-1', name: 'Acme', logoUrl: null, website: null } }))
    fireEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    expect(screen.getByText('Une donnée fausse se corrige sur sa fiche :')).toBeInTheDocument()
  })

  it('sans objet à ouvrir, aucune ligne de correction n’est inventée', () => {
    mount(card())
    fireEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    expect(screen.queryByText('Une donnée fausse se corrige sur sa fiche :')).toBeNull()
  })

  it('un échec du serveur se DIT, la carte ne fait pas semblant', async () => {
    apiFetchMock.mockRejectedValue(new Error('500'))
    mount(card())
    fireEvent.click(screen.getByRole('button', { name: 'Déjà traité' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Le geste n’a pas été enregistré')
  })
})
