import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { AccountCrmProvenance, AccountCrmSays } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountCrmProvenanceProvider } from '@/features/crm/hooks/useAccountCrmProvenance'
import { AccountCrmSaysCard, CrmFieldSourceTag } from './AccountCrmSays'

let teamRole: string | null = 'owner'
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: teamRole ? { workspace: { role: teamRole } } : null }),
}))

// #4604 — dans la fiche fusionnée (#4603), voir ce qui vient du CRM : par champ, et dans un bloc dédié.
const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

const CRM: AccountCrmSays = {
  provider: 'pipedrive',
  deals: [
    {
      title: 'Renouvellement 2027',
      stage: 'Négociation',
      status: 'open',
      amount: 120000,
      currency: 'EUR',
      ownerName: 'Claire Martin',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
  ],
  activities: [{ kind: 'meeting', occurredAt: '2026-10-22T09:00:00.000Z' }],
  fields: [
    { field: 'company_name', source: 'crm' },
    { field: 'siren', source: 'human' },
  ],
  fusion: { mergedAt: '2026-10-26T08:00:00.000Z', absorbedName: 'VEEPEE', id: 'f-1' },
}

let seq = 0
function render(ui: React.ReactNode, crm: AccountCrmSays | null) {
  const accountId = `a-${(seq += 1)}`
  const provenance: AccountCrmProvenance = { accountFromCrm: true, contacts: [], ...(crm ? { crm } : {}) }
  apiFetchMock.mockReset()
  apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
    if (options.path === `/crm/push/accounts/${accountId}/provenance`) return provenance
    throw new Error(`appel inattendu : ${options.path}`)
  })
  return renderWithRouter(<AccountCrmProvenanceProvider accountId={accountId}>{ui}</AccountCrmProvenanceProvider>)
}

describe('#4604 — la provenance par champ, là où on lit la valeur', () => {
  it('une valeur venue du CRM dit « vient de Pipedrive » — l’outil BRANCHÉ par le client', async () => {
    render(<CrmFieldSourceTag field="company_name" />, CRM)
    expect(await screen.findByText('vient de Pipedrive')).toBeInTheDocument()
  })

  it('une valeur corrigée à la main le dit : la version humaine est celle qu’on lit', async () => {
    render(<CrmFieldSourceTag field="siren" />, CRM)
    expect(await screen.findByText('corrigé dans Bellum')).toBeInTheDocument()
  })

  it('une provenance inconnue ne porte AUCUNE étiquette (jamais devinée)', async () => {
    const { container } = render(<CrmFieldSourceTag field="company_name" />, { ...CRM, fields: [] })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(container.querySelector('[data-crm-field-source]')).toBeNull()
  })
})

describe('#4604 — le bloc « Ce que dit ton CRM »', () => {
  it('porte le nom du CRM du client, le propriétaire, l’étape, les affaires, les activités et la fusion', async () => {
    render(<AccountCrmSaysCard />, CRM)
    expect(await screen.findByRole('heading', { name: 'Ce que dit ton CRM · Pipedrive' })).toBeInTheDocument()
    expect(screen.getByText(/Claire Martin/)).toBeInTheDocument()
    expect(screen.getByText('Étape : Négociation')).toBeInTheDocument()
    expect(screen.getByText(/1 affaire/)).toBeInTheDocument()
    expect(screen.getByText(/1 activité/)).toBeInTheDocument()
    expect(screen.getByText(/VEEPEE/)).toBeInTheDocument()
  })

  it('une absence ne fait aucune ligne, et jamais « 0 » (GA-18/19)', async () => {
    render(<AccountCrmSaysCard />, { ...CRM, deals: [{ ...CRM.deals[0]!, ownerName: null }], activities: [] })
    await screen.findByRole('heading', { name: 'Ce que dit ton CRM · Pipedrive' })
    expect(screen.queryByText(/Propriétaire/)).toBeNull()
    expect(screen.queryByText(/activité/)).toBeNull()
    expect(screen.queryByText(/\b0\b/)).toBeNull()
  })

  it('rien à dire → pas de bloc du tout', async () => {
    const { container } = render(<AccountCrmSaysCard />, { ...CRM, deals: [], activities: [], fusion: null })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(container.querySelector('[data-testid="account-crm-says"]')).toBeNull()
  })
})

describe('#4604 — le bloc se montre sur un compte que le CRM connaît SANS lien d’import', () => {
  it('ni compte importé ni contact du CRM, mais des affaires : le bloc s’affiche quand même', async () => {
    const accountId = 'a-unlinked'
    apiFetchMock.mockReset()
    apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
      if (options.path === `/crm/push/accounts/${accountId}/provenance`)
        return { accountFromCrm: false, contacts: [], crm: CRM } satisfies AccountCrmProvenance
      throw new Error(`appel inattendu : ${options.path}`)
    })
    renderWithRouter(
      <AccountCrmProvenanceProvider accountId={accountId}>
        <AccountCrmSaysCard />
      </AccountCrmProvenanceProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Ce que dit ton CRM · Pipedrive' })).toBeInTheDocument()
  })
})

describe('#4604.2 — la même étiquette sur l’étape et le propriétaire', () => {
  it('le propriétaire et l’étape du CRM disent « vient de Pipedrive », là où on les lit', async () => {
    const { container } = render(<AccountCrmSaysCard />, CRM)
    await screen.findByRole('heading', { name: 'Ce que dit ton CRM · Pipedrive' })
    const owner = screen.getByText(/Claire Martin/).closest('li')!
    const stage = screen.getByText('Étape : Négociation').closest('li')!
    expect(owner.querySelector('[data-crm-field-source="crm"]')).not.toBeNull()
    expect(stage.querySelector('[data-crm-field-source="crm"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-crm-field-source]')).toHaveLength(2)
  })

  it('sait dire NON : un propriétaire absent ne fait ni ligne ni étiquette', async () => {
    const { container } = render(<AccountCrmSaysCard />, { ...CRM, deals: [{ ...CRM.deals[0]!, ownerName: null }] })
    await screen.findByRole('heading', { name: 'Ce que dit ton CRM · Pipedrive' })
    expect(container.querySelectorAll('[data-crm-field-source]')).toHaveLength(1)
  })
})

describe('#4604.4 — les champs personnalisés du CRM dans le bloc', () => {
  const withCustom = (customFields: { key: string; value: string }[]): AccountCrmSays => ({
    ...CRM,
    deals: [{ ...CRM.deals[0]!, customFields }],
  })

  it('chaque champ personnalisé est une ligne « nom : valeur », sous le nom du CRM branché', async () => {
    render(<AccountCrmSaysCard />, withCustom([{ key: 'budget_it', value: '1,2 M€' }]))
    expect(await screen.findByText('Budget it : 1,2 M€')).toBeInTheDocument()
  })

  it('des champs personnalisés seuls suffisent à faire exister le bloc', async () => {
    render(<AccountCrmSaysCard />, {
      ...CRM,
      deals: [
        {
          ...CRM.deals[0]!,
          title: null,
          stage: null,
          ownerName: null,
          customFields: [{ key: 'segment', value: 'Grand compte' }],
        },
      ],
      activities: [],
      fusion: null,
    })
    expect(await screen.findByText('Segment : Grand compte')).toBeInTheDocument()
  })

  it('sait dire NON : sans champ personnalisé, aucune ligne de ce genre', async () => {
    const { container } = render(<AccountCrmSaysCard />, withCustom([]))
    await screen.findByRole('heading', { name: 'Ce que dit ton CRM · Pipedrive' })
    expect(container.querySelector('[data-crm-custom-field]')).toBeNull()
  })
})

describe('#4604.7 — une valeur corrigée à la main affiche la version humaine ; la version du CRM reste consultable', () => {
  const corrected: AccountCrmSays = { ...CRM, crmValues: [{ field: 'siren', value: '123456789' }] }

  it('la version du CRM se consulte à la demande, jamais affichée d’office', async () => {
    render(<CrmFieldSourceTag field="siren" />, corrected)
    expect(await screen.findByText('corrigé dans Bellum')).toBeInTheDocument()
    expect(screen.queryByText(/123456789/)).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Voir la version de Pipedrive' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByText('Pipedrive : 123456789')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Masquer la version de Pipedrive' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('sait dire NON : pas de version CRM connue, ou valeur venue du CRM → aucun bouton', async () => {
    render(<CrmFieldSourceTag field="siren" />, CRM)
    expect(await screen.findByText('corrigé dans Bellum')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    render(<CrmFieldSourceTag field="company_name" />, {
      ...corrected,
      crmValues: [{ field: 'company_name', value: 'X' }],
    })
    expect((await screen.findAllByText('vient de Pipedrive')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

// #4295.23 — le point d'entrée de l'annulation d'une fusion : la route `POST /accounts/crm-fusions/:id/undo`
// n'avait AUCUN appelant à l'écran. Elle est réservée à qui branche le CRM (`integrations:manage`).
describe('#4295.23 — « Annuler la fusion » sur la fiche fusionnée', () => {
  it('un manager annule la fusion : la route est appelée avec l’identifiant de la fusion', async () => {
    teamRole = 'owner'
    render(<AccountCrmSaysCard />, CRM)
    apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
      if (options.path === '/accounts/crm-fusions/f-1/undo') return { restored: true }
      return { accountFromCrm: true, contacts: [], crm: CRM }
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler la fusion' }))
    await vi.waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/accounts/crm-fusions/f-1/undo', method: 'POST' }),
      ),
    )
  })

  it('REFUS : un commercial sans le droit de brancher le CRM ne voit pas le geste', async () => {
    teamRole = 'sales'
    render(<AccountCrmSaysCard />, CRM)
    await screen.findByRole('heading', { name: 'Ce que dit ton CRM · Pipedrive' })
    expect(screen.queryByRole('button', { name: 'Annuler la fusion' })).toBeNull()
    teamRole = 'owner'
  })
})
