import { describe, expect, it } from 'vitest'
import { aDesPiecesJointes, type FeedbackItem } from './feedback'

/**
 * #1792 (bug trouvé en chemin, 09/09) — `client_context.attachments` était
 * écrit en base et lu par AUCUN écran. `has_attachments` est le pendant EXACT
 * de `has_screenshot` (voir `aUneCapture`) : le lien lui-même ne voyage plus
 * dans la liste (voir `feedback.service.spec.ts` côté API), seul ce booléen
 * dit qu'il y en a.
 */
function item(overrides: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: 'fb-1',
    user_id: 'u-1',
    account_id: null,
    category: 'bug',
    message: 'ça casse',
    user_email: null,
    page_url: null,
    user_agent: null,
    console_logs: null,
    client_context: null,
    github_issue_number: null,
    github_issue_url: null,
    created_at: '2026-09-09T00:00:00Z',
    issue: null,
    ...overrides,
  }
}

describe('aDesPiecesJointes (#1792)', () => {
  it('LIT quelque chose — `has_attachments: true` rend vrai', () => {
    expect(aDesPiecesJointes(item({ has_attachments: true }))).toBe(true)
  })

  it('sait dire NON — `has_attachments: false` rend faux', () => {
    expect(aDesPiecesJointes(item({ has_attachments: false }))).toBe(false)
  })

  // ⚠️ N'invente pas « il y en a » sur une API antérieure au champ : le lien
  // lui-même a été retiré de la liste en même temps que ce champ est apparu,
  // il n'y a donc de toute façon rien à demander tant que les deux versions
  // n'ont pas déployé ensemble.
  it('n’attrape pas ce qu’elle ne vise pas — `undefined` (API antérieure au champ) ne devient pas vrai', () => {
    expect(aDesPiecesJointes(item({ has_attachments: undefined }))).toBe(false)
    expect(aDesPiecesJointes(item({}))).toBe(false)
  })
})
