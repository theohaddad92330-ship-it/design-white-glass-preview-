import type { ProfileContextRevisionSummary } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProfileContextVersions } from './ProfileContextVersions'

const useRevisionsMock = vi.fn()
vi.mock('@/features/profile-context/hooks/useProfileContextRevisions', () => ({
  useProfileContextRevisions: () => useRevisionsMock(),
}))

const restoreMutate = vi.fn()
vi.mock('@/features/profile-context/hooks/useRestoreProfileContextRevision', () => ({
  useRestoreProfileContextRevision: () => ({ mutate: restoreMutate, isPending: false, variables: undefined }),
}))

const revisions: ProfileContextRevisionSummary[] = [
  { version: 3, schema_version: 1, created_at: '2026-07-18T10:00:00Z', was_last_validated: false },
  { version: 2, schema_version: 1, created_at: '2026-07-17T10:00:00Z', was_last_validated: false },
  { version: 1, schema_version: 1, created_at: '2026-07-16T10:00:00Z', was_last_validated: false },
]

describe('ProfileContextVersions (present-only)', () => {
  it('renders nothing while the revisions are loading', () => {
    useRevisionsMock.mockReturnValue({ data: undefined, isLoading: true })
    const { container } = render(<ProfileContextVersions />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there is no history', () => {
    useRevisionsMock.mockReturnValue({ data: [], isLoading: false })
    const { container } = render(<ProfileContextVersions />)
    expect(container).toBeEmptyDOMElement()
  })

  it('marks the newest revision as current and offers restore on the others', () => {
    useRevisionsMock.mockReturnValue({ data: revisions, isLoading: false })
    render(<ProfileContextVersions />)

    // One « Actuelle » badge (the newest); a restore button per previous revision.
    expect(screen.getByText('Actuelle')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Restaurer' })).toHaveLength(2)
    expect(screen.getByText('Version 3')).toBeInTheDocument()
    expect(screen.getByText('Version 1')).toBeInTheDocument()
  })

  // #2010.6 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md §1) :
  // toute révision qui n'est pas l'actuelle est REMPLACÉE, dérivé de sa
  // position dans la liste ordonnée — aucun champ supplémentaire à écrire.
  it('#2010.6 — marque « Remplacée » chaque révision qui n’est pas l’actuelle', () => {
    useRevisionsMock.mockReturnValue({ data: revisions, isLoading: false })
    render(<ProfileContextVersions />)

    expect(screen.getAllByText('Remplacée')).toHaveLength(2)
  })

  /**
   * #2010.17 — RÉSIDU : pendant une revue en cours, savoir QUELLE ancienne
   * révision était la dernière validée (jamais deviné par la position — une
   * régénération peut intervenir plusieurs fois avant qu'une revue ne se
   * conclue). Champ serveur `was_last_validated`, calculé contre
   * `profiles.last_validated_context_version` (stampé au clic « Valider »).
   */
  it('#2010.17 — marque « Dernière validée » la révision validée que la revue en cours a remplacée', () => {
    useRevisionsMock.mockReturnValue({
      data: [
        { version: 3, schema_version: 1, created_at: '2026-07-18T10:00:00Z', was_last_validated: false },
        { version: 2, schema_version: 1, created_at: '2026-07-17T10:00:00Z', was_last_validated: true },
        { version: 1, schema_version: 1, created_at: '2026-07-16T10:00:00Z', was_last_validated: false },
      ],
      isLoading: false,
    })
    render(<ProfileContextVersions />)

    expect(screen.getByText('Dernière validée')).toBeInTheDocument()
    // Une seule « Remplacée » : la version 2 porte « Dernière validée » à la place.
    expect(screen.getAllByText('Remplacée')).toHaveLength(1)
  })

  it('#2010.17 — une révision ACTUELLE qui est AUSSI la dernière validée ne montre qu’« Actuelle »', () => {
    useRevisionsMock.mockReturnValue({
      data: [{ version: 1, schema_version: 1, created_at: '2026-07-16T10:00:00Z', was_last_validated: true }],
      isLoading: false,
    })
    render(<ProfileContextVersions />)

    expect(screen.getByText('Actuelle')).toBeInTheDocument()
    expect(screen.queryByText('Dernière validée')).toBeNull()
  })
})
