import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'

const contact = vi.hoisted(() => ({ email: 'julien.carre@sncf.example' as string | null }))
const createDraft = vi.fn()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Maëlle' }))
vi.mock('@/features/contacts/hooks/useContact', () => ({
  useContact: () => ({ data: { email: contact.email } }),
}))
vi.mock('@/features/mailbox/api', () => ({
  useCreateDraft: () => ({ mutate: createDraft, isPending: false }),
}))

const { MissionPointClientDialog } = await import('./MissionPointClientDialog')

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: 'm1',
    workspace_id: 'w',
    account_id: 'a1',
    opportunity_id: null,
    label: 'Fiabilisation plateforme',
    status: 'active',
    started_on: '2026-04-01',
    ends_on: '2026-11-30',
    daily_rate: null,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: null,
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: '2026-04-01T00:00:00.000Z',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    accountName: 'SNCF',
    assignees: [{ id: 'c1', fullName: 'Yanis Berthier', photoUrl: null }],
    marginPercent: null,
    clientManagerName: 'Julien Carré',
    clientManagerContactId: 'ct1',
    ...over,
  }
}

afterEach(() => {
  cleanup()
  createDraft.mockReset()
  contact.email = 'julien.carre@sncf.example'
})

const open = (over: Partial<MissionView> = {}) =>
  render(<MissionPointClientDialog mission={mission(over)} open onOpenChange={() => undefined} />)

// Théo missions-dossier.R4 + décision de Louis : la fenêtre s'ouvre DÉJÀ rédigée, jamais un champ vide.
describe('MissionPointClientDialog', () => {
  it('s’ouvre déjà rédigée : objet, message et destinataire sont remplis', () => {
    open()
    expect(screen.getByLabelText('Objet')).toHaveValue('Point de suivi — Fiabilisation plateforme')
    const body = screen.getByLabelText('Message à relire') as HTMLTextAreaElement
    expect(body.value).toContain('Bonjour Julien,')
    expect(body.value).toContain('Yanis Berthier')
    expect(body.value).toContain('30 nov.')
    expect(screen.getByLabelText('Destinataire')).toHaveValue('Julien Carré · julien.carre@sncf.example')
  })

  it('le message est modifiable, et « Régénérer » le reprend de zéro', async () => {
    open()
    const body = screen.getByLabelText('Message à relire') as HTMLTextAreaElement
    await userEvent.clear(body)
    await userEvent.type(body, 'Mon texte')
    expect(body.value).toBe('Mon texte')
    await userEvent.click(screen.getByRole('button', { name: 'Régénérer' }))
    expect(body.value).toContain('Bonjour Julien,')
  })

  it('« Plus court » raccourcit, « Plus direct » pose la question de la suite d’emblée', async () => {
    open()
    const body = screen.getByLabelText('Message à relire') as HTMLTextAreaElement
    const before = body.value.length
    await userEvent.click(screen.getByRole('button', { name: 'Plus court' }))
    expect(body.value.length).toBeLessThan(before)
    await userEvent.click(screen.getByRole('button', { name: 'Plus direct' }))
    expect(body.value).toMatch(/comment envisages-tu/i)
  })

  it('« Conserver le brouillon » dépose un brouillon à l’adresse du contact — et n’envoie rien', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Conserver le brouillon' }))
    expect(createDraft).toHaveBeenCalledTimes(1)
    const [payload] = createDraft.mock.calls[0] as [{ to: string; subject: string; body: string }]
    expect(payload.to).toBe('julien.carre@sncf.example')
    expect(payload.subject).toBe('Point de suivi — Fiabilisation plateforme')
    expect(screen.getByText(/aucun message/i)).toBeInTheDocument()
  })

  it('sans adresse connue, le dit et ne devine aucune adresse : le bouton reste inactif', () => {
    contact.email = null
    open()
    expect(screen.getByRole('button', { name: 'Conserver le brouillon' })).toBeDisabled()
    expect(screen.getByText(/adresse e-mail de l’interlocuteur n’est pas renseignée/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Message à relire')).not.toHaveValue('')
  })

  it('sans interlocuteur client désigné, le dit', () => {
    open({ clientManagerName: null, clientManagerContactId: null })
    expect(screen.getByRole('button', { name: 'Conserver le brouillon' })).toBeDisabled()
    expect(screen.getAllByText(/aucun interlocuteur client n’est désigné/i).length).toBeGreaterThan(0)
  })
})
