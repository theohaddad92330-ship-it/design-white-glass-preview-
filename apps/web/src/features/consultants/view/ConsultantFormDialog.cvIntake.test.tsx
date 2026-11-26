import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Consultant } from '@bellum/contracts'
import { ConsultantFormDialog } from './ConsultantFormDialog'
import { useCvIntake } from '../hooks'

/**
 * #1801.1 — « déplace le glisser cv dans ajouter un consultant, de sorte à ce
 * que ce soit le premier truc qu'on voit quand on ouvre la modale d'ajout ».
 *
 * Le dépôt de CV (`CvDropZone`) vivait dans le CORPS de l'écran Vivier, entre
 * le bouton d'ajout et les filtres — une carte de plus à faire défiler avant
 * la liste. Il rejoint la modale « Ajouter un consultant », qui ne l'affiche
 * qu'à la CRÉATION : éditer une fiche existante ne doit pas ouvrir une porte
 * qui en créerait une SECONDE par CV.
 *
 * ⚠️ Ce fichier teste le VRAI `CvDropZone` (non mocké) : seul `useCvIntake`
 * (son unique dépendance réseau) est simulé — c'est ce qui prouve que le
 * composant est bien monté ICI, dans le formulaire, et pas ailleurs.
 *
 * #1801.2 (import ZIP de plusieurs CV) N'EST PAS traité ici — capacité
 * serveur nouvelle, hors de ce lot (voir le rapport de l'agent).
 */
vi.mock('../hooks', () => ({ useCvIntake: vi.fn() }))
vi.mock('../talent-api', () => ({
  useTalentDuplicates: vi.fn(() => ({ data: undefined })),
  useSkillSuggestion: vi.fn(() => ({ data: undefined })),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function mockIntake() {
  const mutateAsync = vi.fn()
  vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<typeof useCvIntake>)
  return mutateAsync
}

function existingTalent(): Consultant {
  return {
    id: '1',
    workspace_id: null,
    kind: 'consultant',
    source: null,
    last_contact_at: null,
    archived_at: null,
    archived_reason: null,
    review_status: 'qualified',
    consent: { givenAt: null, expiresAt: null, basis: null, restrictions: null },
    full_name: 'Yanis Berthier',
    title: null,
    seniority: 'senior',
    years_experience: null,
    availability: 'immediate',
    available_from: null,
    contract_type: 'cdi',
    engagement_kind: 'salarie',
    partner_account_id: null,
    contact_visible: true,
    finance_visible: true,
    tjm: null,
    stack: [],
    sectors: [],
    zones: [],
    education: [],
    mobility: {
      zones: null,
      remote: null,
      travel: null,
      relocation: null,
      siteFrequency: null,
      international: null,
      restrictions: null,
    },
    process: { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null },
    positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
    preferences: { wantedSectors: [], refusedSectors: [], refusedTechnologies: [], wantedContractKinds: [] },
    references: [],
    languages: [],
    clearances: [],
    wants: null,
    notes: null,
    cv_text: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  } satisfies Consultant
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ConsultantFormDialog — le dépôt de CV, en premier, à la création', () => {
  it('affiche la zone de dépôt AVANT le champ « Nom complet »', () => {
    mockIntake()
    render(
      <ConsultantFormDialog
        open
        consultant={null}
        saving={false}
        onClose={() => {}}
        onSubmit={() => {}}
        onCvIntake={() => {}}
      />,
    )
    const drop = screen.getByText('Dépose un CV ici pour créer une fiche')
    const name = screen.getByLabelText(/Nom complet/)

    expect(drop.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ne montre AUCUN dépôt de CV en ÉDITION — une fiche existante n’en crée pas une seconde', () => {
    mockIntake()
    render(
      <ConsultantFormDialog
        open
        consultant={existingTalent()}
        saving={false}
        onClose={() => {}}
        onSubmit={() => {}}
        onCvIntake={() => {}}
      />,
    )
    expect(screen.queryByText('Dépose un CV ici pour créer une fiche')).not.toBeInTheDocument()
    // H-DECISIONS #4348 — pas non plus de pré-remplissage depuis un profil LinkedIn en édition.
    expect(screen.queryByRole('button', { name: /Pré-remplir depuis/ })).not.toBeInTheDocument()
  })

  it('ne montre rien quand l’appelant n’a pas câblé le dépôt — les autres portes d’ajout gardent leur formulaire nu', () => {
    mockIntake()
    render(<ConsultantFormDialog open consultant={null} saving={false} onClose={() => {}} onSubmit={() => {}} />)
    expect(screen.queryByText('Dépose un CV ici pour créer une fiche')).not.toBeInTheDocument()
  })

  it('un CV déposé remonte l’identifiant créé à l’appelant, PAS au formulaire manuel', async () => {
    const mutateAsync = mockIntake()
    mutateAsync.mockResolvedValue({ outcome: 'created', consultantId: 'c-9', extractedChars: 12 })
    const onCvIntake = vi.fn()
    const onSubmit = vi.fn()
    render(
      <ConsultantFormDialog
        open
        consultant={null}
        saving={false}
        onClose={() => {}}
        onSubmit={onSubmit}
        onCvIntake={onCvIntake}
      />,
    )
    const file = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' })
    const input = screen.getByLabelText('Choisir un fichier')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(onCvIntake).toHaveBeenCalledWith('c-9'))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
