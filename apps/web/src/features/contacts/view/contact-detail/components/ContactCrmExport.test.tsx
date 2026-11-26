import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Contact } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useAttioStatus } from '@/features/attio/hooks/useAttioStatus'
import { useCrmStatus } from '@/features/crm/hooks/useCrmStatus'
import { usePipedriveStatus } from '@/features/pipedrive/hooks/usePipedriveStatus'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useSalesforceStatus } from '@/features/salesforce/hooks/useSalesforceStatus'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useContactAssociations } from '@/features/contacts/hooks/useContactAssociations'
import { useContactCrmExports, useRecordContactCrmExport } from '@/features/contacts/hooks/useContactCrmExports'
import { ContactCrmExport } from './ContactCrmExport'

// sonner renders portals/toasts we don't care about here — stub it.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Each provider's connection status is driven by its own hook — mock them so we
// control which CRMs are connected without hitting the (mocked) network.
vi.mock('@/features/crm/hooks/useCrmStatus', () => ({ useCrmStatus: vi.fn() }))
vi.mock('@/features/salesforce/hooks/useSalesforceStatus', () => ({ useSalesforceStatus: vi.fn() }))
vi.mock('@/features/pipedrive/hooks/usePipedriveStatus', () => ({ usePipedriveStatus: vi.fn() }))
vi.mock('@/features/attio/hooks/useAttioStatus', () => ({ useAttioStatus: vi.fn() }))
// Gating par offre : ouvert par défaut ici, un test le ferme explicitement.
vi.mock('@/features/plan-features/usePlanFeature', () => ({ usePlanFeature: vi.fn() }))

// #3719.4 / .6 — l'état persisté et l'entreprise du compte viennent de ces hooks.
vi.mock('@/features/contacts/hooks/useContactAssociations', () => ({ useContactAssociations: vi.fn() }))
vi.mock('@/features/contacts/hooks/useContactCrmExports', () => ({
  useContactCrmExports: vi.fn(),
  useRecordContactCrmExport: vi.fn(),
}))
const recordMutate = vi.fn()

// Radix menus need these pointer APIs, which jsdom doesn't implement.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

const apiFetchMock = vi.mocked(apiFetch)
const user = () => userEvent.setup({ pointerEventsCheck: 0 })

function status<T>(connected: boolean): T {
  return { data: { configured: true, connected } } as unknown as T
}

const contact = {
  id: 'c-1',
  full_name: 'Alice Martin',
  email: 'alice@acme.co',
  title: 'DSI',
  entity: 'ACME',
  linkedin_url: null,
} as unknown as Contact

beforeEach(() => {
  apiFetchMock.mockReset()
  apiFetchMock.mockResolvedValue({ id: 'crm-1', created: true })
  // Everything disconnected by default; each test opts a provider in.
  vi.mocked(useCrmStatus).mockReturnValue(status<ReturnType<typeof useCrmStatus>>(false))
  vi.mocked(useSalesforceStatus).mockReturnValue(status<ReturnType<typeof useSalesforceStatus>>(false))
  vi.mocked(usePipedriveStatus).mockReturnValue(status<ReturnType<typeof usePipedriveStatus>>(false))
  vi.mocked(useAttioStatus).mockReturnValue(status<ReturnType<typeof useAttioStatus>>(false))
  vi.mocked(usePlanFeature).mockReturnValue({ known: true, allowed: true })
  recordMutate.mockReset()
  vi.mocked(useContactAssociations).mockReturnValue({
    data: { account: { id: 'a-1', name: 'Acme Corp' } },
  } as unknown as ReturnType<typeof useContactAssociations>)
  vi.mocked(useContactCrmExports).mockReturnValue({ data: { contact_id: 'c-1', items: [] } } as unknown as ReturnType<
    typeof useContactCrmExports
  >)
  vi.mocked(useRecordContactCrmExport).mockReturnValue({ mutate: recordMutate } as unknown as ReturnType<
    typeof useRecordContactCrmExport
  >)
})

describe('ContactCrmExport', () => {
  it("grise l'export quand l'offre ne l'inclut pas, et le clic mène aux offres", async () => {
    vi.mocked(useCrmStatus).mockReturnValue(status<ReturnType<typeof useCrmStatus>>(true))
    vi.mocked(usePlanFeature).mockReturnValue({ known: true, allowed: false })
    renderWithRouter(<ContactCrmExport contact={contact} />)

    // Le bouton RESTE — grisé. Le masquer priverait le commercial de la raison
    // de monter d'offre.
    const exportButton = await screen.findByRole('button', { name: /export/i })
    expect(exportButton.className).toContain('opacity-50')

    // Et il répond : le clic ouvre l'upsell, qui mène à la facturation.
    await user().click(exportButton)
    await user().click(await screen.findByRole('menuitem', { name: /hubspot/i }))
    expect(await screen.findByRole('link', { name: /.+/ })).toHaveAttribute('href', '/billing')
    // Rien n'a été exporté : le refus précède l'appel. (Le catalogue de plans,
    // lui, est bien lu — c'est lui qui nomme l'offre à prendre.)
    const exportCalls = apiFetchMock.mock.calls.filter(([arg]) =>
      String((arg as { path?: string } | undefined)?.path ?? '').includes('export'),
    )
    expect(exportCalls).toEqual([])
  })

  // Lot D01 (06/10/2026, #3719) — salle de démonstration : un connecteur CRM FICTIF fait apparaître la carte.
  it('en démonstration, la carte apparaît avec le connecteur fictif MARQUÉ comme tel — et exporte par la même route', async () => {
    vi.mocked(useCrmStatus).mockReturnValue({
      data: { configured: false, connected: false, demo: true, accountLabel: 'Bellum Conseil — CRM fictif' },
    } as unknown as ReturnType<typeof useCrmStatus>)
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)

    expect(
      await screen.findByText(/nothing is written to a real tool|rien n’est écrit dans un outil réel/i),
    ).toBeTruthy()
    await u.click(await screen.findByRole('button', { name: /export/i }))
    await u.click(await screen.findByRole('menuitem', { name: /Bellum Conseil — CRM fictif/ }))

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/crm/hubspot/export', method: 'POST' }),
      ),
    )
  })

  it('sait dire NON — un statut `demo` absent (production) et rien de branché : la carte reste invisible', () => {
    vi.mocked(useCrmStatus).mockReturnValue({
      data: { configured: true, connected: false },
    } as unknown as ReturnType<typeof useCrmStatus>)
    renderWithRouter(<ContactCrmExport contact={contact} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing when no CRM is connected', () => {
    renderWithRouter(<ContactCrmExport contact={contact} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('calls the HubSpot export endpoint when HubSpot is picked', async () => {
    vi.mocked(useCrmStatus).mockReturnValue(status<ReturnType<typeof useCrmStatus>>(true))
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)

    // renderWithRouter mounts asynchronously — wait for the trigger to appear.
    await u.click(await screen.findByRole('button'))
    await u.click(await screen.findByText('HubSpot'))

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/crm/hubspot/export', method: 'POST' }),
      ),
    )
  })

  it('calls the Salesforce export endpoint when Salesforce is picked', async () => {
    vi.mocked(useSalesforceStatus).mockReturnValue(status<ReturnType<typeof useSalesforceStatus>>(true))
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)

    // renderWithRouter mounts asynchronously — wait for the trigger to appear.
    await u.click(await screen.findByRole('button'))
    await u.click(await screen.findByText('Salesforce'))

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        // #4186 — par la porte commune, le fournisseur dans le corps.
        expect.objectContaining({
          path: '/crm/push/contact',
          method: 'POST',
          body: expect.objectContaining({ provider: 'salesforce' }),
        }),
      ),
    )
  })

  it('calls the Pipedrive export endpoint when Pipedrive is picked', async () => {
    vi.mocked(usePipedriveStatus).mockReturnValue(status<ReturnType<typeof usePipedriveStatus>>(true))
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)

    // renderWithRouter mounts asynchronously — wait for the trigger to appear.
    await u.click(await screen.findByRole('button'))
    await u.click(await screen.findByText('Pipedrive'))

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/crm/push/contact',
          method: 'POST',
          body: expect.objectContaining({ provider: 'pipedrive' }),
        }),
      ),
    )
  })

  it('replie ce qui n’est pas branché en UNE invite vers Réglages', async () => {
    // Un seul CRM connecté ; les trois autres non.
    vi.mocked(useCrmStatus).mockReturnValue(status<ReturnType<typeof useCrmStatus>>(true))
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)

    // renderWithRouter mounts asynchronously — wait for the trigger to appear.
    await u.click(await screen.findByRole('button'))

    // ⚠️ Ce qui n'est PAS branché ne se liste plus un par un. Sans nom
    // d'éditeur, trois lignes « HubSpot · Connecter d'abord » se répéteraient
    // sans rien apprendre : une seule invite, et le geste est le même pour
    // toutes — aller à Réglages › Intégrations, où les outils SONT nommés.
    const connectLink = (await screen.findByText(/Connecter un autre CRM/)).closest('a')
    expect(connectLink).toHaveAttribute('href', '/integrations')
    // Exactement une destination exportable, et une seule invite.
    expect(screen.queryAllByText('HubSpot')).toHaveLength(1)

    // No export call was made just by opening the menu.
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/crm/push/contact' }))
  })

  // #3719.1 — un contact HISTORIQUE (a quitté l'entreprise) n'est jamais
  // exporté comme employé actuel : ni poste ni entreprise ne partent, et la
  // carte le dit.
  it('#3719.1 — un contact historique part sans poste ni entreprise, et la carte le dit', async () => {
    vi.mocked(useCrmStatus).mockReturnValue(status<ReturnType<typeof useCrmStatus>>(true))
    const u = user()
    renderWithRouter(<ContactCrmExport contact={{ ...contact, lifecycle_state: 'historique' } as Contact} />)

    expect(await screen.findByText(/poste et l’entreprise ne sont pas exportés/)).toBeInTheDocument()
    await u.click(await screen.findByRole('button'))
    await u.click(await screen.findByText('HubSpot'))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    const body = JSON.stringify(apiFetchMock.mock.calls[0]?.[0])
    expect(body).toContain('alice@acme.co')
    expect(body).not.toContain('Acme Corp')
    expect(body).not.toContain('DSI')
  })

  it('#3719.1 — un contact actuel garde poste et entreprise', async () => {
    vi.mocked(useCrmStatus).mockReturnValue(status<ReturnType<typeof useCrmStatus>>(true))
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)

    expect(screen.queryByText(/ne sont pas exportés/)).toBeNull()
    await u.click(await screen.findByRole('button'))
    await u.click(await screen.findByText('HubSpot'))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    const body = JSON.stringify(apiFetchMock.mock.calls[0]?.[0])
    // #3719.6 — l'entreprise est celle du COMPTE identifié, jamais le libellé d'entité.
    expect(body).toContain('Acme Corp')
    expect(body).not.toContain('ACME')
    expect(body).toContain('DSI')
  })

  it('#3719.3 — un seul CRM branché : la destination porte le nom de l’espace, jamais l’éditeur', async () => {
    vi.mocked(useCrmStatus).mockReturnValue({
      data: { configured: true, connected: true, accountLabel: 'Studio Nova' },
    } as unknown as ReturnType<typeof useCrmStatus>)
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)
    await u.click(await screen.findByRole('button'))
    expect(await screen.findByText('HubSpot — Studio Nova')).toBeInTheDocument()
  })

  it('#3719.4 — après un export réussi, il est consigné (créé / mis à jour, destination)', async () => {
    vi.mocked(useCrmStatus).mockReturnValue({
      data: { configured: true, connected: true, accountLabel: 'Studio Nova' },
    } as unknown as ReturnType<typeof useCrmStatus>)
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)
    await u.click(await screen.findByRole('button'))
    await u.click(await screen.findByText('HubSpot — Studio Nova'))
    await waitFor(() => expect(recordMutate).toHaveBeenCalled())
    expect(recordMutate.mock.calls[0]?.[0]).toEqual({
      provider: 'hubspot',
      crm_record_id: 'crm-1',
      created: true,
      destination_label: 'Studio Nova',
    })
  })

  it('#3719.4 — un export déjà consigné se retrouve au rechargement : destination, date, « Mettre à jour »', async () => {
    vi.mocked(useCrmStatus).mockReturnValue({
      data: { configured: true, connected: true, accountLabel: 'Studio Nova' },
    } as unknown as ReturnType<typeof useCrmStatus>)
    vi.mocked(useContactCrmExports).mockReturnValue({
      data: {
        contact_id: 'c-1',
        items: [
          {
            provider: 'hubspot',
            crm_record_id: 'hs-7',
            last_action: 'created',
            destination_label: 'Studio Nova',
            exported_at: '2026-10-02T09:00:00.000Z',
          },
        ],
      },
    } as unknown as ReturnType<typeof useContactCrmExports>)
    const u = user()
    renderWithRouter(<ContactCrmExport contact={contact} />)
    expect(await screen.findByText(/Exporté vers HubSpot — Studio Nova le 2 octobre/)).toBeInTheDocument()
    // export ponctuel ≠ synchronisation, dit une fois
    expect(screen.getByText(/Export ponctuel/)).toBeInTheDocument()
    await u.click(await screen.findByRole('button', { name: /Journaliser/ }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(expect.objectContaining({ path: '/crm/contacts/hs-7/activity' })),
    )
  })

  it('#3719.5 — un `record_url` connu rend un lien « Ouvrir la fiche » vers le CRM', async () => {
    vi.mocked(useCrmStatus).mockReturnValue({
      data: { configured: true, connected: true, accountLabel: 'Studio Nova' },
    } as unknown as ReturnType<typeof useCrmStatus>)
    vi.mocked(useContactCrmExports).mockReturnValue({
      data: {
        contact_id: 'c-1',
        items: [
          {
            provider: 'hubspot',
            crm_record_id: 'hs-7',
            last_action: 'created',
            destination_label: 'Studio Nova',
            exported_at: '2026-10-02T09:00:00.000Z',
            record_url: 'https://app.hubspot.com/contacts/98765/record/0-1/hs-7',
          },
        ],
      },
    } as unknown as ReturnType<typeof useContactCrmExports>)
    renderWithRouter(<ContactCrmExport contact={contact} />)
    const link = await screen.findByRole('link', { name: /Ouvrir la fiche/ })
    expect(link).toHaveAttribute('href', 'https://app.hubspot.com/contacts/98765/record/0-1/hs-7')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it("#3719.5 — sans `record_url` (Attio, ou connexion disparue), aucun lien n'est inventé", async () => {
    vi.mocked(useCrmStatus).mockReturnValue({
      data: { configured: true, connected: true, accountLabel: 'Studio Nova' },
    } as unknown as ReturnType<typeof useCrmStatus>)
    vi.mocked(useContactCrmExports).mockReturnValue({
      data: {
        contact_id: 'c-1',
        items: [
          {
            provider: 'hubspot',
            crm_record_id: 'hs-7',
            last_action: 'created',
            destination_label: 'Studio Nova',
            exported_at: '2026-10-02T09:00:00.000Z',
            record_url: null,
          },
        ],
      },
    } as unknown as ReturnType<typeof useContactCrmExports>)
    renderWithRouter(<ContactCrmExport contact={contact} />)
    await screen.findByText(/Exporté vers HubSpot — Studio Nova le 2 octobre/)
    expect(screen.queryByRole('link', { name: /Ouvrir la fiche/ })).not.toBeInTheDocument()
  })

  it('#3719.7 — déjà exporté et sans e-mail : pas de second export, donc pas de doublon', async () => {
    vi.mocked(useCrmStatus).mockReturnValue(status<ReturnType<typeof useCrmStatus>>(true))
    vi.mocked(useContactCrmExports).mockReturnValue({
      data: {
        contact_id: 'c-1',
        items: [
          {
            provider: 'hubspot',
            crm_record_id: 'hs-7',
            last_action: 'created',
            destination_label: null,
            exported_at: '2026-10-02T09:00:00.000Z',
          },
        ],
      },
    } as unknown as ReturnType<typeof useContactCrmExports>)
    const u = user()
    renderWithRouter(<ContactCrmExport contact={{ ...contact, email: null } as unknown as Contact} />)
    await u.click(await screen.findByRole('button', { name: /export/i }))
    await u.click(await screen.findByText(/Mettre à jour dans/))
    expect(apiFetchMock.mock.calls.filter(([a]) => String((a as { path?: string }).path).includes('/export'))).toEqual(
      [],
    )
  })
})
