import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'
import { MissionCreateForm } from './MissionCreateForm'

/**
 * #4196 (L5) — « Nouvelle mission » crée une MISSION, pas un besoin : trois champs
 * obligatoires (compte, intitulé, date de début), le reste optionnel et ABSENT du
 * corps quand il est vide (jamais « 0 », jamais une chaîne vide).
 */
const mutate = vi.fn()
vi.mock('@/features/missions/api', () => ({
  useCreateMission: () => ({ mutate, isPending: false }),
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: { pages: [{ data: [{ id: 'acc-1', company_name: 'Société Générale' }] }] },
    isLoading: false,
  }),
}))
vi.mock('@/features/consultants/hooks', () => ({
  useConsultants: () => ({ data: [{ id: 'con-1', full_name: 'Camille Durand' }], isLoading: false }),
}))
vi.mock('@/features/projects/hooks/useProject', () => ({
  useProject: (id: string) => ({
    project: id ? { id, account_id: 'acc-1', company_name: 'Société Générale' } : undefined,
  }),
}))
vi.mock('@/features/projects/hooks/useProjects', () => ({
  useProjects: () => ({ data: [] }),
}))

async function pickAccount(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Compte'), 'Société')
  await user.click(await screen.findByRole('button', { name: 'Société Générale' }))
}

describe('MissionCreateForm', () => {
  beforeEach(() => mutate.mockReset())

  it('le bouton reste désactivé tant que compte, intitulé et date de début manquent', async () => {
    const user = userEvent.setup()
    render(<MissionCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'Créer la mission' })
    expect(submit).toBeDisabled()
    await pickAccount(user)
    await user.type(screen.getByLabelText('Intitulé'), 'Refonte SI paiement')
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Date de début'), '2026-11-02')
    expect(submit).toBeEnabled()
  })

  it('n’envoie que les champs obligatoires quand les optionnels sont vides', async () => {
    const user = userEvent.setup()
    render(<MissionCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    await pickAccount(user)
    await user.type(screen.getByLabelText('Intitulé'), 'Refonte SI paiement')
    await user.type(screen.getByLabelText('Date de début'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Créer la mission' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0]).toEqual({
      accountId: 'acc-1',
      label: 'Refonte SI paiement',
      startedOn: '2026-11-02',
    })
  })

  it('envoie consultant, TJM et fin quand ils sont saisis ; rend la mission créée à l’appelant', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<MissionCreateForm onCreated={onCreated} onCancel={vi.fn()} />)
    await pickAccount(user)
    await user.type(screen.getByLabelText('Intitulé'), 'Refonte SI paiement')
    await user.type(screen.getByLabelText('Date de début'), '2026-11-02')
    await user.type(screen.getByLabelText('Date de fin'), '2027-03-31')
    await user.type(screen.getByLabelText('TJM vendu (€)'), '650')
    await chooseOption(screen.getByRole('combobox', { name: 'Consultant' }), 'Camille Durand')
    await user.click(screen.getByRole('button', { name: 'Créer la mission' }))
    expect(mutate.mock.calls[0]?.[0]).toEqual({
      accountId: 'acc-1',
      label: 'Refonte SI paiement',
      startedOn: '2026-11-02',
      endsOn: '2027-03-31',
      dailyRate: 650,
      consultantId: 'con-1',
    })
    const options = mutate.mock.calls[0]?.[1] as { onSuccess: (mission: { id: string }) => void }
    options.onSuccess({ id: 'm-1' })
    expect(onCreated).toHaveBeenCalledWith({ id: 'm-1' })
  })

  it('une fin avant le début est refusée à l’écran, sans appel', async () => {
    const user = userEvent.setup()
    render(<MissionCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    await pickAccount(user)
    await user.type(screen.getByLabelText('Intitulé'), 'X')
    await user.type(screen.getByLabelText('Date de début'), '2026-11-02')
    await user.type(screen.getByLabelText('Date de fin'), '2026-10-01')
    expect(screen.getByText('La fin ne peut pas précéder le début.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer la mission' })).toBeDisabled()
  })

  it('venant d’une opportunité signée, le compte est imposé et l’affaire est portée', async () => {
    const user = userEvent.setup()
    render(<MissionCreateForm projectId="p-1" onCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByLabelText('Compte')).toBeNull()
    expect(screen.getByText('Société Générale')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Intitulé'), 'Refonte SI paiement')
    await user.type(screen.getByLabelText('Date de début'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Créer la mission' }))
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ accountId: 'acc-1', opportunityId: 'p-1' })
  })
})

/**
 * Refonte Théo PR12 — la grammaire du dossier de mission : trois blocs titrés, dans l'ordre client →
 * mission → conditions, chaque champ dans SON bloc, et les deux gestes en pied (« Créer » en dernier).
 */
describe('MissionCreateForm — la structure de la maquette', () => {
  it('range les champs en trois blocs titrés, dans l’ordre du dossier', () => {
    const { container } = render(<MissionCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    const sections = Array.from(container.querySelectorAll('section[data-theo-section]'))
    expect(sections.map(section => section.getAttribute('data-theo-section'))).toEqual([
      'client',
      'mission',
      'conditions',
    ])
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
      'Pour quel client',
      'Ce qui démarre, et quand',
      'Le tarif et la personne',
    ])
    const [client, mission, conditions] = sections as HTMLElement[]
    expect(client?.contains(screen.getByLabelText('Compte'))).toBe(true)
    expect(mission?.contains(screen.getByLabelText('Intitulé'))).toBe(true)
    expect(mission?.contains(screen.getByLabelText('Date de début'))).toBe(true)
    expect(conditions?.contains(screen.getByLabelText('TJM vendu (€)'))).toBe(true)
  })

  it('pose « Annuler » puis « Créer la mission » en pied, après les blocs', () => {
    const { container } = render(<MissionCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    const footer = container.querySelector('[data-theo-block="form-footer"]') as HTMLElement
    const buttons = Array.from(footer.querySelectorAll('button')).map(button => button.textContent)
    expect(buttons).toEqual(['Annuler', 'Créer la mission'])
    const last = container.querySelector('section[data-theo-section="conditions"]') as HTMLElement
    expect(last.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('un champ obligatoire le DIT aux lecteurs d’écran, pas seulement par une étoile', () => {
    render(<MissionCreateForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getAllByText('obligatoire')).toHaveLength(3)
  })
})
