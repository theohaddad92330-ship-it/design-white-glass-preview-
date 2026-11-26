import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ProjectNeed } from '@bellum/contracts'

const update = vi.fn()

vi.mock('../hooks/useProjectNeeds', () => ({
  useProjectNeeds: () => ({ data: needs, isLoading: false, isError: false }),
  useAddProjectNeed: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveProjectNeed: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateProjectNeed: () => ({ mutate: update, isPending: false }),
}))
let shortlist: unknown[] = []
vi.mock('@/features/submissions/api', () => ({ useSubmissions: () => ({ data: { items: shortlist } }) }))
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const { ProjectNeedsPanel } = await import('./ProjectNeedsPanel')

let needs: ProjectNeed[] = []

function need(over: Partial<ProjectNeed> = {}): ProjectNeed {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    project_id: '22222222-2222-4222-8222-222222222222',
    title: 'Architecte de plateforme',
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    status: 'open',
    deadline_at: null,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
    ...over,
  } as ProjectNeed
}

/**
 * Trouvé en recette : `PATCH /projects/needs/:id` et `useUpdateProjectNeed`
 * existaient tous les deux, et AUCUN écran ne les appelait. Un besoin ne pouvait
 * donc recevoir aucune compétence, et le bouton « Lancer le matching » restait
 * éteint pour toujours.
 *
 * Ce test monte le panneau pour de vrai et va jusqu'à l'ÉCRITURE : une garde qui
 * se contenterait de vérifier que le composant existe serait passée au vert sur
 * exactement le même défaut.
 */
describe('les compétences d’un rôle', () => {
  beforeEach(() => {
    cleanup()
    update.mockClear()
    needs = [need()]
    shortlist = []
  })

  it('propose de les ajouter quand il n’y en a aucune', () => {
    render(<ProjectNeedsPanel projectId="22222222-2222-4222-8222-222222222222" />)
    expect(screen.getByText('+ Compétences')).toBeTruthy()
  })

  it('enregistre l’obligatoire et le souhaité SÉPARÉMENT', () => {
    render(<ProjectNeedsPanel projectId="22222222-2222-4222-8222-222222222222" />)
    fireEvent.click(screen.getByText('+ Compétences'))
    fireEvent.change(screen.getByPlaceholderText(/Obligatoires/), { target: { value: 'Kubernetes, Terraform' } })
    fireEvent.change(screen.getByPlaceholderText(/Souhaitées/), { target: { value: 'Observabilité' } })
    fireEvent.click(screen.getByText('Enregistrer'))

    expect(update).toHaveBeenCalledTimes(1)
    const [payload] = update.mock.calls[0] as [{ needId: string; patch: { skills: unknown[] } }]
    expect(payload.patch.skills).toEqual([
      { term: 'Kubernetes', required: true, level: null },
      { term: 'Terraform', required: true, level: null },
      { term: 'Observabilité', required: false, level: null },
    ])
  })

  it('le bouton de matching est ÉTEINT tant qu’aucune compétence n’est saisie, et dit pourquoi', () => {
    render(<ProjectNeedsPanel projectId="22222222-2222-4222-8222-222222222222" />)
    const button = screen.getByTitle(/n'a pas de compétence renseignée/)
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('et il s’allume dès qu’une compétence existe, même si le reste est encore inconnu', () => {
    // #2323.29-.31 — UNKNOWN ≠ ZERO : séniorité/localisation/timing manquants
    // ne bloquent JAMAIS le lancement, seule l'absence de compétence le fait.
    needs = [need({ skills: [{ term: 'Kubernetes', required: true, level: null }] })]
    render(<ProjectNeedsPanel projectId="22222222-2222-4222-8222-222222222222" />)
    const button = screen.getByTitle(/Je peux lancer/)
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('et le tooltip dit « Je compare ce besoin » quand plus rien ne manque (#2323.13/.14-.17)', () => {
    needs = [
      need({
        skills: [{ term: 'Kubernetes', required: true, level: null }],
        seniority: 'confirmé',
        location: 'Paris',
        start_on: '2026-11-01',
      }),
    ]
    render(<ProjectNeedsPanel projectId="22222222-2222-4222-8222-222222222222" />)
    const button = screen.getByTitle(/Je compare ce besoin/)
    expect(button.hasAttribute('disabled')).toBe(false)
  })
})

// #4344.4 — la fiche de l'affaire montre la shortlist de son besoin : nombre + 3 premiers ; rien s'il n'y a personne.
describe('la shortlist d’un rôle sur la fiche de l’affaire', () => {
  beforeEach(() => {
    cleanup()
    needs = [need()]
  })
  const positioned = (name: string, n: number) => ({
    id: `s${n}`,
    needId: '11111111-1111-4111-8111-111111111111',
    consultantName: name,
    stage: 'shortlisted',
  })

  it('personne de positionné → aucun aperçu, jamais « 0 »', () => {
    shortlist = []
    render(<ProjectNeedsPanel projectId="22222222-2222-4222-8222-222222222222" />)
    expect(screen.queryByTestId('need-shortlist')).toBeNull()
  })

  it('quatre positionnés → le nombre, les trois premiers, un lien', () => {
    shortlist = ['Ada', 'Bob', 'Cléo', 'Dan'].map((name, n) => positioned(name, n))
    render(<ProjectNeedsPanel projectId="22222222-2222-4222-8222-222222222222" />)
    const preview = screen.getByTestId('need-shortlist')
    expect(preview).toHaveTextContent('4')
    expect(preview).toHaveTextContent('Cléo')
    expect(preview).not.toHaveTextContent('Dan')
    expect(screen.getByRole('button', { name: 'Voir la shortlist' })).toBeInTheDocument()
  })
})

describe('le titre d’un rôle ouvre sa fiche (#4344.2)', () => {
  beforeEach(() => {
    cleanup()
    navigate.mockReset()
    needs = [need()]
    shortlist = []
  })

  it('même sans aucun positionné (donc sans aperçu de shortlist), le titre mène à la fiche du besoin', () => {
    render(<ProjectNeedsPanel projectId="22222222-2222-4222-8222-222222222222" />)
    expect(screen.queryByTestId('need-shortlist')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Architecte de plateforme' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/projects/needs/$needId',
      params: { needId: '11111111-1111-4111-8111-111111111111' },
      search: { tab: 'profiles' },
    })
  })
})
