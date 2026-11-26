import type { Account } from '@bellum/contracts'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

let landscape: Record<string, unknown> = {}

vi.mock('@/lib/api', () => ({ apiFetch: () => Promise.resolve(landscape) }))

let seq = 0
const nextAccount = () => ({ id: `a-workspace-${++seq}`, company_name: 'SNCF' }) as Account
const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'ALTEN',
  rank: 'rank1',
  relationship: 'partner',
  note: null,
  source: 'declared',
  placements: 0,
  certainty: null,
  scope: null,
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  ...over,
})

beforeEach(() => {
  cleanup()
  landscape = { partners: [], recommendations: [], observed: [] }
})

/**
 * #2151.42 / #2166.38 — LA RELATION WORKSPACE.
 *
 * `workspace_account_id` ne voyage QUE quand `PartnersService.attachLogos` a
 * apparié ce partenaire, SANS AMBIGUÏTÉ, à un compte déjà possédé de l'espace
 * — même rapprochement que le logo (#1818.2), jamais un compte deviné. Un
 * badge sur la carte annonce le fait, un lien réel vit dans la modale (les
 * CTA y ont déménagé, #1818.1) — jamais un `<a>` imbriqué dans le `<button>`
 * de la carte.
 */
describe('TabPartners — la relation workspace (#2151.42 / #2166.38)', () => {
  it('annonce la relation sur la carte quand le partenaire est un compte connu', async () => {
    landscape = { partners: [partner({ workspace_account_id: 'acc-known' })], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByRole('button', { name: /Voir le détail de ALTEN/i })
    expect(screen.getByText(/dans ton portefeuille/i)).toBeInTheDocument()
  })

  it('ne dit rien pour un partenaire qui n’est PAS un compte connu — jamais devinée', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByRole('button', { name: /Voir le détail de ALTEN/i })
    expect(screen.queryByText(/dans ton portefeuille/i)).not.toBeInTheDocument()
  })

  it('la modale porte un LIEN réel vers la fiche du compte connu', async () => {
    landscape = { partners: [partner({ workspace_account_id: 'acc-known' })], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const dialogue = await screen.findByRole('dialog')

    const link = within(dialogue).getByRole('link', { name: /fiche de ALTEN dans ton portefeuille/i })
    expect(link).toHaveAttribute('href', '/accounts/acc-known')
  })

  it('aucun `<a>` imbriqué dans le bouton de la carte — ce qui se clique se tabule (GA-35)', async () => {
    landscape = { partners: [partner({ workspace_account_id: 'acc-known' })], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const bouton = await screen.findByRole('button', { name: /Voir le détail de ALTEN/i })
    expect(within(bouton).queryByRole('link')).not.toBeInTheDocument()
  })
})
