/**
 * #3499 — les trois cartes du haut de la synthèse (décision 1.c) : au plus
 * trois, chacune SEULEMENT quand sa donnée existe, jamais un « non mesuré ».
 */
import type { Contact, RecentSignal } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DossierReadView } from '../evaluation/dossierReadViewData'
import { AccountSynthesisCards } from './AccountSynthesisCards'

const ranking = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({ useContactRanking: () => ranking }))

const CONTACTS = [{ id: 'c1', full_name: 'Alice Martin', title: 'DSI' }] as unknown as Contact[]
const SIGNAL = {
  signal: 'Nomination d’un nouveau DSI groupe',
  source: 'Communiqué du groupe',
  date: '2026-09-12',
  sales_implication: 'Un nouveau DSI revoit ses prestataires dans les six mois.',
} as RecentSignal

function read(over: Partial<DossierReadView>): DossierReadView {
  return { bestEntryPoint: null, nextAction: null, ...over } as DossierReadView
}

describe('#3499 — AccountSynthesisCards', () => {
  it('(a) les trois cartes quand la donnée existe : quoi, d’où, quoi faire', () => {
    ranking.data = {
      ranked: [{ contact_id: 'c1', position: 1, explanation: { who: { measured: false, code: 'x' } } }],
      total: 1,
    }
    render(
      <AccountSynthesisCards
        accountId="a"
        contacts={CONTACTS}
        signals={[SIGNAL]}
        dossierRead={read({ bestEntryPoint: { label: null, targetProfile: null, why: 'Il pilote le programme.' } })}
        immediateActionLabel="Appeler la DSI pour présenter l’offre cloud"
        onTabChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('synthesis-card-signal').textContent).toContain('Nomination')
    expect(screen.getByTestId('synthesis-card-signal').textContent).toContain('Communiqué du groupe')
    expect(screen.getByTestId('synthesis-card-signal').textContent).toContain('six mois')
    expect(screen.getByTestId('synthesis-card-entry').textContent).toContain('Alice Martin')
    expect(screen.getByTestId('synthesis-card-entry').textContent).toContain('Il pilote le programme.')
    expect(screen.getByTestId('synthesis-card-action').textContent).toContain('Appeler la DSI')
    expect(screen.getAllByRole('button')).toHaveLength(3)
    // #3720 (Louis 10/10, tranché) — la carte vivante s'appelle « Prochaine action » / « Préparer » ;
    // « Ce que je ferais maintenant » / « Y aller » (ancienne carte, supprimée) ne reviennent pas.
    const action = screen.getByTestId('synthesis-card-action')
    expect(action.textContent).toContain('Prochaine action')
    expect(action.textContent).toContain('Préparer')
    expect(action.textContent).not.toContain('Ce que je ferais maintenant')
    expect(action.textContent).not.toContain('Y aller')
  })

  // #3925 — recette démo SNCF 10/10 : « Offre publiée sur la page carrières » n'avait aucun lien
  // « Voir l'offre » sur la Synthèse (le signal portait pourtant son URL et son genre).
  it('#3925 — le signal principal porte son lien, VISIBLE sur la carte : le site d’origine et ↗ (Théo A, 22/10)', () => {
    ranking.data = undefined
    const offer = {
      signal: 'Offre publiée sur la page carrières : Architecte cloud — Saint-Denis',
      source: 'Page carrières du groupe',
      date: '2026-10-02',
      url: 'https://example.org/demo/job/sncf-architecte-cloud',
      source_kind: 'job',
    } as RecentSignal
    const { unmount } = render(
      <AccountSynthesisCards
        accountId="a"
        contacts={[]}
        signals={[offer]}
        dossierRead={null}
        immediateActionLabel={null}
        onTabChange={vi.fn()}
      />,
    )
    const link = screen.getByRole('link', { name: 'Ouvrir la source : example.org' })
    expect(link.getAttribute('href')).toBe('https://example.org/demo/job/sncf-architecte-cloud')
    unmount()
    render(
      <AccountSynthesisCards
        accountId="a"
        contacts={[]}
        signals={[
          { ...offer, signal: 'Levée de fonds', url: 'https://example.org/demo/press/x', source_kind: 'press' },
        ]}
        dossierRead={null}
        immediateActionLabel={null}
        onTabChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: 'Ouvrir la source : example.org' })).toHaveAttribute(
      'href',
      'https://example.org/demo/press/x',
    )
  })

  // #3720.1 (recette MO 10/10) — J08 avait réparé l'ancienne clé d'onglet dans l'ancienne carte (supprimée, #3720 RAJ),
  // que personne n'affichait plus (#3499 l'a remplacée par cette carte) : ici, `TAB_KEYS.find` jetait encore
  // `programs` et le bouton retombait en silence sur « plan ».
  it.each([
    ['programs', 'veille'],
    ['signaux', 'veille'],
    ['score', 'evaluation'],
    ['contacts', 'contacts'],
  ])('#3720.1 — une suggestion enregistrée sur l’ancien onglet « %s » ouvre « %s »', (stored, expected) => {
    ranking.data = undefined
    const onTabChange = vi.fn()
    render(
      <AccountSynthesisCards
        accountId="a"
        contacts={[]}
        signals={[]}
        dossierRead={read({
          nextAction: { label: 'Identifier la filiale', tab: stored } as DossierReadView['nextAction'],
        })}
        immediateActionLabel={null}
        onTabChange={onTabChange}
      />,
    )
    screen.getByRole('button').click()
    expect(onTabChange).toHaveBeenCalledWith(expected)
  })

  it('(d) SAIT DIRE NON — une carte sans donnée ne s’affiche pas, ni « non mesuré » ni « non renseigné »', () => {
    ranking.data = undefined
    const { container } = render(
      <AccountSynthesisCards
        accountId="a"
        contacts={CONTACTS}
        signals={[{ signal: '' } as RecentSignal]}
        dossierRead={null}
        immediateActionLabel="Appeler la DSI"
        onTabChange={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('synthesis-card-signal')).not.toBeInTheDocument()
    // Un contact pris au hasard n'est pas « la meilleure porte » : sans classement ni lecture, pas de carte.
    expect(screen.queryByTestId('synthesis-card-entry')).not.toBeInTheDocument()
    expect(screen.getByTestId('synthesis-card-action')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/non mesur|non renseign|inconnu/i)
  })

  it('#3817.2 — source injoignable : la carte signal le nomme, jamais « aucun signal »', () => {
    ranking.data = undefined
    render(
      <AccountSynthesisCards
        accountId="a"
        contacts={[]}
        signals={[]}
        signalCoverage={{ status: 'incomplete', unreachable: [{ source: 'france_travail', reason: 'timeout' }] }}
        dossierRead={null}
        immediateActionLabel={null}
        onTabChange={vi.fn()}
      />,
    )
    const card = screen.getByTestId('synthesis-card-signal')
    expect(card.textContent).toMatch(/Recherche incomplète : offres d'emploi/)
    expect(card.textContent).not.toMatch(/aucun signal/i)
  })

  it('#3817.2 — zéro signal, sources toutes consultées : la carte signal reste absente (doctrine liste)', () => {
    ranking.data = undefined
    const { container } = render(
      <AccountSynthesisCards
        accountId="a"
        contacts={[]}
        signals={[]}
        signalCoverage={{ status: 'none_found' }}
        dossierRead={null}
        immediateActionLabel={null}
        onTabChange={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('synthesis-card-signal')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/non mesur|non renseign|inconnu/i)
  })

  it('rien à dire du tout : aucune rangée de cartes', () => {
    ranking.data = undefined
    const { container } = render(
      <AccountSynthesisCards
        accountId="a"
        contacts={[]}
        signals={[]}
        dossierRead={null}
        immediateActionLabel={null}
        onTabChange={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('(#3499) la date ISO d’un signal se lit formatée, jamais brute', () => {
    ranking.data = undefined
    const iso = { ...SIGNAL, date: '2026-09-25T14:32:52.000+0000' } as RecentSignal
    render(
      <AccountSynthesisCards
        accountId="a1"
        contacts={CONTACTS}
        signals={[iso]}
        dossierRead={null}
        immediateActionLabel={null}
        onTabChange={() => {}}
      />,
    )
    expect(screen.queryByText(/2026-09-25T/)).not.toBeInTheDocument()
    expect(screen.getByText(/Communiqué du groupe · 25 sept\.? 2026/)).toBeInTheDocument()
  })

  it('(#3499) mobile : aucune carte ne force une largeur > conteneur (min-w-0, texte qui casse)', () => {
    ranking.data = undefined
    render(
      <AccountSynthesisCards
        accountId="a1"
        contacts={CONTACTS}
        signals={[SIGNAL]}
        dossierRead={read({ nextAction: { label: 'Appeler', tab: 'plan' } as DossierReadView['nextAction'] })}
        immediateActionLabel={null}
        onTabChange={() => {}}
      />,
    )
    const grid = screen.getByTestId('synthesis-cards')
    expect(grid.className).toContain('grid-cols-1')
    for (const card of Array.from(grid.children)) {
      expect(card.className).toContain('min-w-0')
      expect(card.className).toContain('max-w-full')
    }
    expect(screen.getByText(SIGNAL.signal as string).className).toContain('break-words')
  })
})

// #4324.3 (DHL, 26/10) — « meilleure porte d'entrée » désignait quelqu'un ABSENT de l'onglet Contacts : deux vues,
// deux populations. Quand l'écart existe, il est NOMMÉ à l'écran ; quand il n'existe pas, rien n'est ajouté.
describe('#4324.3 — la porte d’entrée dit si la personne est absente de l’onglet Contacts', () => {
  const renderEntry = (label: string | null) =>
    render(
      <AccountSynthesisCards
        accountId="a"
        contacts={CONTACTS}
        signals={[]}
        dossierRead={read({ bestEntryPoint: { label, targetProfile: null, why: 'Elle ouvre le comité.' } })}
        immediateActionLabel={null}
        onTabChange={vi.fn()}
      />,
    )

  it('un nom du dossier qu’aucun contact ne porte : l’écart est nommé', () => {
    ranking.data = { ranked: [], total: 0 }
    renderEntry('Caroline Delarue')
    const card = screen.getByTestId('synthesis-card-entry')
    expect(card.textContent).toContain('Caroline Delarue')
    expect(screen.getByTestId('synthesis-entry-gap').textContent).toContain('pas dans l’onglet Contacts')
  })

  it('SAIT DIRE NON : un nom que l’onglet Contacts porte ne déclenche aucun écart', () => {
    ranking.data = { ranked: [], total: 0 }
    renderEntry('Alice Martin')
    expect(screen.queryByTestId('synthesis-entry-gap')).not.toBeInTheDocument()
  })

  it('un contact classé mais masqué est nommé comme masqué', () => {
    ranking.data = {
      ranked: [{ contact_id: 'c1', position: 1, explanation: { who: { measured: false, code: 'x' } } }],
      total: 1,
    }
    render(
      <AccountSynthesisCards
        accountId="a"
        contacts={[{ ...CONTACTS[0], hidden: true } as unknown as Contact]}
        signals={[]}
        dossierRead={read({})}
        immediateActionLabel={null}
        onTabChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('synthesis-entry-gap').textContent).toContain('masqué')
  })
})
