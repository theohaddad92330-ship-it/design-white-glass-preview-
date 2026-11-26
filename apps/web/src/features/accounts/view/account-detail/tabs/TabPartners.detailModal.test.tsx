import type { Account } from '@bellum/contracts'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

let landscape: Record<string, unknown> = {}

vi.mock('@/lib/api', () => ({ apiFetch: () => Promise.resolve(landscape) }))

// ⚠️ Un identifiant DIFFÉRENT par test — `renderWithRouter` partage un
// `QueryClient` de niveau module, voir `TabPartners.evidence.test.tsx`.
let seq = 0
const nextAccount = () => ({ id: `a-modal-${++seq}`, company_name: 'SNCF' }) as Account
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
 * #1818 — UNE CARTE DE PARTENAIRE S'OUVRE SUR UNE MODALE DE DÉTAIL.
 *
 * Réutilise `BrowsableDialog` (#1797) plutôt que d'en fabriquer une seconde —
 * voir son docblock : « le premier qui en a besoin le pose là où le deuxième
 * pourra le prendre ».
 */
describe('TabPartners — une carte s’ouvre en modale de détail (#1818.1)', () => {
  it('la carte est un vrai bouton — ce qui se clique se tabule (GA-35)', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const bouton = await screen.findByRole('button', { name: /Voir le détail de ALTEN/i })
    expect(bouton.tagName).toBe('BUTTON')
    expect(bouton).toHaveAttribute('type', 'button')
  })

  it('le clic ouvre une modale qui NOMME le partenaire', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))

    const dialogue = await screen.findByRole('dialog')
    expect(within(dialogue).getByText('ALTEN')).toBeInTheDocument()
  })

  it('deux partenaires : les flèches passent de l’un à l’autre SANS refermer', async () => {
    landscape = {
      partners: [partner({ id: 'p-1', name: 'ALTEN' }), partner({ id: 'p-2', name: 'Nordiq' })],
      recommendations: [],
      observed: [],
    }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const dialogue = await screen.findByRole('dialog')
    expect(within(dialogue).getByText('ALTEN')).toBeInTheDocument()

    await user.click(within(dialogue).getByRole('button', { name: /suivant|next/i }))
    expect(within(dialogue).getByText('Nordiq')).toBeInTheDocument()
    expect(within(dialogue).queryByText('ALTEN')).not.toBeInTheDocument()
  })

  it('un seul partenaire : les deux flèches sont désactivées, jamais de boucle', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const dialogue = await screen.findByRole('dialog')

    expect(within(dialogue).getByRole('button', { name: /précédent|previous/i })).toBeDisabled()
    expect(within(dialogue).getByRole('button', { name: /suivant|next/i })).toBeDisabled()
  })
})

/**
 * #1818.3 — « moins de blabla en gris ». La même phrase de 30 mots (l'angle
 * rang-2, générique dès que la battlecard ne connaît pas l'ESN) se répétait à
 * l'identique sur chaque carte. Elle n'informe pas, elle occupe : elle sort de
 * la carte et rejoint la modale, une seule fois, au clic.
 */
describe('TabPartners — la note générique quitte la carte pour la modale (#1818.3)', () => {
  const notePartner = partner({
    note: 'Rang 2 : solliciter ALTEN pour de la sous-traitance / co-traitance — se positionner en renfort de niche là où elle manque de bras ou d’expertise.',
  })

  it('n’apparaît PAS sur la carte tant que la modale n’est pas ouverte', async () => {
    landscape = { partners: [notePartner], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByRole('button', { name: /Voir le détail de ALTEN/i })
    expect(screen.queryByText(/se positionner en renfort de niche/)).not.toBeInTheDocument()
  })

  it('apparaît dans la modale, UNE SEULE FOIS, une fois ouverte', async () => {
    landscape = { partners: [notePartner], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))

    expect(screen.getAllByText(/se positionner en renfort de niche/)).toHaveLength(1)
  })
})

/**
 * #1818.2 — l'identité visuelle du partenaire. Aucun logo réel n'est
 * disponible pour une ESN détectée (`AccountPartner` ne porte ni domaine ni
 * site — voir `unwritten-columns.ts` pour `esn_directory.domain`, la même
 * absence documentée un cran plus loin) : l'avatar retombe honnêtement sur
 * l'initiale, jamais une image devinée.
 */
describe('TabPartners — l’identité visuelle de la carte et de la modale (#1818.2)', () => {
  it('la carte porte un avatar par partenaire', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByRole('button', { name: /Voir le détail de ALTEN/i })
    expect(screen.getByTestId('partner-avatar-p-1')).toBeInTheDocument()
  })

  it('la modale porte aussi un avatar, dans son entête', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    expect(screen.getByTestId('partner-modal-avatar')).toBeInTheDocument()
  })
})

/**
 * #2298.7 — QUI a déclaré la relation, et QUAND — dans la modale de détail.
 *
 * `created_at` porte déjà QUAND ; ce lot ajoute QUI. Une ligne DÉTECTÉE
 * (`source: 'analysis'`) n'a personne à nommer — la mention n'apparaît que
 * sur une ligne DÉCLARÉE.
 */
describe('TabPartners — le déclarant, dans la modale de détail (#2298.7)', () => {
  it('une ligne DÉCLARÉE avec un déclarant connu affiche « Déclarée par <nom> le <date> »', async () => {
    landscape = {
      partners: [
        partner({ source: 'declared', declared_by_name: 'Louis Schlegel', created_at: '2026-09-01T00:00:00.000Z' }),
      ],
      recommendations: [],
      observed: [],
    }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const dialogue = await screen.findByRole('dialog')
    expect(within(dialogue).getByText(/Louis Schlegel/)).toBeInTheDocument()
  })

  it('une ligne DÉCLARÉE sans déclarant retrouvé dit « auteur inconnu », jamais un nom deviné', async () => {
    landscape = {
      partners: [partner({ source: 'declared', declared_by_name: null, created_at: '2026-09-01T00:00:00.000Z' })],
      recommendations: [],
      observed: [],
    }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const dialogue = await screen.findByRole('dialog')
    expect(within(dialogue).getByText(/auteur inconnu/i)).toBeInTheDocument()
  })

  it('une ligne DÉTECTÉE (pipeline) ne nomme AUCUN déclarant — personne n’a rien saisi', async () => {
    landscape = {
      partners: [partner({ source: 'analysis', declared_by_name: null, detected_at: '2026-09-01T00:00:00.000Z' })],
      recommendations: [],
      observed: [],
    }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const dialogue = await screen.findByRole('dialog')
    expect(within(dialogue).queryByText(/auteur inconnu/i)).not.toBeInTheDocument()
    expect(within(dialogue).queryByText(/Déclarée par/i)).not.toBeInTheDocument()
  })
})
