import { screen } from '@testing-library/react'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { Table, TableBody } from '@bellum/ui'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactTableRow } from './ContactTableRow'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

/**
 * #4295.11 (recette D3 01/11) — un contact de la liste « ne pas contacter » ne se lit JAMAIS « À contacter » :
 * la colonne « Relation » dit « Ne pas contacter », comme le badge de la ligne.
 */
const dnc = vi.hoisted(() => ({ items: [] as unknown[] }))
vi.mock('@/features/team-guardrails/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/team-guardrails/hooks')>()),
  useDoNotContactList: () => ({ data: { items: dnc.items } }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/contacts/hooks/useAssignContacts', () => ({
  useAssignContacts: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}))

beforeAll(() => {
  window.scrollTo = vi.fn()
})
beforeEach(() => {
  dnc.items = []
})

function makeContact(): GlobalContact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Gaëtan Lemoine',
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 5,
    email: 'gaetan@corp.co',
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
  }
}

function draw() {
  return renderWithRouter(
    <Table>
      <TableBody>
        <ContactTableRow
          contact={makeContact()}
          isSelected={false}
          onRowMouseDown={() => {}}
          onRowMouseEnter={() => {}}
          onSelectionChange={() => {}}
        />
      </TableBody>
    </Table>,
    '/',
  )
}

it('#4295.11 — listé « ne pas contacter » : la relation ne dit pas « À contacter »', async () => {
  dnc.items = [{ kind: 'contact', contact_id: 'c1', reason: 'Demande du client' }]
  draw()
  await screen.findByText('Gaëtan Lemoine')
  expect(screen.getByTestId('contact-row-relation')).toHaveTextContent('Ne pas contacter')
  expect(screen.getByTestId('contact-row-relation')).not.toHaveTextContent('À contacter')
})

it('sait dire NON : non listé, la relation reste « À contacter »', async () => {
  draw()
  await screen.findByText('Gaëtan Lemoine')
  expect(screen.getByTestId('contact-row-relation')).toHaveTextContent('À contacter')
})
