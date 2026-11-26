import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExecuteActionDialog } from './ExecuteActionDialog'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const dispatch = vi.fn().mockResolvedValue({ type: 'schedule_reminder', status: 'done' })
const dispatchBulk = vi.fn().mockResolvedValue({
  results: [],
  summary: { total: 2, done: 2, queued: 0, skipped: 0, failed: 0 },
})
vi.mock('@/features/actions/api', () => ({
  actionsApi: {
    dispatch: (...args: unknown[]) => dispatch(...args),
    dispatchBulk: (...args: unknown[]) => dispatchBulk(...args),
  },
}))

const crmStatus = { data: { configured: true, connected: false } as { configured: boolean; connected: boolean } }
vi.mock('@/features/crm/hooks/useCrmStatus', () => ({
  useCrmStatus: () => crmStatus,
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  dispatch.mockClear()
  dispatchBulk.mockClear()
  crmStatus.data = { configured: true, connected: false }
  // #1952.38 — la clé d'un geste vit dans le stockage de l'onglet : sans ce
  // nettoyage, un test hériterait de celle du précédent.
  sessionStorage.clear()
})

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

describe('ExecuteActionDialog', () => {
  it('does not dispatch anything on open (no auto-send)', () => {
    wrap(<ExecuteActionDialog open onOpenChange={vi.fn()} contacts={[{ id: 'c1', name: 'Marc' }]} />)
    expect(dispatch).not.toHaveBeenCalled()
    expect(dispatchBulk).not.toHaveBeenCalled()
  })

  it('dispatches a single schedule_reminder intent for one contact', async () => {
    const u = user()
    wrap(<ExecuteActionDialog open onOpenChange={vi.fn()} contacts={[{ id: 'c1', name: 'Marc' }]} />)

    await u.click(screen.getByRole('button', { name: 'Exécuter' }))

    expect(dispatchBulk).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledTimes(1)
    const intent = dispatch.mock.calls[0][0] as Record<string, unknown>
    expect(intent.type).toBe('schedule_reminder')
    expect(intent.contactId).toBe('c1')
    expect(typeof intent.at).toBe('string')
  })

  it('uses the bulk endpoint for a multi-contact selection', async () => {
    const u = user()
    wrap(
      <ExecuteActionDialog
        open
        onOpenChange={vi.fn()}
        contacts={[
          { id: 'c1', name: 'Marc' },
          { id: 'c2', name: 'Julie' },
        ]}
      />,
    )

    await u.click(screen.getByRole('button', { name: 'Exécuter pour 2' }))

    expect(dispatch).not.toHaveBeenCalled()
    expect(dispatchBulk).toHaveBeenCalledTimes(1)
    const payload = dispatchBulk.mock.calls[0][0] as { intents: unknown[] }
    expect(payload.intents).toHaveLength(2)
  })

  it('disables the CRM task action until a CRM is connected', async () => {
    wrap(<ExecuteActionDialog open onOpenChange={vi.fn()} contacts={[{ id: 'c1', name: 'Marc' }]} />)
    expect(screen.getByRole('button', { name: /Créer une tâche CRM/ })).toBeDisabled()
  })
})

/**
 * #1952.38 — LA CLÉ D'IDEMPOTENCE DU GESTE, QUI MANQUAIT ICI.
 *
 * `ActionRouterService.dispatchIdempotent` rend la main à `dispatchOne` dès que
 * `idempotencyKey` est absente : la protection du routeur existait et ne
 * protégeait rien depuis cette fenêtre, alors que c'est celle qui engage le
 * plus — jusqu'à cinquante contacts d'un clic.
 *
 * Les trois tests se contredisent deux à deux : une clé aléatoire échoue au
 * premier, une clé unique pour tout le lot échoue au deuxième, une clé
 * strictement dérivée du contact échoue au troisième.
 */
describe('ExecuteActionDialog — la clé d’idempotence est celle du GESTE', () => {
  /** ⚠️ La clé est LUE, jamais supposée : comparer deux `undefined` donnerait un
   *  test vert alors qu'aucune clé ne part. */
  function keyOfIntent(intent: unknown): string {
    const key = (intent as { idempotencyKey?: string } | undefined)?.idempotencyKey
    expect(typeof key).toBe('string')
    return key as string
  }

  it('le même geste rejoué après un remontage porte la MÊME clé', async () => {
    // La requête reste EN VOL : l'état exact pendant lequel on rafraîchit, puis
    // on reclique en croyant que rien n'est parti.
    dispatch.mockImplementation(() => new Promise(() => {}))
    const u = user()
    const first = wrap(<ExecuteActionDialog open onOpenChange={vi.fn()} contacts={[{ id: 'c1', name: 'Marc' }]} />)
    await u.click(screen.getByRole('button', { name: 'Exécuter' }))
    first.unmount()

    wrap(<ExecuteActionDialog open onOpenChange={vi.fn()} contacts={[{ id: 'c1', name: 'Marc' }]} />)
    await u.click(screen.getByRole('button', { name: 'Exécuter' }))

    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(keyOfIntent(dispatch.mock.calls[1][0])).toBe(keyOfIntent(dispatch.mock.calls[0][0]))
  })

  it('chaque contact du lot porte SA clé — une clé commune n’en servirait qu’un', async () => {
    // Le routeur déduplique sur (espace, clé) : une clé partagée par les
    // cinquante intents ferait exécuter le PREMIER et avaler les quarante-neuf
    // autres, sans que rien n'échoue.
    const u = user()
    wrap(
      <ExecuteActionDialog
        open
        onOpenChange={vi.fn()}
        contacts={[
          { id: 'c1', name: 'Marc' },
          { id: 'c2', name: 'Julie' },
        ]}
      />,
    )

    await u.click(screen.getByRole('button', { name: 'Exécuter pour 2' }))

    const { intents } = dispatchBulk.mock.calls[0][0] as { intents: unknown[] }
    const keys = intents.map(keyOfIntent)
    expect(new Set(keys).size).toBe(2)
  })

  it('après une issue CONNUE, un geste refait délibérément porte une clé NEUVE', async () => {
    // Sans relâchement, le deuxième envoi VOULU — celui qu'on refait après
    // avoir branché le CRM, par exemple — serait dédoublonné contre le premier
    // et ne partirait jamais.
    dispatch.mockResolvedValue({ type: 'schedule_reminder', status: 'done' })
    const u = user()
    const first = wrap(<ExecuteActionDialog open onOpenChange={vi.fn()} contacts={[{ id: 'c1', name: 'Marc' }]} />)
    await u.click(screen.getByRole('button', { name: 'Exécuter' }))
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    first.unmount()

    wrap(<ExecuteActionDialog open onOpenChange={vi.fn()} contacts={[{ id: 'c1', name: 'Marc' }]} />)
    await u.click(screen.getByRole('button', { name: 'Exécuter' }))

    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(keyOfIntent(dispatch.mock.calls[1][0])).not.toBe(keyOfIntent(dispatch.mock.calls[0][0]))
  })
})

/**
 * Un geste qui engage N contacts annonce son TOTAL, pas seulement son prix
 * unitaire.
 *
 * L'écran disait « 1 crédit d'enrichissement par contact trouvé » et le bouton
 * « Exécuter pour 12 » ne portait aucune somme : le commercial devait faire la
 * multiplication de tête, juste avant de la payer. Le total exact est INCONNU
 * avant le run — seul un contact pour lequel un fournisseur trouve une
 * coordonnée est débité (`ContactsService.enrichContact` ne débite que sur
 * `matched`). On annonce donc un MAXIMUM, avec la phrase qui dit pourquoi il
 * peut être moindre — jamais une estimation fabriquée.
 */
describe('ExecuteActionDialog — le total engagé', () => {
  async function unitCost() {
    const { creditCostOf } = await import('@bellum/contracts')
    return creditCostOf('contact_enrichment')
  }

  it('mesure quelque chose — un enrichissement de contact coûte', async () => {
    expect(await unitCost()).toBeGreaterThan(0)
  })

  it('n’annonce AUCUN total sur une action sans coût', () => {
    // Un rappel est inclus. Afficher « jusqu'à 0 crédit » inventerait un
    // arbitrage là où il n'y en a pas.
    wrap(
      <ExecuteActionDialog
        open
        onOpenChange={vi.fn()}
        contacts={[
          { id: 'c1', name: 'Marc' },
          { id: 'c2', name: 'Julie' },
        ]}
      />,
    )
    expect(screen.queryByText(/Jusqu'à/)).not.toBeInTheDocument()
  })

  it('#4463 — choisir l’enrichissement n’annonce AUCUN total ni maximum en crédits', async () => {
    const u = user()
    wrap(
      <ExecuteActionDialog
        open
        onOpenChange={vi.fn()}
        contacts={[
          { id: 'c1', name: 'Marc' },
          { id: 'c2', name: 'Julie' },
          { id: 'c3', name: 'Sam' },
        ]}
      />,
    )

    await u.click(screen.getByRole('button', { name: /Enrichir le contact/ }))

    // Le choix est bien pris en compte (le bouton reste là) mais le coût engagé ne se lit plus.
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toHaveTextContent(/crédit/i)
    expect(dialog).not.toHaveTextContent(/Jusqu'à/)
    expect(dialog).not.toHaveTextContent(/ne sont pas débités/)
  })

  it('#4463 — un seul contact : toujours aucun crédit à l’écran', async () => {
    const u = user()
    wrap(<ExecuteActionDialog open onOpenChange={vi.fn()} contacts={[{ id: 'c1', name: 'Marc' }]} />)

    await u.click(screen.getByRole('button', { name: /Enrichir le contact/ }))

    expect(screen.getByRole('dialog')).not.toHaveTextContent(/crédit/i)
  })
})
