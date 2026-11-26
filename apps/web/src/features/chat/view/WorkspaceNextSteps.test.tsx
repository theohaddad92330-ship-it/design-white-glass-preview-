import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceNextSteps, resetWorkspaceProgressCache } from './WorkspaceNextSteps'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => (opts?.count === undefined ? key : `${key}|${opts.count}`),
  }),
}))

function renderSteps(onPrefill = vi.fn()) {
  render(<WorkspaceNextSteps onPrefill={onPrefill} />)
  return onPrefill
}

beforeEach(() => {
  apiFetch.mockReset()
  resetWorkspaceProgressCache()
})

// #5011.1 / #5011.2 — la suite suit l'avancement compté, et cite le fait.
describe('WorkspaceNextSteps (#5011)', () => {
  it('espace vide : cite le fait et propose la première étape, qui pose un texte sans l’envoyer', async () => {
    apiFetch.mockResolvedValue({ accounts: 0, contacts: 0, actions: 0 })
    const onPrefill = renderSteps()
    expect(await screen.findByText('workspaceNext.fact.workspace_no_account')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'workspaceNext.step.analyze_account' }))
    expect(onPrefill).toHaveBeenCalledWith('workspaceNext.prompt.analyze_account')
    expect(screen.getByRole('button', { name: 'workspaceNext.step.import_accounts' })).toBeInTheDocument()
  })

  it('comptes sans contact : le fait porte le nombre compté', async () => {
    apiFetch.mockResolvedValue({ accounts: 12, contacts: 0, actions: 0 })
    renderSteps()
    expect(await screen.findByText('workspaceNext.fact.workspace_accounts_no_contact|12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'workspaceNext.step.find_contacts' })).toBeInTheDocument()
  })

  it('espace avancé : rien n’est inventé', async () => {
    apiFetch.mockResolvedValue({ accounts: 12, contacts: 30, actions: 4 })
    renderSteps()
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('lecture en échec : aucune suite devinée', async () => {
    apiFetch.mockImplementation(() => Promise.reject(new Error('500')))
    renderSteps()
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.queryByRole('group')).toBeNull()
  })
})
