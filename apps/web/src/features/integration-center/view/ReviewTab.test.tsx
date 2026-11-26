import type { CrmReadStatus } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { crmImportApi, useCrmReadStatus } from '@/features/crm-import/api'
import { ReviewTab } from './ReviewTab'

vi.mock('@/features/crm-import/api', () => ({
  useCrmReadStatus: vi.fn(),
  crmImportApi: { keepCrmValue: vi.fn(), keepBellumValue: vi.fn() },
}))
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

function setStatus(items: CrmReadStatus[]) {
  vi.mocked(useCrmReadStatus).mockReturnValue({ data: items, isLoading: false } as unknown as ReturnType<
    typeof useCrmReadStatus
  >)
}

const real: CrmReadStatus = {
  provider: 'hubspot',
  accountLabel: null,
  objects: ['contacts'],
  incremental: null,
  lastSyncAt: null,
  lastError: null,
  conflicts: 1,
  conflictItems: [
    {
      id: 'e1',
      entityType: 'contact',
      entityLabel: 'Paul Ferrer',
      field: 'email',
      bellumValue: 'p.ferrer@altiver.fr',
      crmValue: 'paul@altiver.com',
      at: '2026-10-22T08:40:00.000Z',
    },
  ],
}

describe('Théo D settings-integrations.N3 — l’onglet À relire', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    vi.mocked(crmImportApi.keepCrmValue).mockReset().mockResolvedValue({ field: 'email', value: 'x' })
    vi.mocked(crmImportApi.keepBellumValue).mockReset().mockResolvedValue({ field: 'email' })
  })

  it('un bloc par fiche, avec les deux valeurs côte à côte, et aucun « Tout approuver »', () => {
    setStatus([real])
    render(<ReviewTab />)
    expect(screen.getByText('Paul Ferrer')).toBeInTheDocument()
    expect(screen.getByText('p.ferrer@altiver.fr')).toBeInTheDocument()
    expect(screen.getByText('paul@altiver.com')).toBeInTheDocument()
    expect(screen.queryByText(/Tout approuver$/)).not.toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — rien à relire : la phrase le dit, aucun bloc', () => {
    setStatus([{ ...real, conflictItems: [] }])
    render(<ReviewTab />)
    expect(screen.getByText(/Rien à relire/)).toBeInTheDocument()
    expect(screen.queryByTestId('review-group')).not.toBeInTheDocument()
  })

  it('par défaut la valeur Bellum est gardée : « Appliquer » la retient sans rien réécrire', async () => {
    setStatus([real])
    render(<ReviewTab />)
    await user().click(screen.getByRole('button', { name: 'Appliquer ces choix' }))
    expect(crmImportApi.keepBellumValue).toHaveBeenCalledWith({ eventId: 'e1', field: 'email' })
    expect(crmImportApi.keepCrmValue).not.toHaveBeenCalled()
  })

  it('choisir l’outil remplace la valeur par le geste explicite existant', async () => {
    setStatus([real])
    render(<ReviewTab />)
    await user().click(screen.getByRole('radio', { name: 'HubSpot' }))
    await user().click(screen.getByRole('button', { name: 'Appliquer ces choix' }))
    expect(crmImportApi.keepCrmValue).toHaveBeenCalledWith({ eventId: 'e1', field: 'email' })
    expect(crmImportApi.keepBellumValue).not.toHaveBeenCalled()
  })

  it('en salle de démonstration, « Appliquer » est un aperçu : aucune écriture', async () => {
    setStatus([
      {
        ...real,
        demo: true,
        conflictItems: [{ ...real.conflictItems![0]!, id: undefined }],
      },
    ])
    render(<ReviewTab />)
    await user().click(screen.getByRole('button', { name: 'Appliquer ces choix' }))
    expect(screen.getByText(/rien n’est écrit/)).toBeInTheDocument()
    expect(crmImportApi.keepBellumValue).not.toHaveBeenCalled()
    expect(crmImportApi.keepCrmValue).not.toHaveBeenCalled()
  })
})

// #4590 — « Rien à relire » ne se dit pas quand la lecture a échoué : ce serait un faux « rien à signaler ».
describe('ReviewTab — lecture en échec (#4590)', () => {
  it('dit l’état de lecture indisponible, jamais « Rien à relire »', () => {
    vi.mocked(useCrmReadStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useCrmReadStatus>)
    render(<ReviewTab />)
    expect(screen.getByRole('alert')).toHaveTextContent(/état de lecture indisponible/i)
    expect(screen.queryByText(/Rien à relire/)).not.toBeInTheDocument()
  })
})
