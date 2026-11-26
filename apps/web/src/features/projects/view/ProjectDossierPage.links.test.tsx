import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// #4198 (L7) — la fiche opportunité PLEINE PAGE monte « Objets liés » :
// besoins, candidats, missions, chacun cliquable.
const navigate = vi.fn()
vi.mock('@/components/access/PrivateSwitch', () => ({ PrivateSwitch: () => null }))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
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
vi.mock('./ProjectDocumentsPanel', () => ({ ProjectDocumentsPanel: () => null }))
vi.mock('@/features/activities/view/TimelinePanel', () => ({ TimelinePanel: () => null }))
vi.mock('@/features/submissions/view/SubmissionsPanel', () => ({ SubmissionsPanel: () => null }))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({ ChainProgressBlock: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))
vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('../hooks/useProjectOwners', () => ({ useProjectOwners: () => ({ selfId: null, ownerName: () => null }) }))
vi.mock('@/features/records/useRecordLinks', () => ({
  useRecordLinks: () => ({
    data: {
      links: [
        { kind: 'need', items: [{ kind: 'need', id: 'n-1', label: 'Architecte data', status: 'open' }] },
        { kind: 'mission', items: [{ kind: 'mission', id: 'm-1', label: 'Renfort plateforme', status: 'active' }] },
      ],
    },
  }),
}))
vi.mock('../hooks/useProject', () => ({
  useProject: () => ({
    isPending: false,
    isError: false,
    notFound: false,
    refetch: vi.fn(),
    project: {
      id: 'p-1',
      account_id: 'a-1',
      company_name: 'ACME',
      label: 'Plateforme',
      kind: 'pain',
      stage: 'qualified',
      is_private: false,
      application_sector_codes: [],
    },
  }),
}))

const { ProjectDossierPage } = await import('./ProjectDossierPage')

afterEach(cleanup)

describe('ProjectDossierPage — objets liés', () => {
  it('liste les besoins et missions de l’affaire, cliquables', () => {
    render(<ProjectDossierPage projectId="p-1" initialTab="activity" />)
    fireEvent.click(screen.getByRole('button', { name: /Architecte data/ }))
    expect(navigate).toHaveBeenCalledWith({ to: '/projects/needs/$needId', params: { needId: 'n-1' } })
    expect(screen.getByRole('button', { name: /Renfort plateforme/ })).toBeTruthy()
  })
})
