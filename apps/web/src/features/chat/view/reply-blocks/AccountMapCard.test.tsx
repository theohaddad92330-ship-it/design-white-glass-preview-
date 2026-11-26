import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'
import { ReplyFollowUpProvider } from '../reply-follow-up'

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

/**
 * #3762 (BEL-LAU-1005) — « une cartographie de comptes utilise TOUJOURS ce
 * squelette ». Le tour : « ouvre mon périmètre à Montpellier et périphérie » →
 * la réponse de Laura porte la carte `account_map` ; ce test prouve que chaque
 * étage du squelette atteint l'écran, et qu'une sélection partielle reste une
 * carte élégante (aucune ligne vide, aucun « 0 »).
 */
const map = {
  type: 'account_map',
  title: 'Cartographie Montpellier et périphérie',
  completeness: { level: 'partial', label: 'Partielle' },
  context: [
    { kind: 'territory', label: 'Montpellier + 30 km' },
    { kind: 'sector', label: 'Industrie' },
  ],
  framing: {
    origin: "Comptes enregistrés dans l'espace sur le département 34.",
    proves: 'Ces entreprises existent et sont rattachées au territoire.',
    not_proven: 'Elle ne prouve ni un budget, ni un besoin ouvert.',
  },
  summary: {
    retained_count: 2,
    qualification: 'Un compte prioritaire, un à qualifier',
    main_reserve: 'Aucun contact vérifié sur Beta Services.',
  },
  accounts: [
    {
      name: 'Alpha Industrie',
      href: '/accounts/alpha-1',
      status: { level: 'priority', label: 'Prioritaire' },
      proof: 'Signal cyber daté de juillet 2026.',
      tags: ['Industrie', 'Cloud'],
      caution: 'Budget non confirmé.',
      next_action: { label: 'Ouvrir la fiche', href: '/accounts/alpha-1' },
    },
    {
      name: 'Beta Services',
      status: { level: 'to_qualify', label: 'À qualifier' },
      proof: 'Présent dans le registre local.',
      caution: 'Aucun signal daté.',
      next_action: { label: 'Chercher un premier contact' },
    },
  ],
  memory: ['Deux comptes déjà vus dans une recherche précédente.'],
  to_document: ['Contacts décisionnaires de Beta Services.'],
  method_limit: "Sélection limitée aux comptes déjà enregistrés dans l'espace.",
  actions: {
    validate: { label: "Valider l'ouverture du périmètre" },
    discover: { label: 'Ouvrir dans Découvrir', href: '/search' },
    enrich: { label: 'Enrichir la recherche' },
    save: { label: 'Sauvegarder la sélection' },
  },
}

const gridOf = (group: HTMLElement) => {
  const grid = group.querySelector<HTMLElement>('[data-map-section="grid"]')!
  return {
    // #3761 — les cartes de la grille, pas les tags métiers qu'elles portent (eux aussi des <li>).
    getAllByRole: (_role: 'listitem') =>
      within(grid)
        .getAllByRole('listitem')
        .filter(item => item.parentElement?.hasAttribute('data-reply-grid')),
  }
}

function card(extra: Record<string, unknown> = {}) {
  return renderWithRouter(<StructuredReply text={fence({ ...map, ...extra })} />)
}

describe('#3762 — la cartographie de comptes', () => {
  it('rend le squelette complet : en-tête, cadrage, synthèse, grille, secondaires, actions', async () => {
    const { container } = card()
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    expect(group).toHaveAttribute('data-reply-block', 'account_map')
    expect(within(group).getByText('Partielle')).toBeInTheDocument()
    expect(within(group).getByText('Montpellier + 30 km')).toBeInTheDocument()
    expect(within(group).getByText('Industrie', { selector: '[data-map-context]' })).toBeInTheDocument()
    for (const section of ['framing', 'summary', 'grid', 'secondary', 'actions']) {
      expect(container.querySelector(`[data-map-section="${section}"]`), section).not.toBeNull()
    }
    expect(within(group).getByText('Elle ne prouve ni un budget, ni un besoin ouvert.')).toBeInTheDocument()
    expect(within(group).getByText(/2 comptes retenus/)).toBeInTheDocument()
    expect(within(group).getByText('Aucun contact vérifié sur Beta Services.')).toBeInTheDocument()
  })

  it('chaque carte de compte porte sa raison, sa prudence et sa prochaine action', async () => {
    card()
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    const items = gridOf(group).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(within(item).getByText(/Prudence/)).toBeInTheDocument()
      expect(within(item).getByText(/Prochaine action/)).toBeInTheDocument()
    }
    expect(within(items[0]!).getByText('Prioritaire')).toBeInTheDocument()
    expect(within(items[0]!).getByText('Signal cyber daté de juillet 2026.')).toBeInTheDocument()
    expect(within(items[1]!).getByText('Aucun signal daté.')).toBeInTheDocument()
  })

  it('une absence ne fait aucune ligne : sans blocs secondaires ni tags, rien d’autre ne s’affiche', async () => {
    const { container } = card({
      memory: undefined,
      to_document: undefined,
      method_limit: undefined,
      actions: undefined,
      accounts: [{ ...map.accounts[1] }],
      summary: { retained_count: 1, qualification: 'Un compte à qualifier' },
    })
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    expect(container.querySelector('[data-map-section="secondary"]')).toBeNull()
    expect(container.querySelector('[data-map-section="actions"]')).toBeNull()
    expect(within(group).queryByText(/Réserve principale/)).toBeNull()
    expect(within(group).getByText(/1 compte retenu/)).toBeInTheDocument()
  })

  it('ne tombe jamais en puces : une carte sans prudence est refusée et ses textes restent lisibles', async () => {
    const broken = { ...map, accounts: [{ ...map.accounts[0], caution: undefined }] }
    renderWithRouter(<StructuredReply text={fence(broken)} />)
    expect(screen.queryByRole('group', { name: 'Cartographie Montpellier et périphérie' })).toBeNull()
    // #4445.1 — la liste de repli se replie au-delà de cinq lignes : lisible = atteignable en un geste.
    for (const more of await screen.findAllByRole('button', { name: /^Voir (les )?\d+ autres?$/ })) {
      await userEvent.click(more)
    }
    expect(await screen.findByText('Signal cyber daté de juillet 2026.')).toBeInTheDocument()
  })

  it('les actions sans écran envoient leur libellé dans la conversation ; celle qui a un écran est un lien', async () => {
    const onSend = vi.fn()
    renderWithRouter(
      <ReplyFollowUpProvider onSend={onSend}>
        <StructuredReply text={fence(map)} />
      </ReplyFollowUpProvider>,
    )
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    await userEvent.click(within(group).getByRole('button', { name: 'Enrichir la recherche' }))
    expect(onSend).toHaveBeenCalledWith('Enrichir la recherche')
    expect(within(group).getByRole('link', { name: 'Ouvrir dans Découvrir' })).toBeInTheDocument()
  })

  it('sans fil actif (fil partagé, historique), une action sans écran reste un libellé, jamais un bouton muet', async () => {
    card()
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    expect(within(group).getByText('Enrichir la recherche')).toBeInTheDocument()
    expect(within(group).queryByRole('button', { name: 'Enrichir la recherche' })).toBeNull()
  })

  it('déplie les cartes au-delà de six, au clavier', async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({ ...map.accounts[1], name: `Compte ${index + 1}` }))
    card({ accounts: many, summary: { retained_count: 8, qualification: 'Huit comptes à qualifier' } })
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    expect(gridOf(group).getAllByRole('listitem')).toHaveLength(6)
    await userEvent.click(within(group).getByRole('button', { name: /Afficher les 2 autres résultats/ }))
    expect(gridOf(group).getAllByRole('listitem')).toHaveLength(8)
  })
})

describe('#3759 — une puce de contexte ne montre jamais le nom technique du genre', () => {
  it('une puce dont le libellé est le genre brut (« territory ») s’écrit dans la langue de l’interface', async () => {
    card({
      context: [
        { kind: 'territory', label: 'territory' },
        { kind: 'sector', label: 'Industrie' },
      ],
    })
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    expect(within(group).queryByText('territory')).toBeNull()
    expect(within(group).getByText('Territoire', { selector: '[data-map-context="territory"]' })).toBeInTheDocument()
    expect(within(group).getByText('Industrie', { selector: '[data-map-context="sector"]' })).toBeInTheDocument()
  })
})

describe('#5013.3 — aucune clé technique dans les puces de la cartographie', () => {
  it('un libellé qui est le nom brut d’un AUTRE genre se traduit aussi, et un niveau brut aussi', async () => {
    card({
      completeness: { level: 'partial', label: 'partial' },
      context: [
        { kind: 'territory', label: 'sector' },
        { kind: 'size', label: ' Territory ' },
        { kind: 'filter', label: 'FILTER' },
      ],
    })
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    for (const raw of ['sector', 'territory', 'partial', 'FILTER']) expect(within(group).queryByText(raw)).toBeNull()
    expect(within(group).getByText('Partielle', { selector: '[data-map-completeness="partial"]' })).toBeInTheDocument()
    expect(within(group).getByText('Secteur', { selector: '[data-map-context="territory"]' })).toBeInTheDocument()
    expect(within(group).getByText('Territoire', { selector: '[data-map-context="size"]' })).toBeInTheDocument()
    expect(within(group).getByText('Filtre', { selector: '[data-map-context="filter"]' })).toBeInTheDocument()
  })
})

// #3761.4 / .5 / .7 / .11 — les pièces de la bibliothèque `reply-kit` ont un APPELANT : la carte les compose.
describe('#3761 — la cartographie compose la bibliothèque de réponses', () => {
  it('la synthèse est un panneau de synthèse, la réserve un bandeau de prudence', async () => {
    const { container } = card()
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    const summary = container.querySelector<HTMLElement>('[data-map-section="summary"]')!
    expect(summary.querySelector('[data-reply-summary]')).not.toBeNull()
    const caution = within(group).getByText('Aucun contact vérifié sur Beta Services.').closest('[data-reply-caution]')
    expect(caution).not.toBeNull()
  })

  it('la grille est la grille de cartes, les tags sont des tags métiers', async () => {
    const { container } = card()
    const group = await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    expect(container.querySelector('[data-map-section="grid"] [data-reply-grid]')).not.toBeNull()
    const tags = within(group).getByRole('list', { name: 'Tags' })
    expect(
      within(tags)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual(['Industrie', 'Cloud'])
  })

  it('une absence ne fait aucune ligne : sans réserve, pas de bandeau ; sans tag, pas de liste de tags', async () => {
    const { container } = card({
      summary: { retained_count: 1, qualification: 'Un compte à qualifier' },
      accounts: [{ ...map.accounts[1] }],
    })
    await screen.findByRole('group', { name: 'Cartographie Montpellier et périphérie' })
    expect(container.querySelector('[data-reply-caution]')).toBeNull()
    expect(container.querySelector('[data-reply-tags]')).toBeNull()
  })
})
