import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import bpce from '../../../../../../../../../packages/contracts/src/commercial-brief/bpce.fixture.json'
import { ProcurementPractices } from './ProcurementPractices'

const mutate = vi.fn()
let pending = false

vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useCreateTask: () => ({ mutate, isPending: pending }),
}))

const COLUMNS = ['numero', 'element', 'nom', 'ce_que_c_est', 'ce_que_tu_dois_avoir_en_tete', 'fiabilite'].map(key => ({
  key,
  label: key,
}))

function accountWith(rows: Record<string, unknown>[] | null): Account {
  const brief = structuredClone(bpce) as { sections: unknown[] }
  brief.sections = rows === null ? [] : [{ key: 'achats-avant-d-appeler', title: 'ACHATS', columns: COLUMNS, rows }]
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'completed',
    created_at: '2026-08-01T09:00:00.000Z',
    raw_analysis: { commercial_brief: brief },
  } as unknown as Account
}

const ROWS = [
  {
    numero: 1,
    element: 'Plateforme d’appels d’offres',
    nom: 'Portail A',
    ce_que_c_est: 'Les consultations sont diffusées ici.',
    ce_que_tu_dois_avoir_en_tete: 'S’inscrire avant toute démarche.',
    fiabilite: 'Confirmé terrain',
  },
  {
    numero: 2,
    element: 'Conformité documentaire',
    nom: '',
    ce_que_c_est: 'Dépôt des attestations.',
    ce_que_tu_dois_avoir_en_tete: '',
    fiabilite: null,
  },
]

describe('Pratiques achats — la grille de la maquette V22 (#5106)', () => {
  beforeEach(() => {
    mutate.mockReset()
    pending = false
  })
  afterEach(cleanup)

  it('5106.2 — titre avec prénom, puis sans prénom', () => {
    const { rerender } = render(<ProcurementPractices account={accountWith(ROWS)} firstName="Louis" />)
    expect(
      screen.getByRole('heading', { name: /Louis, vérifie le circuit avant de promettre un accès\./ }),
    ).toBeTruthy()
    expect(screen.getByText(/ne certifient ni ton référencement/)).toBeTruthy()
    rerender(<ProcurementPractices account={accountWith(ROWS)} />)
    expect(screen.getByRole('heading', { name: 'Vérifie le circuit avant de promettre un accès.' })).toBeTruthy()
  })

  it('5106.3 — trois cartes d’intro', () => {
    render(<ProcurementPractices account={accountWith(ROWS)} />)
    expect(screen.getByText('Relation commerciale')).toBeTruthy()
    expect(screen.getByText('Référencement fournisseur')).toBeTruthy()
    expect(screen.getByText('Commande & intervention')).toBeTruthy()
  })

  it('5106.4 — une carte par ligne : sur-titre, titre (nom sinon élément), paragraphe', () => {
    render(<ProcurementPractices account={accountWith(ROWS)} />)
    const cards = screen.getAllByTestId('procurement-card')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]!).getByRole('heading', { name: 'Portail A' })).toBeTruthy()
    expect(within(cards[0]!).getByText('Plateforme d’appels d’offres')).toBeTruthy()
    expect(within(cards[0]!).getByText('Les consultations sont diffusées ici.')).toBeTruthy()
    expect(within(cards[1]!).getByRole('heading', { name: 'Conformité documentaire' })).toBeTruthy()
  })

  it('5106.5 — repli de lecture avec la qualification ; absent quand la ligne est vide', () => {
    render(<ProcurementPractices account={accountWith(ROWS)} />)
    const cards = screen.getAllByTestId('procurement-card')
    expect(within(cards[0]!).getByText('Lecture du relevé et points de vigilance')).toBeTruthy()
    expect(within(cards[0]!).getByText('S’inscrire avant toute démarche.')).toBeTruthy()
    expect(
      within(cards[0]!).getByText('Qualification d’origine : Confirmé terrain · relevé fourni, non revérifié.'),
    ).toBeTruthy()
    expect(within(cards[1]!).queryByText('Lecture du relevé et points de vigilance')).toBeNull()
  })

  it('5106.6 — « Préparer la vérification » crée une tâche avec le account_id affiché, rien d’autre', () => {
    const account = accountWith(ROWS)
    render(<ProcurementPractices account={account} />)
    const cards = screen.getAllByTestId('procurement-card')
    fireEvent.click(within(cards[0]!).getByRole('button', { name: /Préparer la vérification/ }))
    expect(mutate).toHaveBeenCalledTimes(1)
    const input = mutate.mock.calls[0]![0] as Record<string, unknown>
    expect(input.title).toBe('Vérifier : Portail A')
    expect(input.accountId).toBe(account.id)
    for (const forbidden of ['contactId', 'projectId', 'ownerId']) expect(input).not.toHaveProperty(forbidden)
  })

  it('5106.6 — bouton désactivé pendant l’envoi', () => {
    pending = true
    render(<ProcurementPractices account={accountWith(ROWS)} />)
    for (const button of screen.getAllByRole('button', { name: /Préparer la vérification/ })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it.each([[null], [[]]])('5106.7 — section absente ou vide : aucune carte, état vide dit', rows => {
    render(<ProcurementPractices account={accountWith(rows as Record<string, unknown>[] | null)} />)
    expect(screen.queryAllByTestId('procurement-card')).toHaveLength(0)
    expect(screen.getByText('Le circuit achats de ce compte n’est pas encore documenté.')).toBeTruthy()
    expect(screen.getByText('Relation commerciale')).toBeTruthy()
  })
})
