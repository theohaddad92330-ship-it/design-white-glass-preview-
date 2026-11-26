import { describe, expect, it, vi } from 'vitest'
import type { OnboardingState } from '../api'
import { readOnboardingStateOrUnknown } from './guard-state'

const STATE = { id: 'ob-1', status: 'in_progress' } as unknown as OnboardingState

describe('readOnboardingStateOrUnknown — un garde de route ne peut pas planter', () => {
  it('rend l’état quand le serveur répond', async () => {
    await expect(readOnboardingStateOrUnknown(async () => STATE)).resolves.toEqual(STATE)
  })

  it('rend « inconnu » sur un 429 au lieu de propager — c’est ce qui produisait l’écran « Oups »', async () => {
    const read = vi.fn().mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }))

    await expect(readOnboardingStateOrUnknown(read)).resolves.toBeNull()
  })

  it('rend « inconnu » sur une coupure réseau', async () => {
    const read = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(readOnboardingStateOrUnknown(read)).resolves.toBeNull()
  })
})
