import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAnalysisStore } from '@/stores/analysisStore'
import { BackgroundTasksIndicator } from './BackgroundTasksIndicator'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
}))
vi.mock('@/features/accounts/hooks/useCancelAnalysis', () => ({
  useCancelAnalysis: () => ({ mutate: vi.fn(), isPending: false }),
}))

/**
 * #4541 — la barre « En cours » est retirée : la pastille reste le seul signal global d'une analyse
 * qui tourne. Rien ne tourne → elle ne rend RIEN (jamais « 0 », GA-18 / GA-19).
 */
describe('#4541 — BackgroundTasksIndicator, la pastille des tâches de fond', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
  })

  it('aucune analyse vivante : ni pastille ni « 0 »', () => {
    const { container } = render(<BackgroundTasksIndicator />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une analyse vivante : la pastille apparaît, nommée, sans chiffre « 0 »', () => {
    useAnalysisStore.getState().adopt('acc-1', 'job-1', 'Acme')
    const { getByRole, container } = render(<BackgroundTasksIndicator />)
    expect(getByRole('button')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/(^|\s)0(\s|$)/)
  })
})
