import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutreachDelegationView } from '@bellum/contracts'
import { currentMandate, MandateScopesBlock } from './MandateScopesBlock'
import {
  useDelegationAction,
  useOutreachDelegations,
  useRenewMandate,
  useSignScopedMandate,
} from '../hooks/useOutreachDelegations'
import { useMailboxStatus } from '@/features/mailbox/api'

vi.mock('../hooks/useOutreachDelegations', () => ({
  useOutreachDelegations: vi.fn(),
  useDelegationAction: vi.fn(),
  useSignScopedMandate: vi.fn(),
  useRenewMandate: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/mailbox/api', () => ({ useMailboxStatus: vi.fn() }))

/** Un retour de hook partiel, typé par le site d'appel (pas de `as never`). */
function hook<T>(value: unknown): T {
  return value as T
}

const sign = vi.fn()
const renew = vi.fn()
const act = vi.fn()

// Bornes RELATIVES à l'instant du test : le cycle de vie se calcule sur l'horloge réelle.
const mandate = (over: Partial<OutreachDelegationView> = {}): OutreachDelegationView =>
  ({
    id: 'm1',
    scope: 'laura_send',
    renewed_from: null,
    campaign_label: 'Laura envoie',
    sent_count: 3,
    max_messages: 30,
    contact_count: 0,
    window: { start_hour: 9, end_hour: 18 },
    starts_at: new Date(Date.now() - 86_400_000).toISOString(),
    expires_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    validated_at: new Date(Date.now() - 86_400_000).toISOString(),
    validated_by: ['u'],
    revoked_at: null,
    paused_at: null,
    ...over,
  }) as OutreachDelegationView

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useDelegationAction).mockReturnValue(hook({ mutate: act }))
  vi.mocked(useSignScopedMandate).mockReturnValue(hook({ mutate: sign, isPending: false }))
  vi.mocked(useRenewMandate).mockReturnValue(hook({ mutate: renew, isPending: false }))
  vi.mocked(useMailboxStatus).mockReturnValue(hook({ data: { connected: true, address: 'theo@esn.fr' } }))
})

describe('MandateScopesBlock (#4016 L5)', () => {
  it('chaque usage sans mandat DIT qu’il attend la validation — jamais une promesse d’automatisme', () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(hook({ data: [] }))
    render(<MandateScopesBlock canSend />)
    expect(screen.getAllByText('Pas de mandat : chaque message attend ta validation')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Signer le mandat' })).toHaveLength(4)
  })

  // #4016.4 — « renouvelable » doit se LIRE à l'écran, pas seulement exister dans le code.
  it('dit que le mandat est renouvelable, avec ou sans mandat signé', () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(hook({ data: [] }))
    const { unmount } = render(<MandateScopesBlock canSend />)
    expect(screen.getByText(/renouvelable/i)).toBeInTheDocument()
    unmount()
    vi.mocked(useOutreachDelegations).mockReturnValue(hook({ data: [mandate()] }))
    render(<MandateScopesBlock canSend />)
    expect(screen.getByText(/renouvelable/i)).toBeInTheDocument()
  })

  it('signer exige de COCHER la signature : le bouton reste inerte avant', async () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(hook({ data: [] }))
    const user = userEvent.setup()
    render(<MandateScopesBlock canSend />)
    await user.click(screen.getAllByRole('button', { name: 'Signer le mandat' })[1] as HTMLElement)
    const confirm = screen.getByRole('button', { name: 'Signer' })
    expect(confirm).toBeDisabled()
    await user.click(
      screen.getByRole('checkbox', { name: 'Je signe ce mandat et je sais que je peux le révoquer à tout moment.' }),
    )
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'laura_send', signed: true, sender_mailbox_id: 'theo@esn.fr' }),
      expect.anything(),
    )
  })

  it('un mandat actif se révoque ; il ne se re-signe pas tant qu’il vit', () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(hook({ data: [mandate()] }))
    render(<MandateScopesBlock canSend />)
    expect(screen.getByText(/Mandat signé, actif jusqu’au/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Révoquer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renouveler' })).toBeNull()
  })

  it('#4293.2 — un mandat actif se met en PAUSE ; en pause il le dit (badge) et se REPREND sans re-signer', async () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(hook({ data: [mandate()] }))
    const { unmount } = render(<MandateScopesBlock canSend />)
    await userEvent.click(screen.getByRole('button', { name: 'Mettre en pause' }))
    expect(act).toHaveBeenCalledWith({ id: 'm1', action: 'pause' })
    expect(screen.queryByRole('button', { name: 'Reprendre' })).toBeNull()
    unmount()

    vi.mocked(useOutreachDelegations).mockReturnValue(
      hook({ data: [mandate({ paused_at: new Date().toISOString() })] }),
    )
    render(<MandateScopesBlock canSend />)
    expect(screen.getByText('En pause')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mettre en pause' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Reprendre' }))
    expect(act).toHaveBeenCalledWith({ id: 'm1', action: 'resume' })
    // Quatre usages, un seul mandat (en pause) : les trois autres se signent, celui-ci ne se re-signe pas.
    expect(screen.getAllByRole('button', { name: 'Signer le mandat' })).toHaveLength(3)
  })

  it('#4293.2 — un mandat expiré ne se reprend pas : il se renouvelle', () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(
      hook({
        data: [
          mandate({
            paused_at: new Date(Date.now() - 86_400_000).toISOString(),
            expires_at: new Date(Date.now() - 1000).toISOString(),
          }),
        ],
      }),
    )
    render(<MandateScopesBlock canSend />)
    expect(screen.queryByRole('button', { name: 'Reprendre' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Renouveler' })).toBeInTheDocument()
  })

  it('un mandat expiré se RENOUVELLE — par une nouvelle signature', async () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(
      hook({
        data: [mandate({ expires_at: new Date(Date.now() - 3_600_000).toISOString() })],
      }),
    )
    const user = userEvent.setup()
    render(<MandateScopesBlock canSend />)
    await user.click(screen.getByRole('button', { name: 'Renouveler' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Je signe ce mandat et je sais que je peux le révoquer à tout moment.' }),
    )
    await user.click(screen.getByRole('button', { name: 'Signer' }))
    expect(renew).toHaveBeenCalledWith({ id: 'm1', body: { duration_days: 14, signed: true } }, expect.anything())
    expect(sign).not.toHaveBeenCalled()
  })

  it('sans messagerie branchée, aucun mandat ne se signe', () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(hook({ data: [] }))
    render(<MandateScopesBlock canSend={false} />)
    for (const button of screen.getAllByRole('button', { name: 'Signer le mandat' })) expect(button).toBeDisabled()
  })

  it('#4016.L5 — sans messagerie : boutons inertes, la raison et le lien pour connecter ; avec messagerie : actifs, pas de lien', () => {
    vi.mocked(useOutreachDelegations).mockReturnValue(hook({ data: [] }))
    const { unmount } = render(<MandateScopesBlock canSend={false} />)
    expect(screen.getByText(/aucun mandat ne peut être signé/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connecter une messagerie' })).toHaveAttribute('href', '/integrations')
    for (const button of screen.getAllByRole('button', { name: 'Signer le mandat' })) expect(button).toBeDisabled()
    unmount()
    render(<MandateScopesBlock canSend />)
    expect(screen.queryByRole('link', { name: 'Connecter une messagerie' })).toBeNull()
    for (const button of screen.getAllByRole('button', { name: 'Signer le mandat' })) expect(button).toBeEnabled()
  })

  it('le mandat lu est le plus récent NON révoqué de la portée — une campagne n’en tient pas lieu', () => {
    const list = [
      mandate({ id: 'old', validated_at: '2026-10-01T00:00:00.000Z' }),
      mandate({ id: 'new', validated_at: '2026-10-05T00:00:00.000Z' }),
      mandate({ id: 'gone', validated_at: '2026-10-09T00:00:00.000Z', revoked_at: '2026-10-10T00:00:00.000Z' }),
      mandate({ id: 'camp', scope: 'campaign', validated_at: '2026-10-11T00:00:00.000Z' }),
    ]
    expect(currentMandate(list, 'laura_send')?.id).toBe('new')
    expect(currentMandate(list, 'payment_reminder')).toBeNull()
  })
})
