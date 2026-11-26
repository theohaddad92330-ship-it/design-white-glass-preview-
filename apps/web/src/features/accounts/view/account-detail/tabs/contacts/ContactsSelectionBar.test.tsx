import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { ContactsSelectionBar } from './ContactsSelectionBar'

/**
 * #2120.71-75 (+ .43) — agir sur PLUSIEURS contacts du dossier à la fois, en
 * connaissant le coût avant le clic.
 */
const mutateAsync = vi.fn()
const assignMutate = vi.fn()
const planMutate = vi.fn()
const downloadCSV = vi.fn()

vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: { enrichment_credits: 12 } }),
}))
vi.mock('@/features/contacts/hooks/useAssignContacts', () => ({
  useAssignContacts: () => ({ mutate: assignMutate, isPending: false }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [{ userId: 'u1', fullName: 'Léa Martin', email: null, role: 'member', isSelf: false }],
  }),
}))
vi.mock('@/features/contacts/hooks/useAddContactsToPlan', () => ({
  useAddContactsToPlan: () => ({ mutate: planMutate, isPending: false }),
}))
vi.mock('@/lib/export-csv', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  downloadCSV: (...args: unknown[]) => downloadCSV(...args),
}))
type SequenceDialogProps = {
  open: boolean
  initialContacts: { full_name: string; email_message?: { subject: string; body: string } | null }[]
  initialName?: string
  campaignContext?: Record<string, unknown>
}
const sequenceDialogProps: { last: SequenceDialogProps | null } = { last: null }
vi.mock('@/features/outreach/view/CreateSequenceDialog', () => ({
  CreateSequenceDialog: (props: SequenceDialogProps) => {
    sequenceDialogProps.last = props
    return props.open ? (
      <div data-testid="sequence-dialog">{props.initialContacts.map(c => c.full_name).join(',')}</div>
    ) : null
  },
}))

function contact(id: string, full_name: string, patch: Partial<Contact> = {}): Contact {
  return {
    id,
    full_name,
    account_id: 'acc-1',
    title: 'DSI',
    entity: 'Groupe',
    decision_role: null,
    priority: 1,
    email: null,
    phone: null,
    linkedin_url: null,
    ...patch,
  } as unknown as Contact
}

const ALICE = contact('c1', 'Alice Martin')
const BOB = contact('c2', 'Bob Durand', { email: 'bob@acme.fr' })

function renderBar(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const baseProps = {
  accountCompanyName: 'ACME',
  matchingCount: 5,
  onSelectAllMatching: () => {},
  onClear: () => {},
}

const MENU_INTERACTION_MS = 20_000

beforeEach(() => {
  mutateAsync.mockReset()
  mutateAsync.mockResolvedValue({ ...ALICE, email: 'alice@acme.fr', credits_remaining: 11 })
  assignMutate.mockReset()
  planMutate.mockReset()
  downloadCSV.mockReset()
})

describe('ContactsSelectionBar — #2120.71 enrichir en lot, coût annoncé avant le clic', () => {
  it('le bouton ne porte aucun coût (#4463), puis n’enrichit que les contacts facturables après confirmation', async () => {
    const user = userEvent.setup()
    renderBar(<ContactsSelectionBar {...baseProps} selectedContacts={[ALICE, BOB]} />)

    // Bob a déjà un e-mail : seul Alice est facturable — le bouton le dit AVANT.
    await user.click(screen.getByRole('button', { name: 'Enrichir maintenant' }))
    expect(mutateAsync).not.toHaveBeenCalled()

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enrichir' }))
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ contact: ALICE, accountCompanyName: 'ACME', silent: true }),
    )
  })

  it('sait dire NON : rien de facturable → aucun débit possible, et jamais « 0 crédit »', () => {
    renderBar(<ContactsSelectionBar {...baseProps} selectedContacts={[BOB]} />)
    expect(screen.getByRole('button', { name: /Rien à enrichir/ })).toBeDisabled()
    expect(screen.queryByText(/0 crédit/)).not.toBeInTheDocument()
  })
})

describe('ContactsSelectionBar — #2120.72-75 les autres gestes de lot', () => {
  it('#2120.72 exporte la sélection en CSV', async () => {
    const user = userEvent.setup()
    renderBar(<ContactsSelectionBar {...baseProps} selectedContacts={[ALICE, BOB]} />)
    await user.click(screen.getByRole('button', { name: 'Exporter (CSV)' }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, filename] = downloadCSV.mock.calls[0] as [string, string]
    expect(csv).toContain('Alice Martin')
    expect(csv).toContain('bob@acme.fr')
    expect(filename).toMatch(/\.csv$/)
  })

  it('#2120.74 ajoute la sélection au plan d’action', async () => {
    const user = userEvent.setup()
    renderBar(<ContactsSelectionBar {...baseProps} selectedContacts={[ALICE, BOB]} />)
    await user.click(screen.getByRole('button', { name: "Ajouter au plan d'action" }))
    expect(planMutate).toHaveBeenCalledWith([ALICE, BOB])
  })

  it(
    '#2120.73 attribue la sélection à un membre RÉEL de l’espace',
    async () => {
      const user = userEvent.setup()
      renderBar(<ContactsSelectionBar {...baseProps} selectedContacts={[ALICE, BOB]} />)
      await user.click(screen.getByRole('button', { name: /Attribuer à/ }))
      await user.click(await screen.findByText('Léa Martin'))
      expect(assignMutate).toHaveBeenCalledWith({
        contactIds: ['c1', 'c2'],
        assignedTo: 'u1',
        assigneeName: 'Léa Martin',
      })
    },
    MENU_INTERACTION_MS,
  )

  it('#2120.75 / .43 prépare une séquence avec la sélection — rien ne part sans le clic du commercial', async () => {
    const user = userEvent.setup()
    renderBar(<ContactsSelectionBar {...baseProps} selectedContacts={[ALICE, BOB]} />)
    expect(screen.queryByTestId('sequence-dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter à une séquence' }))
    expect(screen.getByTestId('sequence-dialog')).toHaveTextContent('Alice Martin,Bob Durand')
    expect(screen.getByText(/rien ne part sans ton clic/i)).toBeInTheDocument()
  })

  /**
   * R15-9 (recette du 15/09/2026, prod `5ca597d5a`, dossier THALES) — LE
   * LIBELLÉ DE SÉLECTION DE MASSE NE MENT PAS.
   *
   * Mesuré à l'écran : « Sélectionner les 2027 contacts AFFICHÉS », sous une
   * liste qui en rendait 116. Un export CSV ou une attribution serait parti sur
   * 2 027 personnes dont l'utilisateur en avait vu cent seize. Le geste, lui,
   * est bon : il porte sur ce que les FILTRES retiennent — c'est le mot
   * « affichés » qui désignait des lignes que personne n'a vues.
   *
   * Le compte et son nom sont donc réunis : la propriété s'appelle
   * `matchingCount`, et le libellé dit « retenus par les filtres ».
   */
  it('compte la sélection et nomme ce que le geste retient — les filtres, pas l’écran', async () => {
    const user = userEvent.setup()
    const onSelectAllMatching = vi.fn()
    renderBar(
      <ContactsSelectionBar {...baseProps} onSelectAllMatching={onSelectAllMatching} selectedContacts={[ALICE, BOB]} />,
    )
    expect(screen.getByText('2 contacts sélectionnés')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sélectionner les 5 contacts retenus par les filtres' }))
    expect(onSelectAllMatching).toHaveBeenCalledTimes(1)
  })

  it('sait dire NON : le mot « affichés » ne désigne plus des lignes non rendues', () => {
    renderBar(<ContactsSelectionBar {...baseProps} selectedContacts={[ALICE]} />)
    expect(screen.queryByRole('button', { name: /contacts affichés/ })).not.toBeInTheDocument()
  })
})

/**
 * #2123.80 — plusieurs contacts du dossier ouvrent Séquences PRÉREMPLI : le
 * compte, l'audience, l'objectif et les messages. Seuls les contacts partaient
 * (`initialContacts`) ; les trois autres se reconstituaient à la main.
 */
describe('ContactsSelectionBar — #2123.80 Séquences s’ouvre prérempli depuis le dossier', () => {
  const PLAN = {
    plan: {
      actionPlan: {
        phases: [
          { title: 'Immédiat', objective: '', actions: [] },
          { title: 'Mois 1', objective: 'Ouvrir la DSI Retail', actions: [] },
        ],
      },
    },
  }
  const WITH_DRAFT = contact('c3', 'Chloé Petit', {
    title: 'RSSI',
    linkedin_url: 'https://www.linkedin.com/in/chloe',
    email_message: { subject: 'Audit DORA', body: 'Bonjour Chloé…' },
  } as Partial<Contact>)

  beforeEach(() => {
    sequenceDialogProps.last = null
  })

  it('porte le compte, l’audience, l’objectif du plan et les brouillons des contacts', async () => {
    const user = userEvent.setup()
    renderBar(<ContactsSelectionBar {...baseProps} rawAnalysis={PLAN} selectedContacts={[WITH_DRAFT, BOB]} />)
    await user.click(screen.getByRole('button', { name: 'Ajouter à une séquence' }))

    const props = sequenceDialogProps.last
    expect(props?.initialName).toBe('ACME')
    expect(props?.campaignContext).toEqual({
      source: 'account',
      objective: 'Ouvrir la DSI Retail',
      persona: 'RSSI, DSI',
      channels: ['email', 'linkedin'],
    })
    expect(props?.initialContacts.map(c => c.email_message)).toEqual([
      { subject: 'Audit DORA', body: 'Bonjour Chloé…' },
      null,
    ])
  })

  it('SAIT DIRE NON — sans plan lisible, aucun objectif inventé ; sans titre, aucune audience devinée', async () => {
    const user = userEvent.setup()
    const untitled = contact('c4', 'Dan Roux', { title: null } as Partial<Contact>)
    renderBar(<ContactsSelectionBar {...baseProps} rawAnalysis={{}} selectedContacts={[untitled]} />)
    await user.click(screen.getByRole('button', { name: 'Ajouter à une séquence' }))

    const context = sequenceDialogProps.last?.campaignContext
    expect(context).toEqual({ source: 'account' })
    expect(context).not.toHaveProperty('objective')
    expect(context).not.toHaveProperty('persona')
  })
})
