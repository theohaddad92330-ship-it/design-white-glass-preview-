import { describe, expect, it } from 'vitest'
import type { PendingChatAction } from '@bellum/contracts'
import { isNavigationOnlyAction } from './navigation-only-action'

const open = (extra: Record<string, unknown> = {}) =>
  ({ action: 'open_screen', route: '/accounts', label: 'tes comptes', ...extra }) as PendingChatAction

describe('isNavigationOnlyAction (#3776.6)', () => {
  it('ouvrir un écran gratuit : pas de carte de validation', () => {
    expect(isNavigationOnlyAction(open())).toBe(true)
    expect(isNavigationOnlyAction(open({ cost_credits: 0 }))).toBe(true)
  })
  it('ouvrir un écran PAYANT garde sa validation', () => {
    expect(isNavigationOnlyAction(open({ cost_credits: 3 }))).toBe(false)
  })
  it('une écriture, un envoi ou un formulaire pré-rempli gardent leur validation', () => {
    for (const action of ['prepare_mail_draft', 'schedule_reminder', 'prepare_consultant_record', 'enrich_contact']) {
      expect(isNavigationOnlyAction({ action } as unknown as PendingChatAction)).toBe(false)
    }
  })
})
