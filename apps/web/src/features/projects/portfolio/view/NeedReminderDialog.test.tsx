import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NeedReminderDialog } from './NeedReminderDialog'

/**
 * #1952.38 — LA CLÉ D'IDEMPOTENCE DU GESTE, QUI MANQUAIT ICI.
 *
 * `ActionRouterService.dispatchIdempotent` rend la main à `dispatchOne` dès que
 * `idempotencyKey` est absente. Cette fenêtre n'en fournissait aucune : un
 * double clic, ou un renvoi réseau, enregistrait DEUX rappels sur le dossier.
 *
 * Les deux premiers tests sont l'un l'inverse de l'autre : une clé tirée par
 * rendu échoue au premier, une clé qui ne regarde que le compte échoue au
 * second.
 */
const dispatch = vi.fn()
vi.mock('@/features/actions/api', () => ({ actionsApi: { dispatch: (...args: unknown[]) => dispatch(...args) } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function renderDialog(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

function open() {
  return renderDialog(
    <NeedReminderDialog
      accountId="11111111-1111-4111-8111-111111111111"
      companyName="ACME SA"
      needLabel="Migration cloud"
      open
      onOpenChange={vi.fn()}
    />,
  )
}

/** ⚠️ La clé est LUE, jamais supposée : comparer deux `undefined` donnerait un
 *  test vert alors qu'aucune clé ne part — exactement le défaut qu'on corrige. */
function keyOf(call: number): string {
  const key = (dispatch.mock.calls[call]?.[0] as { idempotencyKey?: string } | undefined)?.idempotencyKey
  expect(typeof key).toBe('string')
  return key as string
}

async function confirm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Enregistrer le rappel' }))
}

beforeEach(() => {
  dispatch.mockReset()
  // La clé d'un geste vit dans le stockage de l'onglet : sans ce nettoyage, un
  // test hériterait de celle du précédent.
  sessionStorage.clear()
})

describe('NeedReminderDialog — la clé d’idempotence est celle du GESTE', () => {
  it('la même demande confirmée après un remontage rejoue la MÊME clé', async () => {
    // La requête reste EN VOL : l'état exact pendant lequel on rafraîchit, puis
    // on reclique en croyant que rien n'est parti.
    dispatch.mockImplementation(() => new Promise(() => {}))
    const first = open()
    await confirm()
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    first.unmount()

    open()
    await confirm()
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))

    expect(keyOf(1)).toBe(keyOf(0))
  })

  it('une échéance différente est un AUTRE geste — jamais la même clé', async () => {
    // Le piège dans l'autre sens : deux rappels légitimes sur le même dossier
    // à deux dates. Les confondre bloquerait le second pour toujours.
    dispatch.mockResolvedValue({ type: 'schedule_reminder', status: 'done' })
    const first = open()
    await confirm()
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    first.unmount()

    open()
    fireEvent.change(await screen.findByLabelText('Date du rappel'), { target: { value: '2027-03-04T09:00' } })
    await confirm()
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))

    expect(keyOf(1)).not.toBe(keyOf(0))
  })
})
