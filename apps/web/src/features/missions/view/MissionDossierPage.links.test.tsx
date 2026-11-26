import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// #4198 (L7) — la fiche mission PLEINE PAGE montre l'affaire d'origine (zone
// « Objets liés ») et les actions de cycle (`MissionLifecycleActions`, L5).
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/components/access/PrivateSwitch', () => ({ PrivateSwitch: () => null }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({ ChainProgressBlock: () => null }))
vi.mock('../chain/view/MissionChainStrip', () => ({ MissionChainStrip: () => null }))
vi.mock('./MissionDetailTabs', () => ({ MissionDetailTabs: () => null }))
vi.mock('./MissionBusinessUnitLine', () => ({ MissionBusinessUnitLine: () => null }))
vi.mock('./MissionPrimaryActionBanner', () => ({ MissionPrimaryActionBanner: () => null }))
vi.mock('./MissionStartBlockers', () => ({ MissionStartBlockers: () => null }))
vi.mock('./MissionMeetingPrepCard', () => ({
  MissionMeetingPrepCard: ({ accountId }: { accountId: string }) => (
    <div data-testid="meeting-prep-card">{accountId}</div>
  ),
}))
vi.mock('./MissionEndChecklistPanel', () => ({ MissionEndChecklistPanel: () => null }))
vi.mock('./MissionDeliveryMilestonesPanel', () => ({ MissionDeliveryMilestonesPanel: () => null }))
vi.mock('./MissionInterruptionPanel', () => ({ MissionInterruptionPanel: () => null }))
vi.mock('./MissionRepositioningPanel', () => ({ MissionRepositioningPanel: () => null }))
vi.mock('./MissionLifecycleActions', () => ({
  MissionLifecycleActions: () => null,
  MissionLifecycleDialog: ({ mission, kind }: { mission: { id: string }; kind: string }) => (
    <div data-testid="lifecycle-actions">{`${mission.id}:${kind}`}</div>
  ),
  canRunLifecycle: () => true,
}))
vi.mock('@/features/records/useRecordLinks', () => ({
  useRecordLinks: () => ({
    data: {
      links: [
        {
          kind: 'opportunity',
          items: [{ kind: 'opportunity', id: 'p-1', label: 'Plateforme data', status: 'won' }],
        },
      ],
    },
  }),
}))
vi.mock('../api', () => ({
  useMission: () => ({
    mission: {
      id: 'm-1',
      account_id: 'a-1',
      label: 'Renfort plateforme',
      status: 'active',
      contract_kind: 'regie',
      is_private: false,
      accountName: 'ACME',
      assignees: [],
    },
    canReadFinance: true,
    isPending: false,
    isError: false,
    notFound: false,
    refetch: vi.fn(),
  }),
  useMissionFieldSources: () => ({ data: undefined }),
  assigneesOf: () => [],
  assigneeNames: () => [],
}))

const { MissionDossierPage } = await import('./MissionDossierPage')

afterEach(cleanup)

describe('MissionDossierPage — fiche complète', () => {
  it('montre l’affaire d’origine, cliquable', () => {
    render(<MissionDossierPage missionId="m-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Plateforme data/ }))
    expect(navigate).toHaveBeenCalledWith({ to: '/projects/$id', params: { id: 'p-1' } })
  })

  it('monte les actions de cycle sur CETTE mission (menu « ⋯ » du dossier)', async () => {
    render(<MissionDossierPage missionId="m-1" />)
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.click(screen.getByRole('button', { name: 'Plus d’actions sur la mission' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Terminer' }))
    expect(screen.getByTestId('lifecycle-actions').textContent).toBe('m-1:end')
  })
})
