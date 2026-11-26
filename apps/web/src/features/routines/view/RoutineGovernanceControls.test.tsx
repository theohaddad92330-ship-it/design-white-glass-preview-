import type { RoutineView } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mutate = vi.fn()
vi.mock('../api', () => ({
  useUpdateRoutine: () => ({ mutate, isPending: false }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: '11111111-1111-4111-8111-111111111111', fullName: 'Moi', email: null, role: 'sales', isSelf: true },
      {
        userId: '22222222-2222-4222-8222-222222222222',
        fullName: 'Camille Roux',
        email: null,
        role: 'admin',
        isSelf: false,
      },
    ],
  }),
}))

const { RoutineGovernanceControls } = await import('./RoutineControls')

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})
beforeEach(() => mutate.mockReset())

function view(over: Partial<RoutineView['definition']> = {}, sub: Partial<RoutineView['subscription']> = {}) {
  return {
    definition: {
      key: 'margin_alert',
      name: { fr: 'Alerte marge', en: 'Margin alert' },
      description: { fr: 'd', en: 'd' },
      outcome: { fr: 'o', en: 'o' },
      cadence: 'weekly',
      defaultHour: 9,
      defaultWeekday: 1,
      requires: [],
      defaultChannel: 'in_app',
      automationLevel: 'n4_bounded_auto',
      condition: { fr: 'c', en: 'c' },
      reads: { fr: 'r', en: 'r' },
      fallback: { fr: 'f', en: 'f' },
      acceptance: { fr: 'a', en: 'a' },
      defaultEnabled: false,
      example: null,
      stopCondition: null,
      version: 1,
      roles: ['manager'],
      workspaceProfiles: ['staffing', 'forfait_conseil'],
      scope: 'workspace',
      steps: ['read', 'check_condition', 'notify'],
      preparedActions: ['notification'],
      validations: ['review_before_acting'],
      budget: 'model_call',
      ...over,
    },
    subscription: {
      key: 'margin_alert',
      status: 'paused',
      enabled: false,
      hour: 9,
      weekday: 1,
      channel: 'in_app',
      timeZone: 'Europe/Paris',
      maxItemsPerRun: null,
      autonomy: null,
      ownerUserId: null,
      ...sub,
    },
    blockers: [],
    lastRunAt: null,
    lastOutcome: null,
    nextTriggerAt: null,
    updated: false,
  } satisfies RoutineView
}

describe('#2843.13 — autonomie, portée, owner et validations à l’écran', () => {
  it('l’autonomie se règle : seulement le niveau du catalogue ou « m’informer sans notifier »', async () => {
    render(<RoutineGovernanceControls view={view()} />)
    const u = userEvent.setup()
    await u.click(screen.getByRole('combobox', { name: 'Autonomie' }))
    const options = screen.getAllByRole('option').map(option => option.textContent)
    expect(options).toEqual(['Garde le résultat sans notifier', 'Notifie sans envoyer'])
    await u.click(screen.getByRole('option', { name: 'Garde le résultat sans notifier' }))
    expect(mutate).toHaveBeenCalledWith({ key: 'margin_alert', patch: { autonomy: 'n0_inform' } })
  })

  it('revenir au niveau du catalogue efface le réglage (null), jamais une copie du défaut', async () => {
    render(<RoutineGovernanceControls view={view({}, { autonomy: 'n0_inform' })} />)
    const u = userEvent.setup()
    await u.click(screen.getByRole('combobox', { name: 'Autonomie' }))
    await u.click(screen.getByRole('option', { name: 'Notifie sans envoyer' }))
    expect(mutate).toHaveBeenCalledWith({ key: 'margin_alert', patch: { autonomy: null } })
  })

  it('l’owner se règle pour une routine qui lit l’espace', async () => {
    render(<RoutineGovernanceControls view={view()} />)
    const u = userEvent.setup()
    await u.click(screen.getByRole('combobox', { name: 'Owner' }))
    await u.click(screen.getByRole('option', { name: 'Camille Roux' }))
    expect(mutate).toHaveBeenCalledWith({
      key: 'margin_alert',
      patch: { ownerUserId: '22222222-2222-4222-8222-222222222222' },
    })
  })

  it('une routine personnelle n’offre pas d’owner : elle reste à toi, et le dit', () => {
    render(<RoutineGovernanceControls view={view({ scope: 'personal' })} />)
    expect(screen.queryByRole('combobox', { name: 'Owner' })).toBeNull()
    expect(screen.getByText('Owner : toi')).toBeTruthy()
  })

  it('la portée et les validations sont nommées ; aucun coût, aucun crédit (c132)', () => {
    const { container } = render(<RoutineGovernanceControls view={view()} />)
    expect(screen.getByText('Portée : l’espace')).toBeTruthy()
    expect(screen.getByText('Validation : tu relis avant d’agir')).toBeTruthy()
    expect(container.textContent).not.toMatch(/coût|crédit|model_call/i)
  })
})
