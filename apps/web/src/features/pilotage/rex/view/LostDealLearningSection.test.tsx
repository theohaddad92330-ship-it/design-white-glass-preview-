import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_RULE_PENDING_REVIEW } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * #3295 — l'apprentissage contrôlé côté web : le premier APPELANT des
 * propositions de règle (`POST`/`PATCH decide` existaient sans aucun écran).
 */
const role = vi.fn(() => 'owner')
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => ({ team: { workspace: { role: role() } } }) }))

const rex = vi.fn()
const proposals = vi.fn()
const rules = vi.fn()
const propose = vi.fn()
const decide = vi.fn()
const setActivation = vi.fn()
const outcomes = vi.fn()
vi.mock('../learning-api', () => ({
  LEARNING_KEYS: {
    rex: ['lost-deal-learning', 'rex'],
    proposals: ['lost-deal-learning', 'proposals'],
    rules: ['lost-deal-learning', 'rules'],
    outcomes: ['lost-deal-learning', 'outcomes'],
  },
  lostDealLearningApi: {
    rex: () => rex(),
    proposals: () => proposals(),
    rules: () => rules(),
    outcomes: () => outcomes(),
    propose: (...a: unknown[]) => propose(...a),
    decide: (...a: unknown[]) => decide(...a),
    setActivation: (...a: unknown[]) => setActivation(...a),
  },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return actual
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => ({ data: undefined }) }))
const projectsData = vi.fn(() => [] as unknown[])
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => ({ data: projectsData() }) }))
vi.mock('@/features/actions/planItems.api', () => ({ planItemsApi: { create: vi.fn() } }))

import { LostDealLearningSection } from './LostDealLearningSection'

const REX_A = {
  id: '11111111-1111-4111-8111-111111111111',
  project_id: 'p-a',
  created_at: '2026-05-12T10:00:00Z',
  declared_motif: null,
}
const REX_B = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: 'p-b',
  created_at: '2026-06-02T10:00:00Z',
  declared_motif: null,
}

const PROPOSAL = {
  id: '33333333-3333-4333-8333-333333333333',
  domain: 'Compte',
  convergent_rex_ids: [REX_A.id, REX_B.id],
  observation: 'Sans sponsor avant la démonstration, la perte suit.',
  status: 'pending',
}
const RULE = {
  id: '44444444-4444-4444-8444-444444444444',
  domain: 'Compte',
  statement: 'Sans sponsor avant la démonstration, la perte suit.',
  enabled: false,
  disabled_reason: WORKSPACE_RULE_PENDING_REVIEW,
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LostDealLearningSection />
    </QueryClientProvider>,
  )
}

describe('LostDealLearningSection — #3295 apprentissage contrôlé', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    role.mockReturnValue('owner')
    for (const fn of [rex, proposals, rules, propose, decide, setActivation, outcomes]) fn.mockReset()
    rex.mockResolvedValue({ items: [REX_A, REX_B] })
    proposals.mockResolvedValue({ items: [] })
    rules.mockResolvedValue({ items: [] })
    outcomes.mockResolvedValue({ items: [] })
    projectsData.mockReturnValue([])
  })

  it('moins de deux pertes documentées : le texte le dit, aucun geste « Proposer » mort', async () => {
    rex.mockResolvedValue({ items: [REX_A] })
    renderSection()
    expect(await screen.findByText(/au moins deux pertes documentées pour en proposer/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Proposer une règle' })).toBeNull()
  })

  it('#3295 — deux pertes citées ne portent jamais le même libellé : compte · affaire · date', async () => {
    projectsData.mockReturnValue([
      { id: 'p-a', company_name: 'BNP Paribas', label: 'Plateforme data' },
      { id: 'p-b', company_name: 'ENGIE', label: 'Refonte SI' },
    ])
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Proposer une règle' }))
    const labels = screen.getAllByRole('checkbox').map(box => box.closest('label')?.textContent ?? '')
    expect(labels[0]).toContain('BNP Paribas · Plateforme data')
    expect(labels[1]).toContain('ENGIE · Refonte SI')
    expect(new Set(labels).size).toBe(2)
  })

  // #3295 — les pertes qui fondent la proposition se LISENT, en lecture seule, sous « Règles apprises ».
  describe('pertes documentées lisibles', () => {
    const lostList = () => screen.getByRole('list', { name: 'Pertes documentées' })

    it('liste compte · affaire, motif déclaré (fait) et motif suspecté (hypothèse), date', async () => {
      projectsData.mockReturnValue([
        { id: 'p-a', company_name: 'BNP Paribas', label: 'Renfort conformité des paiements' },
        { id: 'p-b', company_name: 'ENGIE', label: 'Appui à la migration du poste de travail' },
      ])
      rex.mockResolvedValue({
        items: [
          { ...REX_A, declared_motif: 'prix', suspected_motif: 'mauvaise_personne' },
          { ...REX_B, declared_motif: 'timing', suspected_motif: null },
        ],
      })
      renderSection()
      await screen.findByRole('list', { name: 'Pertes documentées' })
      const rows = within(lostList()).getAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent('BNP Paribas')
      expect(rows[0]).toHaveTextContent('Renfort conformité des paiements')
      expect(rows[0]).toHaveTextContent('Motif déclaré : Prix')
      expect(rows[0]).toHaveTextContent('Hypothèse (non confirmée) : Mauvaise personne')
      expect(rows[1]).toHaveTextContent('ENGIE')
      expect(rows[1]).toHaveTextContent('Motif déclaré : Timing')
    })

    it('sait dire NON : un champ vide n’affiche rien — ni « 0 », ni « N/A », ni libellé orphelin', async () => {
      rex.mockResolvedValue({ items: [REX_A, REX_B] })
      renderSection()
      await screen.findByRole('list', { name: 'Pertes documentées' })
      expect(screen.queryByText(/Motif déclaré/)).toBeNull()
      expect(screen.queryByText(/Hypothèse/)).toBeNull()
      expect(screen.queryByText(/N\/A|\b0\b/)).toBeNull()
    })

    it('aucune perte documentée : aucun bloc, et aucun bouton qui écrit n’est ajouté', async () => {
      rex.mockResolvedValue({ items: [] })
      renderSection()
      await screen.findByText(/au moins deux pertes documentées pour en proposer/)
      expect(screen.queryByRole('list', { name: 'Pertes documentées' })).toBeNull()
      expect(within(document.body).queryAllByRole('button')).toHaveLength(0)
    })
  })

  it('#3295 — une règle issue d’une proposition adoptée n’apparaît qu’une fois (la règle, pas la proposition)', async () => {
    proposals.mockResolvedValue({ items: [{ ...PROPOSAL, status: 'adopted' }] })
    rules.mockResolvedValue({ items: [{ ...RULE, proposal_id: PROPOSAL.id, enabled: true, disabled_reason: null }] })
    renderSection()
    expect(await screen.findAllByText(PROPOSAL.observation)).toHaveLength(1)
  })

  it('proposer exige DEUX pertes citées — le bouton reste inerte avant', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Proposer une règle' }))
    fireEvent.change(screen.getByLabelText(/Ce que ces pertes ont en commun/), { target: { value: 'Pas de sponsor.' } })
    const submit = screen.getByRole('button', { name: 'Proposer' })
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[0]!)
    expect(submit).toBeDisabled()
    fireEvent.click(boxes[1]!)
    expect(submit).not.toBeDisabled()
  })

  it('le geste appelle POST avec les deux REX cités et l’observation', async () => {
    propose.mockResolvedValue(PROPOSAL)
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Proposer une règle' }))
    fireEvent.change(screen.getByLabelText(/Ce que ces pertes ont en commun/), { target: { value: 'Pas de sponsor.' } })
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'Proposer' }))

    await waitFor(() => expect(propose).toHaveBeenCalled())
    expect(propose.mock.calls[0]![0]).toEqual({
      domain: 'methode',
      convergent_rex_ids: [REX_A.id, REX_B.id],
      observation: 'Pas de sponsor.',
    })
  })

  it('un responsable adopte : la décision part, jamais une activation', async () => {
    proposals.mockResolvedValue({ items: [PROPOSAL] })
    decide.mockResolvedValue({ proposal: PROPOSAL, rule: RULE })
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Adopter' }))

    await waitFor(() => expect(decide).toHaveBeenCalledWith(PROPOSAL.id, 'adopted'))
    expect(setActivation).not.toHaveBeenCalled()
  })

  it('sans team:manage, ni Adopter ni Rejeter — la proposition reste lisible', async () => {
    role.mockReturnValue('member')
    proposals.mockResolvedValue({ items: [PROPOSAL] })
    renderSection()
    expect(await screen.findByText(PROPOSAL.observation)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adopter' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rejeter' })).toBeNull()
  })

  it('une règle adoptée s’affiche « En attente de revue d’activation » et s’active d’un geste séparé', async () => {
    rules.mockResolvedValue({ items: [RULE] })
    setActivation.mockResolvedValue({ ...RULE, enabled: true, disabled_reason: null })
    renderSection()
    expect(await screen.findByText('En attente de revue d’activation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))

    await waitFor(() => expect(setActivation).toHaveBeenCalledWith(RULE.id, { enabled: true, reason: undefined }))
  })

  it('désactiver une règle active (rollback) exige sa raison avant l’appel', async () => {
    rules.mockResolvedValue({ items: [{ ...RULE, enabled: true, disabled_reason: null }] })
    setActivation.mockResolvedValue({ ...RULE, enabled: false, disabled_reason: 'Biais constaté' })
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Désactiver' }))

    const confirm = screen.getByRole('button', { name: 'Désactiver la règle' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Pourquoi la désactiver ?'), { target: { value: 'Biais constaté' } })
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(setActivation).toHaveBeenCalledWith(RULE.id, { enabled: false, reason: 'Biais constaté' }),
    )
  })

  it('une règle désactivée nomme sa raison, jamais un silence', async () => {
    rules.mockResolvedValue({ items: [{ ...RULE, disabled_reason: 'Biais constaté' }] })
    renderSection()
    expect(await screen.findByText('Désactivée : Biais constaté')).toBeInTheDocument()
  })

  it('une lecture en échec le DIT — jamais « aucune règle »', async () => {
    rules.mockRejectedValue(new Error('boom'))
    renderSection()
    expect(await screen.findByText(/n’ont pas pu être lues/)).toBeInTheDocument()
  })
})
