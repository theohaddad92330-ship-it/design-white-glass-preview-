import { onTestFinished, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import type { CrmPushPreview, CrmPushResult, CrmPushTargets } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountCrmPushChip, CrmPushDialog } from './CrmPushDialog'

// #4188 — envoyer un compte et ses contacts vers mon CRM : aperçu, puis envoi.
const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

const PREVIEW: CrmPushPreview = {
  provider: 'pipedrive',
  destination: 'Exteam',
  items: [
    {
      entity: 'account',
      id: 'a-1',
      label: 'ACME',
      verdict: 'create',
      reason: null,
      crmRecordId: null,
      recordUrl: null,
      fields: [
        { field: 'name', value: 'ACME' },
        { field: 'domain', value: 'acme.fr' },
      ],
    },
    {
      entity: 'contact',
      id: 'c-2',
      label: 'Jean',
      verdict: 'refused',
      reason: 'Ni adresse e-mail ni nom complet : ton CRM ne saurait pas la retrouver.',
      crmRecordId: null,
      recordUrl: null,
      fields: [],
    },
  ],
}
const RESULT: CrmPushResult = {
  provider: 'pipedrive',
  destination: 'Exteam',
  batchId: 'b-1',
  items: [
    {
      entity: 'account',
      id: 'a-1',
      label: 'ACME',
      outcome: 'created',
      reason: null,
      crmRecordId: 'org-9',
      recordUrl: 'https://exteam.pipedrive.com/organization/org-9',
    },
    {
      entity: 'contact',
      id: 'c-2',
      label: 'Jean',
      outcome: 'refused',
      reason: 'Refusé',
      crmRecordId: null,
      recordUrl: null,
    },
  ],
}

const ONE_TARGET: CrmPushTargets = {
  targets: [{ provider: 'pipedrive', destination: 'Exteam', primary: true, writable: true, readOnlyReason: null }],
}
// L'espace de Louis : HubSpot, Salesforce et Odoo branchés ; Odoo sans droit d'écriture.
const THREE_TARGETS: CrmPushTargets = {
  targets: [
    { provider: 'hubspot', destination: 'bellum-it.com', primary: true, writable: true, readOnlyReason: null },
    { provider: 'salesforce', destination: 'bellum-it.com', primary: false, writable: true, readOnlyReason: null },
    {
      provider: 'odoo',
      destination: 'bellum-it.com',
      primary: false,
      writable: false,
      readOnlyReason: 'Branché en lecture seule : le droit d’écriture n’a pas été accordé à cet outil.',
    },
  ],
}
let targetsResponse: CrmPushTargets = ONE_TARGET
const forProvider = <T extends { provider: string; destination: string | null }>(base: T, provider: string): T => ({
  ...base,
  provider,
  destination: 'bellum-it.com',
})

beforeEach(() => {
  targetsResponse = ONE_TARGET
  apiFetchMock.mockReset()
  apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
    if (options.path === '/crm/push/targets') return targetsResponse
    const provider = (options.body as { provider?: string } | undefined)?.provider
    if (options.path === '/crm/push/preview')
      return provider === 'pipedrive' ? PREVIEW : forProvider(PREVIEW, provider ?? '')
    if (options.path === '/crm/push') return provider === 'pipedrive' ? RESULT : forProvider(RESULT, provider ?? '')
    if (options.path.startsWith('/crm/push/accounts/')) {
      return {
        items: [
          {
            provider: 'hubspot',
            crm_record_id: 'demo-sncf-societe',
            last_action: 'created',
            destination_label: 'Bellum Conseil — CRM fictif',
            exported_at: '2026-10-01T08:00:00.000Z',
            record_url: null,
          },
        ],
      }
    }
    throw new Error(`unexpected ${options.path}`)
  })
})

describe('CrmPushDialog (#4188)', () => {
  it('prévisualise SANS écrire — destination nommée par l’espace, refus avec sa raison', async () => {
    renderWithRouter(
      <CrmPushDialog open onOpenChange={() => {}} selection={{ accountIds: ['a-1'], contactIds: ['c-2'] }} />,
    )

    expect(await screen.findByText('Envoyer vers Pipedrive · Exteam')).toBeInTheDocument()
    expect(screen.getByText('Sera créé')).toBeInTheDocument()
    expect(screen.getByText(/Ni adresse e-mail ni nom complet/)).toBeInTheDocument()
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/crm/push' }))
  })

  it('#4290.1 — l’aperçu liste les CHAMPS écrits, valeur par champ, et dit que le CRM n’est pas relu', async () => {
    renderWithRouter(
      <CrmPushDialog open onOpenChange={() => {}} selection={{ accountIds: ['a-1'], contactIds: ['c-2'] }} />,
    )

    expect(await screen.findByLabelText('Champs écrits')).toBeInTheDocument()
    expect(screen.getByText('Site')).toBeInTheDocument()
    expect(screen.getByText('acme.fr')).toBeInTheDocument()
    expect(screen.getByText(/ne sont pas relues avant l’envoi/)).toBeInTheDocument()
  })

  it('envoie après validation, et dit le résultat élément par élément, avec le lien vers la fiche', async () => {
    renderWithRouter(
      <CrmPushDialog open onOpenChange={() => {}} selection={{ accountIds: ['a-1'], contactIds: ['c-2'] }} />,
    )
    await screen.findByText('Sera créé')

    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/crm/push',
          method: 'POST',
          body: { accountIds: ['a-1'], contactIds: ['c-2'], withAccountContacts: false, provider: 'pipedrive' },
        }),
      ),
    )
    expect(await screen.findByText('Créé')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche de ACME dans ton CRM' })).toHaveAttribute(
      'href',
      'https://exteam.pipedrive.com/organization/org-9',
    )
  })

  it('plusieurs CRM : chacun a sa case, seul le principal est coché, le lecture seule est listé non cochable avec sa raison', async () => {
    targetsResponse = THREE_TARGETS
    renderWithRouter(<CrmPushDialog open onOpenChange={() => {}} selection={{ accountIds: ['a-1'], contactIds: [] }} />)

    const hubspot = await screen.findByRole('checkbox', { name: /HubSpot · bellum-it\.com/ })
    // L.1 — plusieurs CRM branchés : aucune case cochée d'office.
    expect(hubspot).not.toBeChecked()
    await userEvent.click(hubspot)
    expect(hubspot).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Salesforce · bellum-it\.com/ })).not.toBeChecked()
    const odoo = screen.getByRole('checkbox', { name: /Odoo · bellum-it\.com/ })
    expect(odoo).toBeDisabled()
    expect(odoo).not.toBeChecked()
    expect(screen.getByText(/Branché en lecture seule/)).toBeInTheDocument()
    expect(await screen.findByText('Envoyer vers HubSpot · bellum-it.com')).toBeInTheDocument()
    // Seul le principal est prévisualisé : aucune requête pour Salesforce ni Odoo.
    const previewed = apiFetchMock.mock.calls
      .filter(([o]) => o.path === '/crm/push/preview')
      .map(([o]) => (o.body as { provider: string }).provider)
    expect(previewed).toContain('hubspot')
    expect(previewed).not.toContain('salesforce')
    expect(previewed).not.toContain('odoo')
  })

  it('K.6 — tant que les destinations chargent, aucune case (ni « lecture seule ») n’est montrée', async () => {
    let release: (value: unknown) => void = () => {}
    const pending = new Promise(resolve => {
      release = resolve
    })
    const base = apiFetchMock.getMockImplementation()
    onTestFinished(() => void apiFetchMock.mockImplementation(base ?? (async () => undefined)))
    apiFetchMock.mockImplementation(async options => (options.path === '/crm/push/targets' ? pending : base?.(options)))
    renderWithRouter(<CrmPushDialog open onOpenChange={() => {}} selection={{ accountIds: ['a-1'], contactIds: [] }} />)

    expect(await screen.findByText('Préparation de l’aperçu…')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /HubSpot|Odoo|Salesforce/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/lecture seule/)).not.toBeInTheDocument()
    release(THREE_TARGETS)
    expect(await screen.findByRole('checkbox', { name: /HubSpot/ })).not.toBeChecked()
  })

  it('plusieurs CRM cochés : une prévisualisation PAR CRM, un envoi vers chacun, un résultat par CRM', async () => {
    targetsResponse = THREE_TARGETS
    renderWithRouter(<CrmPushDialog open onOpenChange={() => {}} selection={{ accountIds: ['a-1'], contactIds: [] }} />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /HubSpot · bellum-it\.com/ }))
    await userEvent.click(await screen.findByRole('checkbox', { name: /Salesforce · bellum-it\.com/ }))

    expect(await screen.findByText('Envoyer vers 2 CRM')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Sera créé')).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() => expect(screen.getAllByText('Créé')).toHaveLength(2))
    const pushed = apiFetchMock.mock.calls
      .filter(([o]) => o.path === '/crm/push')
      .map(([o]) => (o.body as { provider: string }).provider)
      .sort()
    expect(pushed).toEqual(['hubspot', 'salesforce'])
  })

  it('l’échec d’un CRM n’annule pas l’autre ; un délai sans réponse est « à vérifier », pas un échec', async () => {
    targetsResponse = THREE_TARGETS
    const base = apiFetchMock.getMockImplementation()!
    apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
      const provider = (options.body as { provider?: string } | undefined)?.provider
      if (options.path === '/crm/push' && provider === 'salesforce') {
        throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
      }
      return base(options)
    })
    renderWithRouter(<CrmPushDialog open onOpenChange={() => {}} selection={{ accountIds: ['a-1'], contactIds: [] }} />)
    await userEvent.click(await screen.findByRole('checkbox', { name: /HubSpot · bellum-it\.com/ }))
    await userEvent.click(await screen.findByRole('checkbox', { name: /Salesforce · bellum-it\.com/ }))
    await waitFor(() => expect(screen.getAllByText('Sera créé')).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText('Créé')).toBeInTheDocument()
    expect(await screen.findByText(/Partie sans réponse de ce CRM/)).toBeInTheDocument()
    expect(screen.queryByText('Échec')).not.toBeInTheDocument()
  })

  it('« Dans <CRM> » sur la fiche d’un compte déjà envoyé — sans lien deviné quand l’URL n’est pas vérifiable', async () => {
    renderWithRouter(<AccountCrmPushChip accountId="a-1" />)

    expect(await screen.findByText('Dans Bellum Conseil — CRM fictif')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    // R24 (15/10) — déjà dans le CRM : le geste est « Mettre à jour », jamais « Envoyer » à côté de « Dans … ».
    expect(await screen.findByRole('button', { name: 'Mettre à jour dans mon CRM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Envoyer vers mon CRM' })).not.toBeInTheDocument()
  })

  it('R24 — un compte jamais envoyé garde « Envoyer vers mon CRM »', async () => {
    apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
      if (options.path.startsWith('/crm/push/accounts/')) return { items: [] }
      throw new Error(`unexpected ${options.path}`)
    })
    renderWithRouter(<AccountCrmPushChip accountId="a-1" />)
    expect(await screen.findByRole('button', { name: 'Envoyer vers mon CRM' })).toBeInTheDocument()
  })

  it('R24 — « Déjà dans ton CRM » (présence) bascule aussi le geste en « Mettre à jour »', async () => {
    apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
      if (options.path === '/crm/push/preview') return PREVIEW
      if (options.path.startsWith('/crm/push/accounts/')) return { items: [] }
      return { provider: 'hubspot', matched: true, contactsCount: 3, contacts: [], openDeals: [], lastActivityAt: null }
    })
    renderWithRouter(<AccountCrmPushChip accountId="a-1" companyName="BPCE" />)
    expect(await screen.findByRole('button', { name: 'Mettre à jour dans mon CRM' })).toBeInTheDocument()
  })

  it('L.1 — un choix de l’utilisateur ne se défait jamais pendant que le dialogue est ouvert', async () => {
    targetsResponse = THREE_TARGETS
    renderWithRouter(<CrmPushDialog open onOpenChange={() => {}} selection={{ accountIds: ['a-1'], contactIds: [] }} />)
    const hubspot = await screen.findByRole('checkbox', { name: /HubSpot/ })
    await userEvent.click(hubspot)
    await userEvent.click(hubspot)
    await screen.findByRole('checkbox', { name: /Salesforce/ })
    await waitFor(() => expect(hubspot).not.toBeChecked())
    expect(screen.getByRole('checkbox', { name: /Salesforce/ })).not.toBeChecked()
  })

  it('L.4 — rouverte, la fenêtre repart à neuf : plus de résultat, bouton Envoyer de retour', async () => {
    function Host() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(value => !value)}>
            bascule
          </button>
          <CrmPushDialog open={open} onOpenChange={setOpen} selection={{ accountIds: ['a-1'], contactIds: [] }} />
        </>
      )
    }
    renderWithRouter(<Host />)
    await screen.findByText('Sera créé')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await screen.findByText('Créé')

    await userEvent.click(screen.getAllByRole('button', { name: 'Fermer' }).at(-1)!)
    await waitFor(() => expect(screen.queryByText('Créé')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'bascule' }))

    expect(await screen.findByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
    expect(screen.queryByText('Créé')).not.toBeInTheDocument()
  })

  it('L.5 — un seul clic sur « Fermer » ferme', async () => {
    const onOpenChange = vi.fn()
    renderWithRouter(
      <CrmPushDialog open onOpenChange={onOpenChange} selection={{ accountIds: ['a-1'], contactIds: [] }} />,
    )
    await screen.findByText('Sera créé')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await screen.findByText('Créé')

    await userEvent.click(screen.getAllByRole('button', { name: 'Fermer' }).at(-1)!)

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('L.3 — présent dans le CRM SANS écart à envoyer : le geste reste « Envoyer », pas « Mettre à jour »', async () => {
    apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
      if (options.path === '/crm/push/preview')
        return { ...PREVIEW, items: [{ ...PREVIEW.items[0], verdict: 'already_present' }] }
      if (options.path.startsWith('/crm/push/accounts/')) return { items: [] }
      return { provider: 'hubspot', matched: true, contactsCount: 3, contacts: [], openDeals: [], lastActivityAt: null }
    })
    renderWithRouter(<AccountCrmPushChip accountId="a-1" companyName="BPCE" />)
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(expect.objectContaining({ path: '/crm/push/preview' })),
    )
    expect(await screen.findByRole('button', { name: 'Envoyer vers mon CRM' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mettre à jour dans mon CRM' })).not.toBeInTheDocument()
  })
})
