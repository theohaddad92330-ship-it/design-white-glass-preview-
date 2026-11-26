import type { SessionUser } from '@bellum/contracts'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { TalentFieldReportDialog } from './TalentFieldReportDialog'
import { useRecordFieldReport } from '../../hooks'

vi.mock('../../hooks', () => ({ useRecordFieldReport: vi.fn() }))
const profileState: { data: { first_name: string | null; last_name: string | null } | null } = { data: null }
vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => profileState }))

const TALENT_ID = '11111111-1111-4111-8111-111111111111'

const ME: SessionUser = {
  id: 'moi',
  email: 'louis@bellum-it.com',
  created_at: '2026-01-01T00:00:00.000Z',
  roles: ['customer'],
}

function mockMutation(overrides: Partial<ReturnType<typeof useRecordFieldReport>> = {}) {
  vi.mocked(useRecordFieldReport).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useRecordFieldReport>)
}

/**
 * #3406 (recette prod 30/09) — deux restes nommés :
 * - « les champs déclarant et date ne sont pas visibles dans le formulaire » ;
 * - « vu en passant » : Échap/Annuler laissaient un dialogue fantôme, car le
 *   bouton Annuler sautait le `reset()` que le reste du dialogue applique.
 */
describe('TalentFieldReportDialog — #3406 recette 30/09', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    profileState.data = null
    useCurrentUserStore.setState({ currentUser: ME })
  })

  it('montre qui déclare et quand, avant même d’enregistrer', () => {
    mockMutation()
    render(<TalentFieldReportDialog talentId={TALENT_ID} open onOpenChange={() => {}} />)
    expect(screen.getByText(/Enregistré par louis@bellum-it.com/)).toBeTruthy()
  })

  it('#3406 — affiche le NOM de la personne, pas son e-mail, quand le profil en porte un', () => {
    mockMutation()
    profileState.data = { first_name: 'Camille', last_name: 'Roussel' }
    render(<TalentFieldReportDialog talentId={TALENT_ID} open onOpenChange={() => {}} />)
    expect(screen.getByText(/Enregistré par Camille Roussel/)).toBeTruthy()
    expect(screen.queryByText(/louis@bellum-it.com/)).toBeNull()
  })

  it('« toi » quand aucun utilisateur courant n’est connu', () => {
    mockMutation()
    useCurrentUserStore.setState({ currentUser: null })
    render(<TalentFieldReportDialog talentId={TALENT_ID} open onOpenChange={() => {}} />)
    expect(screen.getByText(/Enregistré par toi/)).toBeTruthy()
  })

  it('Annuler efface la saisie, comme Échap (même chemin de fermeture)', () => {
    mockMutation()
    const onOpenChange = vi.fn()
    const { rerender } = render(<TalentFieldReportDialog talentId={TALENT_ID} open onOpenChange={onOpenChange} />)

    fireEvent.change(screen.getByLabelText('Entreprise'), { target: { value: 'Société Générale' } })
    fireEvent.click(screen.getByText('Annuler'))

    expect(onOpenChange).toHaveBeenCalledWith(false)

    // Réouverture : le champ ne doit PAS avoir gardé la saisie précédente —
    // avant #3406, seul Échap/clic-hors-cadre appelait `reset()`, pas ce bouton.
    rerender(<TalentFieldReportDialog talentId={TALENT_ID} open onOpenChange={onOpenChange} />)
    expect((screen.getByLabelText('Entreprise') as HTMLInputElement).value).toBe('')
  })
  // #3406 (recette 30/09) — Échap et « Annuler » laissaient un role=dialog dans
  // le DOM : un piège pour la navigation au clavier. Le dialogue contrôlé par son
  // parent doit DISPARAÎTRE, pas seulement se vider.
  function Harness() {
    const [open, setOpen] = useState(true)
    return <TalentFieldReportDialog talentId={TALENT_ID} open={open} onOpenChange={setOpen} />
  }

  it.each([
    ['Annuler', () => fireEvent.click(screen.getByText('Annuler'))],
    ['Échap', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
  ])('%s retire le dialogue du DOM', async (_name, close) => {
    mockMutation()
    render(<Harness />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    close()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
