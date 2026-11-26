import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'

const { listForConsultant, benchPush } = vi.hoisted(() => ({
  listForConsultant: vi.fn(),
  benchPush: vi.fn(),
}))
vi.mock('@/features/outreach/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/outreach/api')>()),
  outreachApi: { listForConsultant, benchPush },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/actions/sequences">{children}</a>,
}))

const { ProposeProfileButton } = await import('./ProposeProfileButton')

const CONSULTANT = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '33333333-3333-4333-8333-333333333333'
const contacts = [
  { id: 'ct-1', full_name: 'Marie Dubois', title: 'DSI' },
  { id: 'ct-2', full_name: 'Paul Leroy', title: null },
] as unknown as Contact[]

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProposeProfileButton
        consultantId={CONSULTANT}
        accountId={ACCOUNT}
        accountName="Thales"
        accountContext="Data engineer"
        contacts={contacts}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listForConsultant.mockReset().mockResolvedValue([])
  benchPush.mockReset().mockResolvedValue({ id: 'seq-1' })
})
afterEach(cleanup)

describe('ProposeProfileButton (#5029)', () => {
  it('#5029.1 — dit « déjà proposé » quand une séquence existe pour ce consultant et CE compte', async () => {
    listForConsultant.mockResolvedValue([{ id: 'seq-0', account_id: ACCOUNT }])
    renderButton()
    expect(await screen.findByText('Déjà proposé à ce compte')).toBeTruthy()
    expect(listForConsultant).toHaveBeenCalledWith(CONSULTANT)
  })

  it('une séquence pour un AUTRE compte ne marque pas celui-ci', async () => {
    listForConsultant.mockResolvedValue([{ id: 'seq-0', account_id: 'other' }])
    renderButton()
    await waitFor(() => expect(listForConsultant).toHaveBeenCalled())
    expect(screen.queryByText('Déjà proposé à ce compte')).toBeNull()
  })

  it('#5029.3 — UN contact choisi, UNE séquence créée ; aucun choix multiple', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Proposer ce profil' }))
    const confirm = screen.getByRole('button', { name: 'Préparer la séquence' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getAllByRole('radio')).toHaveLength(2)

    fireEvent.click(screen.getByRole('radio', { name: /Marie Dubois/ }))
    fireEvent.click(confirm)

    await waitFor(() => expect(benchPush).toHaveBeenCalledTimes(1))
    expect(benchPush).toHaveBeenCalledWith({
      consultant_id: CONSULTANT,
      contact_id: 'ct-1',
      account_context: 'Data engineer',
    })
    expect(
      await screen.findByText('Séquence préparée : le premier e-mail t’attend, à relire avant tout envoi.'),
    ).toBeTruthy()
  })
})
