import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ProjectReadRow } from '@bellum/contracts'

// #2951 (recette écran, 26/09) — CETTE PAGE EST CE QUE `/projects/:id` REND
// EN PROD, PAS `ProjectDetailSheet.tsx` (le tiroir de `/projects`). La recette
// écran du 26/09 a trouvé, sur trois opportunités réelles à trois étapes, un
// CTA figé (« Ouvrir le dossier », toujours le même texte) et AUCUNE section
// Documents — deux points que `ProjectDetailSheet.test.tsx` couvrait déjà,
// mais sur le TIROIR : cette route n'avait aucune suite de tests à elle, donc
// rien ne pouvait dire que la page réellement montée divergeait du tiroir.
// #4198 (L7) — la zone « Objets liés » lit une requête : sans ce double, ce fichier devrait porter un QueryClientProvider.
vi.mock('@/features/records/useRecordLinks', () => ({ useRecordLinks: () => ({ data: undefined }) }))
vi.mock('@/components/access/PrivateSwitch', () => ({ PrivateSwitch: () => null }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, headerActions }: { children: React.ReactNode; headerActions?: React.ReactNode }) => (
    <div>
      {headerActions}
      {children}
    </div>
  ),
}))
const workspaceProfile = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('@/features/profile/hooks/useWorkspaceProfile', () => ({ useWorkspaceProfile: () => workspaceProfile.value }))
vi.mock('./ProjectFramingBlock', () => ({ ProjectFramingBlock: () => <div data-testid="project-framing" /> }))
vi.mock('./BtmmpPanel', () => ({ BtmmpPanel: () => null }))
vi.mock('./ProjectSectorsPanel', () => ({ ProjectSectorsPanel: () => null }))
vi.mock('./ProjectAmountControl', () => ({ ProjectAmountControl: () => null }))
vi.mock('../probability/ProjectDealProbability', () => ({ ProjectDealProbability: () => null }))
vi.mock('./ProjectOwnerControl', () => ({ ProjectOwnerControl: () => null }))
vi.mock('./ForecastCategoryField', () => ({ ProjectForecastCategoryControl: () => null }))
vi.mock('./ProjectStageControl', () => ({ ProjectStageControl: () => null }))
vi.mock('./ProjectDecisionChecklist', () => ({ ProjectDecisionChecklist: () => null }))
vi.mock('./ProjectEditDialog', () => ({ ProjectEditDialog: () => null }))
vi.mock('./ProjectLauraDialog', () => ({ ProjectLauraDialog: () => null }))
vi.mock('./ProjectFollowUpDialog', () => ({ ProjectFollowUpDialog: () => null }))
vi.mock('./ProjectStepsPanel', () => ({ ProjectStepsPanel: () => null }))
vi.mock('./ProjectPartnerGovernancePanel', () => ({ ProjectPartnerGovernancePanel: () => null }))
vi.mock('../hooks/useProjectStageMove', () => ({
  useProjectStageMove: () => ({ choose: vi.fn(), isPending: false, layer: null }),
}))
vi.mock('../hooks/useProjectNeeds', () => ({ useProjectNeeds: () => ({ data: [] }) }))
vi.mock('@/features/submissions/api', () => ({
  useSubmissions: () => ({ data: { items: [] }, isLoading: false }),
}))
vi.mock('@/features/submissions/view/PresentationsTable', () => ({ PresentationsTable: () => null }))
vi.mock('./ProjectProvenanceLine', () => ({ ProjectProvenanceLine: () => null }))
vi.mock('./ProjectNeedsPanel', () => ({ ProjectNeedsPanel: () => null }))
vi.mock('./ProjectContactsPanel', () => ({ ProjectContactsPanel: () => null }))
vi.mock('@/features/activities/view/TimelinePanel', () => ({ TimelinePanel: () => null }))
vi.mock('@/features/submissions/view/SubmissionsPanel', () => ({ SubmissionsPanel: () => null }))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({ ChainProgressBlock: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))
vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('../hooks/useProjectOwners', () => ({
  useProjectOwners: () => ({ selfId: null, ownerName: () => null }),
}))
// #2171.24 — le double NOMME le projet qu'il reçoit : un panneau monté sur le
// mauvais projet serait pire qu'absent, il enverrait modifier le mauvais
// dossier. Même règle que `MissionDossierPage.test.tsx`.
vi.mock('./ProjectDocumentsPanel', () => ({
  ProjectDocumentsPanel: ({ projectId }: { projectId: string }) => (
    <div data-testid="project-documents-panel">{projectId}</div>
  ),
}))

const useProject = vi.fn()
vi.mock('../hooks/useProject', () => ({ useProject: () => useProject() }))

const { ProjectDossierPage } = await import('./ProjectDossierPage')

const ID = 'p-1'

function project(over: Partial<ProjectReadRow> = {}): ProjectReadRow {
  return {
    id: ID,
    account_id: 'a-1',
    company_name: 'ACME',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'pain',
    label: 'Migration data lake',
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z',
    amount_cents: null,
    ...over,
  } as ProjectReadRow
}

function found(over: Partial<ProjectReadRow> = {}) {
  useProject.mockReturnValue({
    project: project(over),
    isPending: false,
    isError: false,
    notFound: false,
    refetch: vi.fn(),
  })
}

beforeEach(() => {
  cleanup()
  useProject.mockReset()
})

/**
 * #2951 — LE CTA DU HERO, sur la route RÉELLE (`/projects/:id`). La preuve de
 * code du 26/09 vérifiait `ProjectDetailSheet.tsx` (le tiroir) ; la recette
 * écran a montré que `ProjectDossierPage.tsx` (ce que la route rend) gardait
 * encore un bouton FIXE. Même fonction que le tiroir (`primaryActionForProject`,
 * GA-26) : un texte qui change avec l'étape, jamais un second calcul.
 */
describe('ProjectDossierPage — le CTA du hero change selon l’étape, comme le tiroir (#2171.16)', () => {
  it('« Qualifier l’affaire » sur une opportunité détectée', () => {
    found({ stage: 'detected' })
    render(<ProjectDossierPage projectId={ID} />)
    expect(screen.getByText('Qualifier l’affaire')).toBeInTheDocument()
  })

  it('« Lancer le matching » une fois le besoin confirmé — pas le même texte que « détecté »', () => {
    found({ stage: 'confirmed' })
    render(<ProjectDossierPage projectId={ID} />)
    expect(screen.getByText('Lancer le matching')).toBeInTheDocument()
    expect(screen.queryByText('Qualifier l’affaire')).not.toBeInTheDocument()
  })

  it('aucun CTA principal sur une affaire perdue — jamais un texte figé qui ne mène nulle part', () => {
    found({ stage: 'lost' })
    render(<ProjectDossierPage projectId={ID} />)
    expect(screen.queryByText('Qualifier l’affaire')).not.toBeInTheDocument()
    expect(screen.queryByText('Lancer le matching')).not.toBeInTheDocument()
  })
})

/**
 * #2951 — LA SECTION DOCUMENTS, absente de cette page en prod alors que le
 * tiroir la monte déjà (`ProjectDetailSheet.tsx`). Même composant, sur LE BON
 * projet — un second calcul romprait GA-26, un panneau monté sur le mauvais
 * projet serait pire qu'absent.
 */
describe('ProjectDossierPage — la section Documents (#2171.24)', () => {
  it('monte ProjectDocumentsPanel sur ce projet — dans l’onglet Activité (A5)', () => {
    found({ id: 'p-42' })
    render(<ProjectDossierPage projectId="p-42" initialTab="activity" />)
    expect(screen.getByTestId('project-documents-panel')).toHaveTextContent('p-42')
  })
})

/**
 * #3683.5/.6 — le retour ramène au dossier d'où l'on vient ; un projet retiré ou inaccessible est EXPLIQUÉ
 * (rien n'a été modifié), avec le chemin du retour — jamais une page muette ni un succès silencieux.
 */
describe('ProjectDossierPage — retour au compte d’origine (#3683.5/.6)', () => {
  const origin = { accountId: 'a-1', tab: 'veille' as const }

  it('ouvert depuis un compte : le retour nomme le dossier du compte, pas la liste du pipe', () => {
    found()
    render(<ProjectDossierPage projectId={ID} origin={origin} />)
    expect(screen.getByRole('link', { name: 'Retour au dossier du compte' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Retour aux affaires' })).not.toBeInTheDocument()
  })

  it('sans origine : le retour reste la liste du pipe (comportement d’avant)', () => {
    found()
    render(<ProjectDossierPage projectId={ID} />)
    expect(screen.getByRole('link', { name: 'Retour aux affaires' })).toBeInTheDocument()
  })

  it('projet retiré ou inaccessible : explication, « rien n’a été modifié » et retour au dossier du compte', () => {
    useProject.mockReturnValue({ project: null, isPending: false, isError: false, notFound: true, refetch: vi.fn() })
    render(<ProjectDossierPage projectId="p-gone" origin={origin} />)
    expect(screen.getByText(/Rien n’a été modifié/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour au dossier du compte' })).toBeInTheDocument()
  })
})

/**
 * Théo C projects-fiche — trois onglets (R1), la frise (R2), le bandeau unique (R3), trois boutons (R4).
 * Les trois onglets sont atteignables et chacun montre SON contenu : rien n'est caché, seulement rangé.
 */
describe('ProjectDossierPage — la fiche de Théo : onglets, boutons, bandeau', () => {
  it('porte Modifier · Avec Laura · Suivi en tête', () => {
    found()
    render(<ProjectDossierPage projectId={ID} />)
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avec Laura' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suivi' })).toBeInTheDocument()
  })

  it('« Préparer la proposition » ne s’offre qu’à partir de « Profils présentés » (rien à proposer avant)', () => {
    found({ stage: 'qualified' })
    const { unmount } = render(<ProjectDossierPage projectId={ID} />)
    expect(screen.queryByRole('link', { name: 'Préparer la proposition' })).not.toBeInTheDocument()
    unmount()
    found({ stage: 'profiles_submitted' })
    render(<ProjectDossierPage projectId={ID} />)
    expect(screen.getByRole('link', { name: 'Préparer la proposition' })).toBeInTheDocument()
  })

  it('« Créer la mission » seulement une fois l’affaire gagnée', () => {
    found({ stage: 'qualified' })
    const { unmount } = render(<ProjectDossierPage projectId={ID} />)
    expect(screen.queryByRole('link', { name: 'Créer la mission' })).not.toBeInTheDocument()
    unmount()
    found({ stage: 'won' })
    render(<ProjectDossierPage projectId={ID} />)
    expect(screen.getByRole('link', { name: 'Créer la mission' })).toBeInTheDocument()
  })

  it('la frise nomme les cinq étapes et allume celle de l’état stocké', () => {
    found({ stage: 'profiles_submitted' })
    render(<ProjectDossierPage projectId={ID} />)
    const frieze = screen.getByRole('list', { name: 'Étapes de l’affaire' })
    expect(frieze.textContent).toContain('À qualifier')
    expect(frieze.textContent).toContain('Gagnée')
    expect(screen.getByRole('button', { name: /Profils présentés/ })).toHaveAttribute('aria-current', 'step')
  })

  it('le lien « Toutes les présentations » mène à la liste filtrée sur l’affaire', () => {
    found()
    render(<ProjectDossierPage projectId={ID} initialTab="profiles" />)
    expect(screen.getByRole('link', { name: 'Toutes les présentations' })).toHaveAttribute(
      'href',
      '/projects/presentations',
    )
  })
})

// Refonte Théo C (`projects-fiche`) — trois VRAIS onglets soulignés, des panneaux à titre, aucune probabilité.
describe('ProjectDossierPage — structure de la maquette', () => {
  it('trois onglets dans l’ordre Besoin · Profils & présentations · Activité ; un seul est sélectionné', () => {
    found()
    render(<ProjectDossierPage projectId={ID} />)
    const tabs = screen.getAllByRole('tab').map(tab => tab.textContent)
    expect(tabs).toEqual(['Besoin', 'Profils & présentations', 'Activité'])
    expect(screen.getByRole('tab', { name: 'Besoin' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: /Activité/ }))
    expect(screen.getByRole('tab', { name: /Activité/ })).toHaveAttribute('aria-selected', 'true')
    // Un onglet n'affiche QUE son contenu : le panneau « Le besoin » est parti.
    expect(screen.queryByRole('heading', { name: 'Le besoin' })).toBeNull()
  })

  it('l’onglet Besoin porte ses panneaux à titre, et SAIT DIRE NON à la probabilité', () => {
    found()
    render(<ProjectDossierPage projectId={ID} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Le besoin' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Contacts et partenaire' })).toBeInTheDocument()
    expect(screen.queryByText(/Calibrage de l’affaire/)).toBeNull()
  })
})
