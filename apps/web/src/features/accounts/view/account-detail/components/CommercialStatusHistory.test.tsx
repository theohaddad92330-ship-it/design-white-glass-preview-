import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AccountTimeline } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CommercialStatusHistory } from './CommercialStatusHistory'

/**
 * #2117.23, .24 — le motif et l'historique du statut commercial. Le service
 * n'en capture presque rien aujourd'hui (voir le docblock du composant) :
 * ces tests prouvent que le panneau le DIT, et qu'il exploite la seule trace
 * réelle qui existe — le passage en client (`deal_signed`).
 */
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiFetch: apiFetchMock }))

// Le mock est PARTAGÉ entre les quatre tests (`vi.hoisted`) : sans reset, un
// appel déclenché par un clic dans un test antérieur reste enregistré et fait
// mentir le test « n'appelle pas avant le clic » qui vient après lui.
beforeEach(() => {
  apiFetchMock.mockReset()
})

// `renderWithRouter` partage un SEUL `QueryClient` module-scope entre tous
// les tests d'un même fichier (pas un par rendu) : avec la même `accountId`
// partout, react-query réutilise la clé de requête `['account-timeline', id]`
// d'un test à l'autre et peut rendre la donnée mise en cache par le test
// PRÉCÉDENT avant que le mock du test courant ait eu le temps de répondre —
// chaque test ci-dessous porte donc son propre `accountId`.

describe('CommercialStatusHistory', () => {
  it('reste FERMÉ à l’arrivée — un nom accessible, rien d’autre tant qu’on ne clique pas', async () => {
    apiFetchMock.mockResolvedValue({ events: [] } satisfies AccountTimeline)
    renderWithRouter(<CommercialStatusHistory accountId="acc-closed" />, '/accounts/test-id')
    // `renderWithRouter` monte via TanStack Router : le premier rendu part
    // `pending` le temps que la route se résolve, donc `getByRole` synchrone
    // juste après `render` court une vraie course — `findByRole` attend.
    const trigger = await screen.findByRole('button', { name: /motif et historique/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/statut commercial/i)).not.toBeInTheDocument()
  })

  it('#2117.23, .24 — ne dit plus « aucun motif n’est demandé… pas encore journalisé » : le journal existe', async () => {
    apiFetchMock.mockResolvedValue({ events: [] } satisfies AccountTimeline)
    const user = userEvent.setup()
    renderWithRouter(<CommercialStatusHistory accountId="acc-unmeasured" />, '/accounts/test-id')

    await user.click(await screen.findByRole('button', { name: /motif et historique/i }))
    expect(await screen.findByText(/aucun changement de statut n.a encore été journalisé/i)).toBeInTheDocument()
    expect(screen.queryByText(/aucun motif n.est demandé|pas encore journalisé/i)).not.toBeInTheDocument()
  })

  it('#2117.24 — liste chaque changement journalisé : date, de → vers, et le motif quand il y en a un', async () => {
    apiFetchMock.mockResolvedValue({
      events: [
        {
          id: 'action:2',
          kind: 'action',
          at: '2026-09-15T08:00:00Z',
          label: 'Statut commercial modifié',
          detail: 'Pas de budget avant 2027',
          type: 'commercial_status_changed',
          contactId: null,
          transition: { from: 'watching', to: 'archived' },
        },
        {
          id: 'action:1',
          kind: 'action',
          at: '2026-09-01T08:00:00Z',
          label: 'Statut commercial modifié',
          detail: null,
          type: 'commercial_status_changed',
          contactId: null,
          transition: { from: 'inbox', to: 'watching' },
        },
      ],
    } satisfies AccountTimeline)
    const user = userEvent.setup()
    renderWithRouter(<CommercialStatusHistory accountId="acc-history" />, '/accounts/test-id')

    await user.click(await screen.findByRole('button', { name: /motif et historique/i }))
    expect(await screen.findByText(/En observation → Hors priorité/)).toBeInTheDocument()
    expect(screen.getByText(/Pas de budget avant 2027/)).toBeInTheDocument()
    expect(screen.getByText(/À trier → En observation/)).toBeInTheDocument()
  })

  it('nomme la SEULE trace réelle — le passage en client — quand elle existe (#deal_signed)', async () => {
    apiFetchMock.mockResolvedValue({
      events: [
        {
          id: 'action:1',
          kind: 'action',
          at: '2026-03-03T00:00:00Z',
          label: 'Affaire signée',
          detail: null,
          type: 'deal_signed',
          contactId: null,
        },
      ],
    } satisfies AccountTimeline)
    const user = userEvent.setup()
    renderWithRouter(<CommercialStatusHistory accountId="acc-customer" />, '/accounts/test-id')

    await user.click(await screen.findByRole('button', { name: /motif et historique/i }))
    await waitFor(() => expect(screen.getByText(/devenu client le/i)).toBeInTheDocument())
  })

  it('n’appelle PAS la timeline avant le clic — la requête est conditionnée à l’ouverture', () => {
    apiFetchMock.mockResolvedValue({ events: [] } satisfies AccountTimeline)
    renderWithRouter(<CommercialStatusHistory accountId="acc-lazy" />, '/accounts/test-id')
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})
