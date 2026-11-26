/**
 * ⚠️ #2613 — CE FICHIER NAÎT DU RENVERSEMENT. Décision de Louis du 20/09/2026 :
 * « on affiche pas ce qu'on a pas, on va pas mettre non mesuré et tout ça,
 * ça envoie juste un signal négatif à l'user qui est pas utile. »
 * Portée tranchée le même jour : **partout dans les LISTES, mais un SCORE
 * garde ses axes.**
 *
 * Une ligne de personne dans Découvrir est une LISTE. Elle portait trois
 * énoncés dont le seul contenu était une absence — « Non su : la localisation
 * · l'expertise… », « Poste non confirmé — aucune date de dernière
 * vérification », « source non renseignée ». Les trois disparaissent.
 *
 * ⚠️ CE QUI TIENT ENCORE, et qu'on ne rouvre pas :
 *  - une valeur absente ne devient JAMAIS « 0 », ni un tiret, ni « N/A » : la
 *    ligne disparaît, elle ne se chiffre pas (GA-19) ;
 *  - le MODÈLE garde `row.unknown` : il sert aux filtres, qui n'écartent
 *    jamais une personne sur une absence. Ce qui change est l'AFFICHAGE ;
 *  - sous un SCORE, l'énoncé des axes non évaluables reste nommé (GA-18).
 */
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiscoverContactRow } from '@/features/discover/lib/discover-contact-rows'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { label: string; alwaysVisible?: boolean; accountId?: string }) => (
    <span
      data-testid="ask-laura"
      data-always={String(Boolean(props.alwaysVisible))}
      data-account={props.accountId ?? ''}
    >
      {props.label}
    </span>
  ),
}))
import { ContactResultRow } from './ContactResultRow'

function row(overrides: Partial<DiscoverContactRow> = {}): DiscoverContactRow {
  return {
    id: 'c-1',
    fullName: 'Claire Mercier',
    company: 'Acme',
    title: 'DSI',
    entity: null,
    decisionRole: null,
    level: null,
    expertise: null,
    channels: { email: true, phone: false },
    location: null,
    reason: null,
    provenance: { sourceTag: null, seenAt: null },
    unknown: ['location', 'expertise', 'level', 'jobFreshness', 'reason'],
    relation: 'to_contact',
    accountId: null,
    ...overrides,
  } as DiscoverContactRow
}

describe('ContactResultRow — #2613, on affiche ce qu’on sait', () => {
  it('n’écrit AUCUNE ligne « Non su », et pas davantage un tiret ou un zéro', async () => {
    const { container } = renderWithRouter(<ContactResultRow row={row()} />)
    expect(await screen.findByText('Claire Mercier')).toBeInTheDocument()
    expect(screen.queryByText(/Non su/)).not.toBeInTheDocument()
    expect(screen.queryByText(/la localisation/)).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/N\/A|\b0\b/)
  })

  it('ne dit plus « poste non confirmé » quand aucune date n’a été observée', async () => {
    renderWithRouter(<ContactResultRow row={row({ provenance: { sourceTag: null, seenAt: null } })} />)
    await screen.findByText('Claire Mercier')
    expect(screen.queryByText(/non confirmé/i)).not.toBeInTheDocument()
  })

  it('dit la date SANS inventer de source quand la source n’est pas renseignée', async () => {
    renderWithRouter(
      <ContactResultRow row={row({ provenance: { sourceTag: null, seenAt: '2026-09-12T10:00:00Z' } })} />,
    )
    // La date est un FAIT : elle reste. La source absente ne s'écrit plus.
    expect(await screen.findByText(/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/non renseignée/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/source undefined|source null/i)).not.toBeInTheDocument()
  })

  it('dit la source quand elle EST connue — le renversement n’efface pas ce qu’on sait', async () => {
    renderWithRouter(
      <ContactResultRow row={row({ provenance: { sourceTag: 'PUBLIC', seenAt: '2026-09-12T10:00:00Z' } })} />,
    )
    expect(await screen.findByText(/source publique/i)).toBeInTheDocument()
  })
})

// #2150.37 — Découvrir > Contacts : la ligne convient DÉJÀ (row.id EST le
// contact canonique, `discover-contact-rows.ts:121` `id: item.id`) ; il ne lui
// manquait qu'une porte. On ouvre la MÊME fiche que partout ailleurs
// (`/contacts/$id`), jamais une copie locale.
describe('ContactResultRow — #2150.37, porte vers la fiche canonique', () => {
  it('ouvre `/contacts/$id` avec l’id de la ligne', async () => {
    renderWithRouter(<ContactResultRow row={row({ id: 'c-42' })} />)
    const link = await screen.findByRole('link', { name: 'Ouvrir la fiche' })
    expect(link.getAttribute('href')).toBe('/contacts/c-42')
  })

  // #3720.6 (retour bêta SKAIZen, Laura, 22/09) — « impossible d'ouvrir dans un
  // nouvel onglet depuis le tableau des contacts » : le bouton naviguait par
  // `onClick` + `navigate()`, pas de vrai `href` — ni clic droit, ni ctrl/cmd-
  // clic, ni clic molette ne proposaient « nouvel onglet ». Même famille de
  // correctif que #2719 (ContactTableRow) : un vrai `<a href>` rend ces gestes
  // natifs au navigateur.
  it('un vrai lien <a href> porte le clic droit / ctrl-clic / molette — pas un onClick seul', async () => {
    const { container } = renderWithRouter(<ContactResultRow row={row({ id: 'c-42' })} />)
    await screen.findByText('Claire Mercier')
    const link = container.querySelector('a[href="/contacts/c-42"]')
    expect(link).not.toBeNull()
    expect(link?.tagName).toBe('A')
  })
})

describe('ContactResultRow — G-FIX #4309', () => {
  it('porte « Demander à Laura », toujours visible, avec le compte en portée', async () => {
    renderWithRouter(<ContactResultRow row={row({ accountId: 'acc-9' })} />)
    const button = await screen.findByTestId('ask-laura')
    expect(button).toHaveTextContent(/demander à laura/i)
    expect(button).toHaveAttribute('data-always', 'true')
    expect(button).toHaveAttribute('data-account', 'acc-9')
  })
})
