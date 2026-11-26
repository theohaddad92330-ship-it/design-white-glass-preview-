import type { OrgGraph, WorkspaceRole } from '@bellum/contracts'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import type { FocalPersonCard } from './focalOrgData'
import { OrgPersonPanel } from './OrgPersonPanel'

/**
 * #4509 (décision Louis 24/10 : « Oui, dans la PR 12 ») — « Créer sa fiche » dans le panneau d'un nœud sans fiche.
 * Le formulaire de création est l'EXISTANT (`CreateContactDialog`), prérempli ; rien n'est écrit avant la validation.
 */
const role: { current: WorkspaceRole | undefined } = { current: 'sales' }
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: role.current ? { workspace: { role: role.current } } : undefined }),
}))

const dialogProps = vi.fn()
vi.mock('@/features/crm-core/view/CreateContactDialog', () => ({
  CreateContactDialog: (props: {
    accountId?: string
    open: boolean
    initialValues?: { fullName?: string; title?: string }
  }) => {
    dialogProps(props)
    return props.open ? <div role="dialog" aria-label="create-contact-stub" /> : null
  },
}))
vi.mock('./corrections/OrgCorrectionDrawer', () => ({ OrgCorrectionDrawer: () => null }))
vi.mock('./OrgPersonNode', () => ({ OrgPersonNode: () => <span>node</span> }))

const person = { id: 'p-1', fullName: 'Claudia Werner', title: 'Engineering Director' } as FocalPersonCard
const graph = {} as OrgGraph
const label = (key: string) => i18n.t(`accountOrg:${key}`) as string

function mount(props: { accountId?: string } = { accountId: 'acc-1' }) {
  return render(<OrgPersonPanel person={person} graph={graph} onClose={() => {}} {...props} />)
}

describe('OrgPersonPanel — « Créer sa fiche »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    dialogProps.mockClear()
    role.current = 'sales'
  })

  it('une personne sans fiche, pour qui peut écrire : le bouton ouvre le formulaire PRÉREMPLI (nom, fonction, compte)', () => {
    mount()
    const panel = screen.getByTestId('org-person-panel-create')
    expect(dialogProps.mock.calls.every(([props]) => props.open === false)).toBe(true)
    fireEvent.click(within(panel).getByRole('button', { name: label('personPanel.createRecord') }))
    const last = dialogProps.mock.calls.at(-1)?.[0]
    expect(last).toMatchObject({
      open: true,
      accountId: 'acc-1',
      initialValues: { fullName: 'Claudia Werner', title: 'Engineering Director' },
    })
    expect(screen.getByRole('dialog', { name: 'create-contact-stub' })).toBeInTheDocument()
  })

  it('NON : sans le droit d’écrire (viewer, finance), le bouton est absent', () => {
    for (const denied of ['viewer', 'finance'] as const) {
      role.current = denied
      const { unmount } = mount()
      expect(screen.queryByRole('button', { name: label('personPanel.createRecord') })).toBeNull()
      expect(screen.queryByTestId('org-person-panel-create')).toBeNull()
      unmount()
    }
  })

  it('NON : tant que le rôle n’est pas résolu, ou sans compte, le bouton est absent', () => {
    role.current = undefined
    const first = mount()
    expect(screen.queryByRole('button', { name: label('personPanel.createRecord') })).toBeNull()
    first.unmount()
    role.current = 'sales'
    mount({})
    expect(screen.queryByRole('button', { name: label('personPanel.createRecord') })).toBeNull()
  })

  it('EN aussi', async () => {
    await i18n.changeLanguage('en')
    mount()
    expect(screen.getByRole('button', { name: 'Create their record' })).toBeInTheDocument()
  })
})
