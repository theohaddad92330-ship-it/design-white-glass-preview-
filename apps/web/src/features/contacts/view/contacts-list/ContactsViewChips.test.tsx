import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CONTACT_VIEWS, groupByContactView } from '@bellum/contracts'
import { ContactsViewChips } from './ContactsViewChips'

/**
 * Les cinq vues de `/contacts` (§37). Le module qui les calcule existait,
 * testé, exporté — et aucun de ses sept exports n'était prononcé dans `apps/`.
 * Ces tests vérifient les deux choses qu'un branchement peut rater : que les
 * cinq soient bien LÀ, et qu'aucun compteur n'affirme plus que ce qu'on sait.
 */
function renderChips(overrides: Partial<Parameters<typeof ContactsViewChips>[0]> = {}) {
  const props = {
    counts: { to_contact: 4, to_enrich: 3, to_verify: 2, known: 1, hidden: 0 },
    value: 'all' as const,
    onChange: vi.fn(),
    loadedTotal: 10,
    ...overrides,
  }
  render(<ContactsViewChips {...props} />)
  return props
}

describe('ContactsViewChips — les cinq vues sont montées', () => {
  it('rend les cinq vues du contrat, pas une liste réécrite ici', () => {
    // Le corpus n'est pas vide, et il vient de CONTACT_VIEWS : si le contrat
    // gagne une vue, ce test la réclame au lieu de rester vert sur quatre.
    expect(CONTACT_VIEWS).toHaveLength(5)
    renderChips()
    for (const label of ['À contacter', 'À enrichir', 'À vérifier', 'Déjà connus', 'Masqués']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('remonte la vue choisie à l’appelant', async () => {
    const props = renderChips()
    await userEvent.click(screen.getByRole('button', { name: /À enrichir/ }))
    expect(props.onChange).toHaveBeenCalledWith('to_enrich')
  })

  it('chaque vue se tabule et s’annonce comme sélectionnée', () => {
    renderChips({ value: 'to_contact' })
    expect(screen.getByRole('button', { name: /À contacter/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /À enrichir/ })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('ContactsViewChips — un compteur n’affirme jamais plus qu’on ne sait', () => {
  it('affiche les compteurs quand tout est chargé', () => {
    renderChips()
    expect(screen.getByRole('button', { name: /À contacter\s*4/ })).toBeInTheDocument()
  })

  it('n’affiche AUCUN compteur tant qu’il reste une page à charger', () => {
    // Une page de 25 sur un stock de 210 annoncerait « À enrichir 12 » pour
    // 12-sur-25 : le même défaut que les pastilles de cycle de vie ont payé.
    renderChips({ counts: undefined, loadedTotal: undefined })
    expect(screen.getByRole('button', { name: /^À contacter$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /À contacter\s*\d/ })).not.toBeInTheDocument()
  })

  it('« Masqués » ne porte JAMAIS de compteur — même chargé, même à zéro', () => {
    // `GET /contacts` filtre `hidden = false` en SQL : « 0 » se lirait « tu n'as
    // rien masqué », ce que la donnée n'autorise pas à conclure.
    renderChips({ counts: { to_contact: 4, to_enrich: 3, to_verify: 2, known: 1, hidden: 0 } })
    expect(screen.getByRole('button', { name: /^Masqués$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Masqués\s*0/ })).not.toBeInTheDocument()
  })

  it('#3483.2 — ne redit JAMAIS la raison de « Masqués » : elle vit une fois, dans l’état vide de la liste', () => {
    renderChips({ value: 'hidden' })
    expect(screen.queryByText(/ne sont pas renvoyés par cette liste/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/non mesuré/i)).not.toBeInTheDocument()
  })
})

describe('groupByContactView — la répartition vient du contrat', () => {
  it('range chaque contact dans une seule vue, sans en perdre', () => {
    const rows = [
      { id: '1', full_name: 'A', email: 'a@x.fr' },
      { id: '2', full_name: 'B' },
      { id: '3', full_name: null },
      { id: '4', full_name: 'D', user_status: 'replied' },
    ]
    const groups = groupByContactView(rows)
    expect(Object.values(groups).flat()).toHaveLength(rows.length)
    expect(groups.to_contact.map(c => c.id)).toEqual(['1'])
    expect(groups.to_enrich.map(c => c.id)).toEqual(['2'])
    expect(groups.to_verify.map(c => c.id)).toEqual(['3'])
    // `user_status` est ce que la LISTE transporte — pas `email_sent_at`.
    expect(groups.known.map(c => c.id)).toEqual(['4'])
  })
})

/**
 * #1418 — « plusieurs Tous / Toutes se ressemblent sans qu'on comprenne
 * immédiatement ce qu'ils filtrent ».
 *
 * ⚠️ La réponse EXISTAIT — `ariaLabel` porte « Filtrer par vue » et « Filtrer
 * par état du contact » — mais elle n'était dite qu'aux lecteurs d'écran. Deux
 * rangées se suivaient à 48 px, chacune ouvrant sur « Toutes » puis « Tous », et
 * ceux qui VOIENT l'écran n'avaient pas droit à l'information.
 */
describe('la dimension filtrée est écrite, pas seulement annoncée', () => {
  it('affiche le nom de la dimension à l’écran', () => {
    renderChips()
    expect(screen.getByText('État de travail')).toBeInTheDocument()
  })
})
