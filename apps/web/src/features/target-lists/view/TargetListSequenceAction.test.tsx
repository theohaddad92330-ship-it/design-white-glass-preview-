import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CampaignAudienceResult } from '@bellum/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Golden journey 29 (#2208.60 / #2958.60) — « créer une séquence depuis une
 * cible » : la liste de cibles est une SOURCE de l'audience (`target_list`),
 * le geste est sur la carte de la liste, la fenêtre est la MÊME que partout
 * (`CreateSequenceDialog`), montée avec les contacts que le serveur juge
 * éligibles. Ce qui sort est NOMMÉ avec sa raison, jamais tu.
 */
const preview = vi.fn()
vi.mock('@/features/outreach/api', () => ({
  campaignAudienceApi: { preview: (...args: unknown[]) => preview(...args), events: vi.fn() },
}))
const dialogProps = vi.fn()
vi.mock('@/features/outreach/view/CreateSequenceDialog', () => ({
  CreateSequenceDialog: (props: {
    open: boolean
    initialName?: string
    initialContacts?: readonly { id: string; full_name: string; email: string | null }[]
  }) => {
    dialogProps(props)
    return props.open ? (
      <div role="dialog" aria-label="dialogue séquence">
        {props.initialContacts?.map(contact => (
          <span key={contact.id}>{contact.full_name}</span>
        ))}
      </div>
    ) : null
  },
}))

const { TargetListSequenceAction } = await import('./TargetListSequenceAction')

const RESULT: CampaignAudienceResult = {
  eligible: [
    {
      contact_id: 'c-1',
      full_name: 'Claire Martin',
      title: 'DSI',
      account_id: 'a-1',
      account_name: 'Banque Alpha',
      assigned_to: null,
      email: 'claire@alpha.test',
      sequence_scope: 'mono_contact',
      duplicate_suspected: false,
      identity_unverified: false,
      owned_by_other: false,
      already_contacted: false,
    },
  ],
  excluded: [{ contact_id: 'c-2', full_name: 'Paul Durand', reason: 'already_in_sequence' }],
  duplicates: [],
  collisions: [],
  preview: {
    total: 2,
    eligible: 1,
    missing_coordinates: 0,
    unverified_identity: 0,
    already_in_sequence: 1,
    already_contacted: 0,
    duplicates: 0,
    other_owner: 0,
    excluded_accounts: 0,
    left_contacts: 0,
    team_collisions: 0,
    frequency_capped: 0,
    personal_contacts: 0,
  },
}

function renderAction(hasLiveItems = true) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TargetListSequenceAction
        listId="list-1"
        listName="Banques T4"
        hasLiveItems={hasLiveItems}
        buttonClassName="btn"
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  preview.mockReset()
  dialogProps.mockReset()
})

describe('TargetListSequenceAction', () => {
  it('lit l’audience de LA liste (source target_list), puis ouvre la fenêtre de séquence avec les éligibles', async () => {
    preview.mockResolvedValue(RESULT)
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: /Banques T4/ }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(preview).toHaveBeenCalledWith({ source: { kind: 'target_list', target_list_id: 'list-1' }, filters: {} })
    expect(screen.getByText('Claire Martin')).toBeTruthy()
    const last = dialogProps.mock.calls.at(-1)?.[0] as { initialName?: string; initialContacts?: { email: string }[] }
    expect(last.initialName).toBe('Banques T4')
    expect(last.initialContacts?.[0]?.email).toBe('claire@alpha.test')
  })

  it('nomme ce qui est écarté et pourquoi — jamais un contact qui disparaît en silence', async () => {
    preview.mockResolvedValue(RESULT)
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: /Banques T4/ }))
    await screen.findByText(/Paul Durand/)
    expect(screen.getByText(/déjà dans une séquence/i)).toBeTruthy()
  })

  it('aucun éligible : le dit, n’ouvre aucune fenêtre', async () => {
    preview.mockResolvedValue({ ...RESULT, eligible: [], preview: { ...RESULT.preview, eligible: 0 } })
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: /Banques T4/ }))
    await screen.findByText(/Aucun contact éligible/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('échec de lecture : erreur claire, jamais une audience inventée', async () => {
    preview.mockRejectedValue(new Error('boom'))
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: /Banques T4/ }))
    await screen.findByRole('alert')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('liste sans fiche vivante : le geste n’existe pas (une absence ne fait aucune ligne)', () => {
    renderAction(false)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
